import uuid
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.accounts.permissions import IsITAgent, IsITManager
from apps.audit.models import AuditLog
from .models import AccessRequest
from .serializers import (
    AccessRequestListSerializer,
    AccessRequestDetailSerializer,
    AccessRequestCreateSerializer,
    ManagerApprovalSerializer,
    ITAssignmentSerializer,
)
from .emails import (
    send_manager_approval_email,
    send_approval_result_email,
    send_assignment_complete_email,
)


class AccessRequestListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/access-requests/ — users see their own; IT agents and above see all.
    POST /api/access-requests/ — authenticated users submit a new request.
    """

    def get_queryset(self):
        user = self.request.user
        role = user.role_name if hasattr(user, 'role_name') else (
            user.role.name if user.role else ''
        )

        # Privileged roles see all requests unless my_requests=true is passed.
        my_requests = self.request.query_params.get('my_requests', '').lower() in ('1', 'true')
        if role in ('it_agent', 'it_manager', 'super_admin', 'auditor') and not my_requests:
            qs = AccessRequest.objects.all()
        else:
            qs = AccessRequest.objects.filter(requested_by=user)

        # Optional filters
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        request_type_filter = self.request.query_params.get('request_type')
        if request_type_filter:
            qs = qs.filter(request_type=request_type_filter)

        return qs.select_related(
            'requested_by', 'hardware_asset', 'software_license', 'assigned_by'
        )

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AccessRequestCreateSerializer
        return AccessRequestListSerializer

    def perform_create(self, serializer):
        ar = serializer.save(requested_by=self.request.user)
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='access_requests',
            record_id=ar.pk,
            record_repr=str(ar),
            ip_address=getattr(self.request, 'audit_ip', self.request.META.get('REMOTE_ADDR')),
        )
        send_manager_approval_email(ar)


class AccessRequestDetailView(generics.RetrieveAPIView):
    """GET /api/access-requests/{id}/"""
    serializer_class = AccessRequestDetailSerializer

    def get_queryset(self):
        user = self.request.user
        role = user.role_name if hasattr(user, 'role_name') else (
            user.role.name if user.role else ''
        )
        if role in ('it_agent', 'it_manager', 'super_admin', 'auditor'):
            return AccessRequest.objects.all()
        return AccessRequest.objects.filter(requested_by=user)


class ManagerReviewView(APIView):
    """
    GET  /api/access-requests/review/{id}/?token={token}
         Public: returns request details for the manager to review.
    POST /api/access-requests/review/{id}/?token={token}
         Public: approve or reject the request.
    No authentication required — uses the UUID token from the email link.
    """
    permission_classes = [permissions.AllowAny]

    def _get_pending_request(self, request_id, token):
        """Return the AccessRequest only if the token matches and status is pending."""
        try:
            token_uuid = uuid.UUID(str(token))
        except (ValueError, AttributeError):
            return None
        return AccessRequest.objects.filter(
            id=request_id,
            approval_token=token_uuid,
            status=AccessRequest.PENDING_MANAGER,
        ).first()

    def get(self, request, pk):
        token = request.query_params.get('token')
        ar = self._get_pending_request(pk, token)

        if not ar:
            # Return a minimal response even if the request has already been reviewed.
            try:
                ar = AccessRequest.objects.get(id=pk)
                return Response({
                    'ref_number': ar.ref_number,
                    'status': ar.status,
                    'status_display': ar.get_status_display(),
                    'already_reviewed': ar.status != AccessRequest.PENDING_MANAGER,
                })
            except AccessRequest.DoesNotExist:
                return Response({'detail': 'Invalid or expired link.'}, status=404)

        requester = ar.requested_by
        return Response({
            'id': str(ar.id),
            'ref_number': ar.ref_number,
            'request_type': ar.request_type,
            'type_display': ar.get_request_type_display(),
            'status': ar.status,
            'already_reviewed': False,
            'requester_name': requester.full_name,
            'requester_email': requester.email,
            'justification': ar.justification,
            'hardware_type': ar.hardware_type,
            'hardware_specification': ar.hardware_specification,
            'software_name': ar.software_name,
            'manager_name': ar.manager_name,
            'created_at': ar.created_at.isoformat(),
        })

    def post(self, request, pk):
        token = request.query_params.get('token')
        ar = self._get_pending_request(pk, token)
        if not ar:
            return Response(
                {'detail': 'Invalid, expired, or already-reviewed link.'},
                status=400,
            )

        serializer = ManagerApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data['action']
        notes = serializer.validated_data['notes']

        ar.manager_notes = notes
        ar.approved_at = timezone.now()
        ar.status = (
            AccessRequest.PENDING_ASSIGNMENT
            if action == 'approve'
            else AccessRequest.MANAGER_REJECTED
        )
        ar.save(update_fields=['status', 'manager_notes', 'approved_at'])

        AuditLog.log(
            user=None,
            action=AuditLog.UPDATE,
            module='access_requests',
            record_id=ar.pk,
            record_repr=f'{ar.ref_number} {action}d by manager',
            new_value={'action': action, 'notes': notes},
        )
        send_approval_result_email(ar)
        return Response({
            'detail': f'Request {ar.ref_number} has been {action}d.',
            'status': ar.status,
        })


class ITAssignmentView(APIView):
    """POST /api/access-requests/{id}/assign/ — IT agent assigns hardware or software."""
    permission_classes = [IsITAgent]

    def post(self, request, pk):
        ar = get_object_or_404(AccessRequest, pk=pk, status=AccessRequest.PENDING_ASSIGNMENT)
        serializer = ITAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if ar.request_type == AccessRequest.HARDWARE:
            hw_id = serializer.validated_data.get('hardware_asset_id')
            if not hw_id:
                return Response(
                    {'detail': 'hardware_asset_id is required for hardware assignments.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from apps.assets.models import HardwareAsset
            asset = get_object_or_404(HardwareAsset, id=hw_id)
            # Assign asset to requestor
            asset.assigned_to = ar.requested_by
            asset.save(update_fields=['assigned_to'])
            ar.hardware_asset = asset

        else:  # software
            sw_id = serializer.validated_data.get('software_license_id')
            if not sw_id:
                return Response(
                    {'detail': 'software_license_id is required for software assignments.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from apps.software.models import SoftwareLicense, SoftwareInstallation
            from django.utils import timezone as tz
            license_obj = get_object_or_404(SoftwareLicense, id=sw_id, is_active=True)

            # ── Seat availability check ──────────────────────────────────────
            if license_obj.seats_used >= license_obj.seat_count:
                return Response(
                    {'detail': f'No seats available for "{license_obj.name}". '
                               f'{license_obj.seat_count} licensed, '
                               f'{license_obj.seats_used} in use. '
                               f'Request additional seats first.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # ── Find the user's primary hardware asset (if any) ─────────────
            from apps.assets.models import HardwareAsset
            user_asset = HardwareAsset.objects.filter(
                assigned_to=ar.requested_by, is_archived=False
            ).first()

            # Create installation — decrements seats_available by 1.
            # hardware_asset is nullable: if user has no machine, we track
            # the seat against the user directly via assigned_user.
            SoftwareInstallation.objects.create(
                license=license_obj,
                hardware_asset=user_asset,      # may be None
                assigned_user=ar.requested_by,  # always set
                installed_on=tz.now().date(),
                installed_by=request.user,
                notes=f'Assigned via access request {ar.ref_number}',
            )
            ar.software_license = license_obj

        ar.assigned_by = request.user
        ar.assigned_at = timezone.now()
        ar.assignment_notes = serializer.validated_data.get('assignment_notes', '')
        ar.status = AccessRequest.ASSIGNED
        ar.save()

        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='access_requests',
            record_id=ar.pk,
            record_repr=f'{ar.ref_number} assigned',
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        send_assignment_complete_email(ar)
        return Response(AccessRequestDetailSerializer(ar).data)


class AccessRequestCancelView(APIView):
    """POST /api/access-requests/{id}/cancel/ — requestor or IT manager can cancel."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        ar = get_object_or_404(AccessRequest, pk=pk)

        is_manager = (
            hasattr(request.user, 'role')
            and request.user.role
            and request.user.role.name in ('it_manager', 'super_admin')
        )
        if ar.requested_by != request.user and not is_manager:
            return Response({'detail': 'Not permitted.'}, status=403)

        if ar.status == AccessRequest.ASSIGNED:
            return Response(
                {'detail': 'Cannot cancel an already-assigned request.'},
                status=400,
            )

        ar.status = AccessRequest.CANCELLED
        ar.save(update_fields=['status'])

        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='access_requests',
            record_id=ar.pk,
            record_repr=f'{ar.ref_number} cancelled',
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response({'detail': 'Request cancelled.'})
