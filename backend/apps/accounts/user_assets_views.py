"""
User asset management — view all assets assigned to a user and bulk-deallocate
on user offboarding.
"""
from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions

from apps.audit.models import AuditLog
from apps.accounts.permissions import IsITAgent, IsITManager
from .models import User


class UserAssetSummaryView(APIView):
    """
    GET /api/users/{id}/assets/
    Returns all hardware assets and software licenses currently assigned to a user.
    IT Agent+ only.
    """
    permission_classes = [IsITAgent]

    def get(self, request, user_id):
        user = get_object_or_404(User, id=user_id, is_active=True)

        # ── Hardware assets ───────────────────────────────────────────────────
        hardware = []
        try:
            from apps.assets.models import HardwareAsset
            assets = HardwareAsset.objects.filter(
                assigned_to=user, is_archived=False
            ).select_related('site')
            for a in assets:
                hardware.append({
                    'id': str(a.id),
                    'asset_tag': a.asset_tag,
                    'name': a.name,
                    'asset_type': a.get_asset_type_display(),
                    'status': a.status,
                    'acceptance_status': a.acceptance_status,
                    'site': a.site.name if a.site else None,
                    'location': a.location,
                    'url': f'/assets/hardware/{a.id}',
                })
        except Exception:
            pass

        # ── Software licenses (via SoftwareInstallation) ──────────────────────
        software = []
        try:
            from apps.software.models import SoftwareInstallation
            installs = SoftwareInstallation.objects.filter(
                assigned_user=user
            ).select_related('license')
            for inst in installs:
                software.append({
                    'installation_id': str(inst.id),
                    'license_id': str(inst.license.id),
                    'license_name': inst.license.name,
                    'vendor': inst.license.vendor,
                    'license_type': inst.license.get_license_type_display(),
                    'installed_on': str(inst.installed_on) if inst.installed_on else None,
                    'url': f'/assets/software',
                })
            # Also installations via hardware_asset assigned to this user
            hw_ids = [a['id'] for a in hardware]
            if hw_ids:
                hw_installs = SoftwareInstallation.objects.filter(
                    hardware_asset__id__in=hw_ids,
                    assigned_user__isnull=True,  # avoid duplicates
                ).select_related('license', 'hardware_asset')
                for inst in hw_installs:
                    software.append({
                        'installation_id': str(inst.id),
                        'license_id': str(inst.license.id),
                        'license_name': inst.license.name,
                        'vendor': inst.license.vendor,
                        'license_type': inst.license.get_license_type_display(),
                        'via_asset': inst.hardware_asset.asset_tag if inst.hardware_asset else None,
                        'installed_on': str(inst.installed_on) if inst.installed_on else None,
                        'url': f'/assets/software',
                    })
        except Exception:
            pass

        return Response({
            'user': {
                'id': str(user.id),
                'email': user.email,
                'full_name': user.full_name,
                'role': user.role.get_name_display() if user.role else None,
            },
            'hardware': hardware,
            'software': software,
            'hardware_count': len(hardware),
            'software_count': len(software),
            'total_assets': len(hardware) + len(software),
        })


class UserDeallocateAssetsView(APIView):
    """
    POST /api/users/{id}/deallocate-assets/
    Unassigns ALL hardware assets and removes ALL software installations for a user.
    Assets return to the unassigned pool and can be reallocated.
    IT Manager+ only.
    Body: {reason: str (optional), confirm: true}
    """
    permission_classes = [IsITManager]

    def post(self, request, user_id):
        user = get_object_or_404(User, id=user_id)
        reason = (request.data.get('reason') or 'User offboarding — assets deallocated').strip()
        confirm = request.data.get('confirm', False)

        if not confirm:
            # Return a preview of what will be deallocated
            from apps.assets.models import HardwareAsset
            from apps.software.models import SoftwareInstallation
            hw_count = HardwareAsset.objects.filter(assigned_to=user, is_archived=False).count()
            sw_count = SoftwareInstallation.objects.filter(assigned_user=user).count()
            return Response({
                'preview': True,
                'message': f'This will deallocate {hw_count} hardware asset(s) and '
                           f'{sw_count} software installation(s) from {user.email}.',
                'hardware_count': hw_count,
                'software_count': sw_count,
                'user': user.email,
            })

        deallocated_hw = []
        deallocated_sw = []

        with transaction.atomic():
            # ── Unassign hardware assets ─────────────────────────────────────
            try:
                from apps.assets.models import HardwareAsset
                assets = list(HardwareAsset.objects.filter(
                    assigned_to=user, is_archived=False
                ).select_related())
                for asset in assets:
                    deallocated_hw.append(asset.asset_tag)
                    asset.assigned_to = None
                    asset.acceptance_status = HardwareAsset.ACCEPTANCE_NONE
                    asset.save(update_fields=['assigned_to', 'acceptance_status'])
                    AuditLog.log(
                        user=request.user,
                        action=AuditLog.UPDATE,
                        module='assets',
                        record_id=asset.pk,
                        record_repr=f'{asset.asset_tag} deallocated from {user.email}',
                        new_value={'reason': reason},
                        ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
                    )
            except Exception as e:
                return Response({'detail': f'Failed to deallocate hardware: {e}'}, status=500)

            # ── Remove software installations ────────────────────────────────
            try:
                from apps.software.models import SoftwareInstallation
                installations = list(SoftwareInstallation.objects.filter(
                    assigned_user=user
                ).select_related('license'))
                for inst in installations:
                    deallocated_sw.append(inst.license.name)
                    inst.delete()
            except Exception as e:
                return Response({'detail': f'Failed to deallocate software: {e}'}, status=500)

        # ── Notify user ──────────────────────────────────────────────────────
        try:
            from apps.notifications.models import Notification
            if user.is_active:
                Notification.create(
                    user=user,
                    notification_type='access_rejected',
                    title='Your assigned assets have been deallocated',
                    body=f'Reason: {reason}',
                    url='/access-requests',
                )
        except Exception:
            pass

        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='accounts',
            record_id=user.pk,
            record_repr=f'All assets deallocated from {user.email}',
            new_value={
                'reason': reason,
                'hardware_deallocated': deallocated_hw,
                'software_deallocated': deallocated_sw,
            },
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )

        return Response({
            'detail': f'Successfully deallocated {len(deallocated_hw)} hardware asset(s) '
                      f'and {len(deallocated_sw)} software installation(s) from {user.email}.',
            'hardware_deallocated': deallocated_hw,
            'software_deallocated': deallocated_sw,
        })
