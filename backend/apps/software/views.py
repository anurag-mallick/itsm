import logging

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsITAgent, IsITManager
from apps.audit.mixins import AuditMixin
from apps.audit.models import AuditLog

from .models import SeatRequest, SoftwareInstallation, SoftwareLicense, SoftwareLicenseEvent
from .serializers import (
    SeatRequestSerializer,
    SoftwareInstallationSerializer,
    SoftwareLicenseCreateSerializer,
    SoftwareLicenseDetailSerializer,
    SoftwareLicenseEventSerializer,
    SoftwareLicenseListSerializer,
)

logger = logging.getLogger(__name__)


class SoftwareLicenseListCreateView(AuditMixin, generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsITAgent]
    audit_module = 'software'

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return SoftwareLicenseCreateSerializer
        return SoftwareLicenseListSerializer

    def get_queryset(self):
        qs = SoftwareLicense.objects.order_by('name')
        params = self.request.query_params
        if params.get('is_active') is not None:
            qs = qs.filter(is_active=params['is_active'].lower() == 'true')
        if params.get('license_type'):
            qs = qs.filter(license_type=params['license_type'])
        if params.get('search'):
            from django.db.models import Q
            search = params['search']
            qs = qs.filter(
                Q(name__icontains=search) | Q(vendor__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='software',
            record_id=instance.pk,
            record_repr=str(instance),
            new_value={'name': instance.name, 'license_type': instance.license_type},
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )


class SoftwareLicenseDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsITAgent]
    audit_module = 'software'

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return SoftwareLicenseCreateSerializer
        return SoftwareLicenseDetailSerializer

    def get_queryset(self):
        return SoftwareLicense.objects.prefetch_related(
            'installations__hardware_asset',
            'installations__installed_by',
        )

    def perform_update(self, serializer):
        old_data = SoftwareLicenseDetailSerializer(serializer.instance).data
        instance = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.UPDATE,
            module='software',
            record_id=instance.pk,
            record_repr=str(instance),
            old_value=dict(old_data),
            new_value=SoftwareLicenseDetailSerializer(instance).data,
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active'])
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.DELETE,
            module='software',
            record_id=instance.pk,
            record_repr=str(instance),
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )


class SoftwareInstallationListCreateView(AuditMixin, generics.ListCreateAPIView):
    serializer_class = SoftwareInstallationSerializer
    permission_classes = [permissions.IsAuthenticated, IsITAgent]
    audit_module = 'software'

    def _get_license(self):
        return get_object_or_404(SoftwareLicense, pk=self.kwargs['pk'])

    def get_queryset(self):
        license_obj = self._get_license()
        return SoftwareInstallation.objects.filter(
            license=license_obj
        ).select_related('hardware_asset', 'installed_by', 'license')

    def perform_create(self, serializer):
        license_obj = self._get_license()
        instance = serializer.save(license=license_obj)
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='software',
            record_id=instance.pk,
            record_repr=str(instance),
            new_value={
                'license': str(license_obj.pk),
                'hardware_asset': str(instance.hardware_asset.pk),
            },
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )


class SoftwareInstallationDetailView(AuditMixin, generics.RetrieveDestroyAPIView):
    serializer_class = SoftwareInstallationSerializer
    permission_classes = [permissions.IsAuthenticated, IsITAgent]
    audit_module = 'software'

    def get_queryset(self):
        return SoftwareInstallation.objects.select_related(
            'hardware_asset', 'installed_by', 'license'
        )

    def perform_destroy(self, instance):
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.DELETE,
            module='software',
            record_id=instance.pk,
            record_repr=str(instance),
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )
        instance.delete()


class ComplianceView(APIView):
    """GET /software/compliance/ — seat compliance report for all licenses."""

    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def get(self, request):
        from django.db.models import Count

        licenses = SoftwareLicense.objects.annotate(
            installations_count=Count('installations')
        ).order_by('name')

        data = []
        for lic in licenses:
            seats_used = lic.installations_count
            overage = max(0, seats_used - lic.seat_count)
            data.append(
                {
                    'id': str(lic.id),
                    'name': lic.name,
                    'vendor': lic.vendor,
                    'license_type': lic.license_type,
                    'seat_count': lic.seat_count,
                    'seats_used': seats_used,
                    'is_compliant': seats_used <= lic.seat_count,
                    'overage': overage,
                    'expiry_date': lic.expiry_date,
                    'is_active': lic.is_active,
                }
            )

        return Response(data)


class ExpiryAlertsView(generics.ListAPIView):
    """GET /software/expiry-alerts/ — licenses expiring within 90 days or already expired."""

    serializer_class = SoftwareLicenseListSerializer
    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def get_queryset(self):
        today = timezone.now().date()
        cutoff = today + timezone.timedelta(days=90)
        return SoftwareLicense.objects.filter(
            expiry_date__lte=cutoff,
            is_active=True,
        ).order_by('expiry_date')


# ── Timeline ──────────────────────────────────────────────────────────────────

class LicenseTimelineView(generics.ListAPIView):
    """GET /api/software/licenses/{pk}/timeline/ — all events for a license."""

    serializer_class = SoftwareLicenseEventSerializer
    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def get_queryset(self):
        return SoftwareLicenseEvent.objects.filter(license_id=self.kwargs['pk'])


# ── Assigned users ────────────────────────────────────────────────────────────

class LicenseAssignedUsersView(APIView):
    """GET /api/software/licenses/{pk}/assigned-users/ — users who have this software installed."""

    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def get(self, request, pk):
        installations = SoftwareInstallation.objects.filter(
            license_id=pk
        ).select_related('hardware_asset__assigned_to')

        result = []
        for inst in installations:
            asset = inst.hardware_asset
            if asset.assigned_to:
                result.append({
                    'user_id': str(asset.assigned_to.id),
                    'user_name': asset.assigned_to.full_name,
                    'user_email': asset.assigned_to.email,
                    'asset_tag': asset.asset_tag,
                    'asset_name': asset.name,
                    'installed_on': str(inst.installed_on) if inst.installed_on else None,
                })
            else:
                result.append({
                    'user_id': None,
                    'user_name': 'Unassigned',
                    'user_email': '',
                    'asset_tag': asset.asset_tag,
                    'asset_name': asset.name,
                    'installed_on': str(inst.installed_on) if inst.installed_on else None,
                })
        return Response(result)


# ── Seat requests ─────────────────────────────────────────────────────────────

class SeatRequestListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/software/seat-requests/ — list or create seat requests."""

    serializer_class = SeatRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def get_queryset(self):
        return SeatRequest.objects.select_related('requested_by', 'license').order_by('-created_at')

    def perform_create(self, serializer):
        sr = serializer.save(requested_by=self.request.user)
        SoftwareLicenseEvent.objects.create(
            license=sr.license,
            event_type=SoftwareLicenseEvent.SEAT_REQUESTED,
            description=(
                f'{sr.requested_by.full_name} requested {sr.seats_requested} '
                f'additional seat(s). Justification: {sr.justification}'
            ),
            new_value={'seats_requested': sr.seats_requested},
            actor_email=sr.requested_by.email,
        )


class SeatRequestApproveView(APIView):
    """POST /api/software/seat-requests/{pk}/approve/ — approve or reject a pending seat request."""

    permission_classes = [permissions.IsAuthenticated, IsITManager]

    def post(self, request, pk):
        sr = get_object_or_404(SeatRequest, pk=pk, status=SeatRequest.STATUS_PENDING)
        notes = request.data.get('notes', '')
        approve = request.data.get('approve', True)

        old_seats = sr.license.seat_count
        if approve:
            sr.license.seat_count += sr.seats_requested
            sr.license.save(update_fields=['seat_count'])
            sr.status = SeatRequest.STATUS_APPROVED
            SoftwareLicenseEvent.objects.create(
                license=sr.license,
                event_type=SoftwareLicenseEvent.SEAT_CHANGED,
                description=(
                    f'Seat count increased from {old_seats} to {sr.license.seat_count} '
                    f'(request approved by {request.user.full_name}).'
                ),
                old_value={'seat_count': old_seats},
                new_value={'seat_count': sr.license.seat_count},
                actor_email=request.user.email,
            )
        else:
            sr.status = SeatRequest.STATUS_REJECTED

        sr.reviewed_by = request.user
        sr.review_notes = notes
        sr.save()
        return Response(SeatRequestSerializer(sr).data)
