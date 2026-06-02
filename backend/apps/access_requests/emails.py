from django.core.mail import send_mail
from django.conf import settings
from .models import AccessRequest


def send_manager_approval_email(access_request):
    """Send approval request email to manager."""
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    approval_url = (
        f'{frontend_url}/access-requests/review/{access_request.id}'
        f'?token={access_request.approval_token}'
    )

    requester = access_request.requested_by
    what = (
        access_request.hardware_type
        if access_request.request_type == AccessRequest.HARDWARE
        else access_request.software_name
    )

    subject = f'[Action Required] Access Request {access_request.ref_number} — Approval Needed'
    body = f"""
Dear {access_request.manager_name or 'Manager'},

{requester.full_name} ({requester.email}) has submitted an access request that requires your approval.

Request: {access_request.ref_number}
Type: {access_request.get_request_type_display()}
Item requested: {what}
Justification: {access_request.justification}

To approve or reject this request, please click the link below:
{approval_url}

This link does not require a login.

Regards,
IT Service Desk
"""
    try:
        send_mail(
            subject, body,
            settings.DEFAULT_FROM_EMAIL,
            [access_request.manager_email],
            fail_silently=True,
        )
    except Exception:
        pass


def send_approval_result_email(access_request):
    """Notify requester of manager's decision."""
    requester = access_request.requested_by
    decision = 'approved' if access_request.status == AccessRequest.PENDING_ASSIGNMENT else 'rejected'
    subject = f'Your access request {access_request.ref_number} has been {decision}'
    body = f"""
Dear {requester.full_name},

Your access request {access_request.ref_number} has been {decision} by \
{access_request.manager_name or access_request.manager_email}.

{"IT team will now proceed with the assignment." if decision == "approved" else ""}
{"Manager notes: " + access_request.manager_notes if access_request.manager_notes else ""}

Regards,
IT Service Desk
"""
    try:
        send_mail(
            subject, body,
            settings.DEFAULT_FROM_EMAIL,
            [requester.email],
            fail_silently=True,
        )
    except Exception:
        pass

    # In-app notification
    try:
        from apps.notifications.models import Notification
        notif_type = (
            Notification.TYPE_ACCESS_APPROVED
            if decision == 'approved'
            else Notification.TYPE_ACCESS_REJECTED
        )
        Notification.create(
            user=requester,
            notification_type=notif_type,
            title=f'Access request {access_request.ref_number} {decision}',
            body=access_request.manager_notes or '',
            url=f'/access-requests/{access_request.id}',
        )
    except Exception:
        pass


def send_assignment_complete_email(access_request):
    """Notify requester that hardware or software has been assigned."""
    requester = access_request.requested_by
    if access_request.hardware_asset:
        what = access_request.hardware_asset.name
    elif access_request.software_license:
        what = access_request.software_license.name
    else:
        what = 'the requested item'

    subject = f'Your request {access_request.ref_number} has been fulfilled'
    body = f"""
Dear {requester.full_name},

Your access request {access_request.ref_number} has been completed.
{what} has been assigned to you.

{"Notes: " + access_request.assignment_notes if access_request.assignment_notes else ""}

Regards,
IT Service Desk
"""
    try:
        send_mail(
            subject, body,
            settings.DEFAULT_FROM_EMAIL,
            [requester.email],
            fail_silently=True,
        )
    except Exception:
        pass

    # In-app notification
    try:
        from apps.notifications.models import Notification
        Notification.create(
            user=requester,
            notification_type=Notification.TYPE_ACCESS_ASSIGNED,
            title=f'Access request {access_request.ref_number} fulfilled',
            body=f'{what} has been assigned to you.',
            url=f'/access-requests/{access_request.id}',
        )
    except Exception:
        pass
