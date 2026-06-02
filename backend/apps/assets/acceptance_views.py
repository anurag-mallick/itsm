"""Public and authenticated views for the asset acceptance workflow."""
import uuid

from django.conf import settings
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog

from .models import HardwareAsset


def _send_acceptance_email(asset):
    """Email the assigned user with an acceptance link."""
    if not asset.assigned_to:
        return
    user = asset.assigned_to
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    accept_url = f'{frontend_url}/assets/accept/{asset.id}?token={asset.acceptance_token}'
    send_mail(
        subject=f'Action Required: Accept hardware asset {asset.asset_tag}',
        message=(
            f'Dear {user.full_name},\n\n'
            f'The IT team has assigned the following hardware asset to you:\n\n'
            f'Asset Tag : {asset.asset_tag}\n'
            f'Name      : {asset.name}\n'
            f'Type      : {asset.get_asset_type_display()}\n\n'
            f'Please review and accept or reject this assignment within 5 business days:\n'
            f'{accept_url}\n\n'
            f'By accepting, you confirm receipt of this asset and agree to use it in '
            f'accordance with company policy.\n\n'
            f'IT Service Desk'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )


def _notify_agent(asset, accepted: bool):
    """Create in-app notifications for IT agents about the acceptance decision."""
    try:
        from apps.accounts.models import Role, User
        from apps.notifications.models import Notification

        agents = User.objects.filter(
            role__name__in=[Role.IT_AGENT, Role.IT_MANAGER, Role.SUPER_ADMIN],
            is_active=True,
        )
        action = 'accepted' if accepted else 'REJECTED'
        assigned_name = asset.assigned_to.full_name if asset.assigned_to else 'user'
        title = f'Asset {asset.asset_tag} {action} by {assigned_name}'
        notification_type = 'access_assigned' if accepted else 'access_rejected'
        for agent in agents[:20]:
            Notification.create(
                user=agent,
                notification_type=notification_type,
                title=title,
                body=f'{asset.name}',
                url=f'/assets/hardware/{asset.id}',
            )
    except Exception:
        pass


class AssetAcceptanceDetailView(APIView):
    """
    GET /api/assets/hardware/{pk}/accept/?token={token}

    Public endpoint — returns asset details for the acceptance page.
    No authentication required so users can visit from their email link.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        asset = get_object_or_404(HardwareAsset, pk=pk)
        try:
            token = uuid.UUID(str(request.query_params.get('token', '')))
        except (ValueError, AttributeError):
            return Response({'detail': 'Invalid link.'}, status=400)

        if asset.acceptance_token != token:
            return Response({'detail': 'Invalid or expired acceptance link.'}, status=400)

        return Response({
            'id': str(asset.id),
            'asset_tag': asset.asset_tag,
            'name': asset.name,
            'asset_type': asset.get_asset_type_display(),
            'status': asset.status,
            'acceptance_status': asset.acceptance_status,
            'already_actioned': asset.acceptance_status in (
                HardwareAsset.ACCEPTANCE_ACCEPTED,
                HardwareAsset.ACCEPTANCE_REJECTED,
            ),
            'assigned_to_name': asset.assigned_to.full_name if asset.assigned_to else None,
            'assigned_to_email': asset.assigned_to.email if asset.assigned_to else None,
        })


class AssetAcceptanceActionView(APIView):
    """
    POST /api/assets/hardware/{pk}/accept/action/?token={token}

    Public endpoint — user accepts or rejects the assignment.
    Body: { action: 'accept' | 'reject', notes: str }
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        asset = get_object_or_404(HardwareAsset, pk=pk)
        try:
            token = uuid.UUID(str(request.query_params.get('token', '')))
        except (ValueError, AttributeError):
            return Response({'detail': 'Invalid link.'}, status=400)

        if asset.acceptance_token != token:
            return Response({'detail': 'Invalid or expired acceptance link.'}, status=400)

        if asset.acceptance_status in (
            HardwareAsset.ACCEPTANCE_ACCEPTED,
            HardwareAsset.ACCEPTANCE_REJECTED,
        ):
            return Response({
                'detail': f'This assignment has already been {asset.acceptance_status}.',
                'acceptance_status': asset.acceptance_status,
            })

        action = request.data.get('action')
        notes = (request.data.get('notes') or '').strip()

        if action not in ('accept', 'reject'):
            return Response(
                {'detail': 'action must be "accept" or "reject".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        accepted = action == 'accept'

        asset.acceptance_status = (
            HardwareAsset.ACCEPTANCE_ACCEPTED if accepted else HardwareAsset.ACCEPTANCE_REJECTED
        )
        asset.accepted_at = timezone.now()
        asset.acceptance_notes = notes

        if not accepted:
            # Return asset to unassigned — IT team must reassign
            asset.assigned_to = None

        asset.save(update_fields=[
            'acceptance_status', 'accepted_at', 'acceptance_notes', 'assigned_to',
        ])

        user_label = asset.assigned_to.email if asset.assigned_to else 'the user'
        AuditLog.objects.create(
            user_email=user_label,
            action=AuditLog.UPDATE,
            module='assets',
            record_id=str(asset.pk),
            record_repr=f'{asset.asset_tag} assignment {asset.acceptance_status}',
            new_value={'action': action, 'notes': notes},
            ip_address=request.META.get('REMOTE_ADDR'),
        )

        _notify_agent(asset, accepted)

        return Response({
            'detail': (
                f'You have {"accepted" if accepted else "rejected"} '
                f'the assignment of {asset.asset_tag}.'
            ),
            'acceptance_status': asset.acceptance_status,
        })
