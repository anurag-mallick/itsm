import logging
import uuid

from django.conf import settings as django_settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import IsITAgent, IsITManager
from apps.audit.mixins import AuditMixin
from apps.audit.models import AuditLog

from .acceptance_views import _send_acceptance_email
from .models import AssetAuditLog, AssetStatusHistory, HardwareAsset, Site
from .qr_utils import generate_barcode_image, generate_qr_image
from .serializers import (
    ArchiveActionSerializer,
    AssetAuditLogSerializer,
    AssetStatusHistorySerializer,
    HardwareAssetCreateSerializer,
    HardwareAssetDetailSerializer,
    HardwareAssetListSerializer,
    SiteSerializer,
)

try:
    from django_filters.rest_framework import DjangoFilterBackend
except ImportError:
    DjangoFilterBackend = None

logger = logging.getLogger(__name__)


class HardwareAssetListCreateView(AuditMixin, generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsITAgent]
    audit_module = 'assets'

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return HardwareAssetCreateSerializer
        return HardwareAssetListSerializer

    def get_queryset(self):
        qs = HardwareAsset.objects.filter(is_archived=False).select_related('assigned_to', 'site').order_by('-created_at')
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('asset_type'):
            qs = qs.filter(asset_type=params['asset_type'])
        if params.get('assigned_to'):
            qs = qs.filter(assigned_to__email=params['assigned_to'])
        if params.get('site'):
            qs = qs.filter(site_id=params['site'])
        if params.get('search'):
            from django.db.models import Q
            search = params['search']
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(asset_tag__icontains=search)
                | Q(serial_number__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='assets',
            record_id=instance.pk,
            record_repr=str(instance),
            new_value=HardwareAssetDetailSerializer(instance).data,
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )


class HardwareAssetDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsITAgent]
    audit_module = 'assets'

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return HardwareAssetCreateSerializer
        return HardwareAssetDetailSerializer

    def get_queryset(self):
        return HardwareAsset.objects.select_related('assigned_to', 'site', 'archived_by').prefetch_related(
            'status_history__changed_by'
        )

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        old_data = HardwareAssetDetailSerializer(serializer.instance).data
        instance = serializer.save()

        # Create status history record when status changes
        new_status = instance.status
        if new_status != old_status:
            AssetStatusHistory.objects.create(
                asset=instance,
                old_status=old_status,
                new_status=new_status,
                changed_by=self.request.user,
                notes='Updated via asset detail endpoint.',
            )

        AuditLog.log(
            user=self.request.user,
            action=AuditLog.UPDATE,
            module='assets',
            record_id=instance.pk,
            record_repr=str(instance),
            old_value=dict(old_data),
            new_value=HardwareAssetDetailSerializer(instance).data,
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )

    def perform_destroy(self, instance):
        raise PermissionDenied('Hardware assets cannot be deleted. Change status to Disposed instead.')


class AssetStatusUpdateView(APIView):
    """POST /assets/hardware/{id}/status/ — update asset status and record history."""

    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def post(self, request, pk):
        asset = get_object_or_404(HardwareAsset, pk=pk)
        new_status = request.data.get('status')
        notes = request.data.get('notes', '')

        valid_statuses = [s[0] for s in HardwareAsset.STATUS_CHOICES]
        if not new_status or new_status not in valid_statuses:
            return Response(
                {'detail': f'status must be one of: {valid_statuses}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = asset.status
        if old_status == new_status:
            return Response(
                {'detail': 'Asset is already in that status.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        asset.status = new_status
        asset.save(update_fields=['status', 'updated_at'])

        history = AssetStatusHistory.objects.create(
            asset=asset,
            old_status=old_status,
            new_status=new_status,
            changed_by=request.user,
            notes=notes,
        )

        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='assets',
            record_id=asset.pk,
            record_repr=str(asset),
            field_name='status',
            old_value=old_status,
            new_value=new_status,
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )

        return Response(
            {
                'asset': HardwareAssetDetailSerializer(
                    asset, context={'request': request}
                ).data,
                'history_entry': AssetStatusHistorySerializer(history).data,
            }
        )


class AssetAssignView(APIView):
    """POST /assets/hardware/{id}/assign/ — assign or unassign a user."""

    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def post(self, request, pk):
        asset = get_object_or_404(HardwareAsset, pk=pk)
        user_id = request.data.get('user_id')

        old_assigned = asset.assigned_to

        if user_id is None or user_id == '':
            # Unassign — also reset acceptance state
            asset.assigned_to = None
            asset.acceptance_status = HardwareAsset.ACCEPTANCE_NONE
            asset.save(update_fields=['assigned_to', 'acceptance_status', 'updated_at'])
            new_assigned_repr = None
        else:
            try:
                new_user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return Response(
                    {'detail': 'User not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            asset.assigned_to = new_user
            asset.acceptance_status = HardwareAsset.ACCEPTANCE_PENDING
            asset.acceptance_token = uuid.uuid4()
            asset.save(update_fields=[
                'assigned_to', 'acceptance_status', 'acceptance_token', 'updated_at',
            ])
            new_assigned_repr = str(new_user.pk)

            # Send acceptance email to the assigned user
            _send_acceptance_email(asset)

            # Create in-app notification for the assignee
            try:
                from apps.notifications.models import Notification
                Notification.create(
                    user=new_user,
                    notification_type='access_assigned',
                    title=f'Hardware asset {asset.asset_tag} assigned to you',
                    body=(
                        f'{asset.name} has been assigned to you. '
                        f'Please check your email to accept or reject the assignment.'
                    ),
                    url=f'/assets/accept/{asset.id}?token={asset.acceptance_token}',
                )
            except Exception:
                pass

        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='assets',
            record_id=asset.pk,
            record_repr=str(asset),
            field_name='assigned_to',
            old_value=str(old_assigned.pk) if old_assigned else None,
            new_value=new_assigned_repr,
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )

        return Response(
            HardwareAssetDetailSerializer(asset, context={'request': request}).data
        )


class WarrantyExpiryListView(generics.ListAPIView):
    """GET /assets/hardware/warranty-alerts/ — assets with warranty expiring within 90 days."""

    serializer_class = HardwareAssetListSerializer
    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def get_queryset(self):
        today = timezone.now().date()
        cutoff = today + timezone.timedelta(days=90)
        return (
            HardwareAsset.objects.select_related('assigned_to', 'site')
            .filter(warranty_expiry__lte=cutoff, is_archived=False)
            .exclude(status__in=[HardwareAsset.RETIRED, HardwareAsset.DISPOSED])
            .order_by('warranty_expiry')
        )


# ---------------------------------------------------------------------------
# Archive views
# ---------------------------------------------------------------------------

class HardwareAssetArchiveView(APIView):
    """POST /api/assets/hardware/{pk}/archive/"""
    permission_classes = [IsITAgent]

    def post(self, request, pk):
        asset = get_object_or_404(HardwareAsset.all_records, pk=pk, is_archived=False)
        serializer = ArchiveActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['reason']

        asset.is_archived = True
        asset.archived_at = timezone.now()
        asset.archived_by = request.user
        asset.archive_reason = reason
        asset.save(update_fields=['is_archived', 'archived_at', 'archived_by', 'archive_reason'])

        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='assets',
            record_id=str(asset.pk),
            record_repr=f'{asset.asset_tag} archived',
            new_value={'archive_reason': reason},
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response({'detail': f'Asset {asset.asset_tag} archived.'})


class HardwareAssetUnarchiveView(APIView):
    """POST /api/assets/hardware/{pk}/unarchive/ — IT Manager only."""
    permission_classes = [IsITManager]

    def post(self, request, pk):
        asset = get_object_or_404(HardwareAsset.all_records, pk=pk, is_archived=True)
        serializer = ArchiveActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['reason']

        asset.is_archived = False
        asset.archived_at = None
        asset.archived_by = None
        asset.archive_reason = ''
        asset.save(update_fields=['is_archived', 'archived_at', 'archived_by', 'archive_reason'])

        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='assets',
            record_id=str(asset.pk),
            record_repr=f'{asset.asset_tag} unarchived',
            new_value={'unarchive_reason': reason},
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response({'detail': f'Asset {asset.asset_tag} restored from archive.'})


class ArchivedAssetListView(generics.ListAPIView):
    """GET /api/assets/hardware/archived/ — list archived hardware assets. IT Agent+ only."""
    serializer_class = HardwareAssetListSerializer
    permission_classes = [IsITAgent]
    filter_backends = [f for f in [DjangoFilterBackend, SearchFilter, OrderingFilter] if f is not None]
    search_fields = ['asset_tag', 'name', 'serial_number']
    ordering = ['-archived_at']

    def get_queryset(self):
        return HardwareAsset.archived.select_related('site', 'assigned_to', 'archived_by').all()


# ---------------------------------------------------------------------------
# Site views
# ---------------------------------------------------------------------------

class SiteListCreateView(AuditMixin, generics.ListCreateAPIView):
    queryset = Site.objects.filter(is_active=True)
    serializer_class = SiteSerializer
    audit_module = 'assets'

    def get_permissions(self):
        return [permissions.IsAuthenticated()] if self.request.method == 'GET' else [IsITManager()]


class SiteDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Site.objects.all()
    serializer_class = SiteSerializer
    audit_module = 'assets'
    permission_classes = [IsITManager]


class AssetQRView(APIView):
    """GET /api/assets/hardware/{pk}/qr/ — returns QR code and barcode images as base64."""
    permission_classes = [IsITAgent]

    def get(self, request, pk):
        asset = get_object_or_404(HardwareAsset, pk=pk)
        frontend_url = django_settings.FRONTEND_URL.rstrip('/')
        qr_url = f'{frontend_url}/scan/{asset.qr_token}'
        return Response({
            'qr_image': generate_qr_image(qr_url),
            'barcode_image': generate_barcode_image(asset.asset_tag),
            'qr_url': qr_url,
            'asset_tag': asset.asset_tag,
        })


class ScanAssetView(APIView):
    """GET /api/scan/{token}/ — public endpoint, returns asset info for the scan landing page."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        asset = get_object_or_404(HardwareAsset, qr_token=token)
        data = {
            'id': str(asset.id),
            'asset_tag': asset.asset_tag,
            'name': asset.name,
            'asset_type': asset.asset_type,
            'status': asset.status,
            'location': asset.location,
            'site': SiteSerializer(asset.site).data if asset.site else None,
            'assigned_to': {
                'full_name': asset.assigned_to.full_name,
                'email': asset.assigned_to.email,
            } if asset.assigned_to else None,
            'warranty_status': asset.warranty_status,
            'warranty_expiry': str(asset.warranty_expiry) if asset.warranty_expiry else None,
        }
        return Response(data)


class ScanActionView(APIView):
    """POST /api/scan/{token}/action/ — authenticated action from a scan landing page."""

    def post(self, request, token):
        asset = get_object_or_404(HardwareAsset, qr_token=token)
        action = request.data.get('action')
        notes = request.data.get('notes', '')

        if action == 'confirm_audit':
            log = AssetAuditLog.objects.create(
                asset=asset,
                confirmed_by=request.user,
                location_note=notes,
            )
            AuditLog.log(
                user=request.user,
                action=AuditLog.UPDATE,
                module='assets',
                record_id=asset.pk,
                record_repr=f'Audit confirmed: {asset.asset_tag}',
                ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
            )
            return Response({'audit_log_id': str(log.id), 'confirmed_at': log.confirmed_at.isoformat()})

        elif action in ('report_issue', 'request_assignment'):
            from apps.tickets.models import Ticket, Category, TicketCounter
            subject_map = {
                'report_issue': f'Issue reported for {asset.asset_tag}: {asset.name}',
                'request_assignment': f'Assignment request for {asset.asset_tag}: {asset.name}',
            }
            ticket = Ticket(
                subject=subject_map[action],
                description=notes or f'Raised via QR scan for asset {asset.asset_tag}.',
                source='portal',
                requestor=request.user,
                priority='medium',
                custom_fields={'asset_id': str(asset.id), 'asset_tag': asset.asset_tag},
            )
            ticket.save()
            from apps.tickets.tasks import send_ticket_notification
            send_ticket_notification.delay(str(ticket.id), 'created')
            return Response({'ticket_id': str(ticket.id), 'ticket_number': ticket.ticket_number})

        return Response({'detail': 'Invalid action.'}, status=400)


class AssetAuditLogListView(generics.ListAPIView):
    serializer_class = AssetAuditLogSerializer
    permission_classes = [IsITAgent]

    def get_queryset(self):
        return AssetAuditLog.objects.filter(asset_id=self.kwargs['pk']).select_related('confirmed_by')
