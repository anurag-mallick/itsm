import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Email HTML template (inline — no file template dependency)
# ---------------------------------------------------------------------------

_BASE_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: Arial, sans-serif; font-size: 14px; color: #333; margin: 0; padding: 0; }}
    .container {{ max-width: 600px; margin: 30px auto; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }}
    .header {{ background: #1a56db; color: #fff; padding: 20px 24px; }}
    .header h2 {{ margin: 0; font-size: 18px; }}
    .body {{ padding: 24px; }}
    .field {{ margin-bottom: 10px; }}
    .label {{ font-weight: bold; color: #555; width: 140px; display: inline-block; }}
    .badge {{ display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px;
               font-weight: bold; background: #e5e7eb; color: #374151; }}
    .badge-open {{ background: #dbeafe; color: #1e40af; }}
    .badge-in_progress {{ background: #fef3c7; color: #92400e; }}
    .badge-resolved {{ background: #d1fae5; color: #065f46; }}
    .badge-closed {{ background: #f3f4f6; color: #6b7280; }}
    .badge-critical {{ background: #fee2e2; color: #991b1b; }}
    .badge-high {{ background: #fef3c7; color: #92400e; }}
    .comment-box {{ background: #f9fafb; border-left: 4px solid #1a56db; padding: 12px 16px; margin-top: 16px; }}
    .footer {{ background: #f9fafb; padding: 14px 24px; font-size: 12px; color: #9ca3af;
               border-top: 1px solid #ddd; }}
    .btn {{ display: inline-block; margin-top: 16px; padding: 10px 20px; background: #1a56db;
             color: #fff; text-decoration: none; border-radius: 4px; font-size: 14px; }}
  </style>
</head>
<body>
<div class="container">
  <div class="header"><h2>{header_title}</h2></div>
  <div class="body">
    <p>Hello {requestor_name},</p>
    <p>{event_message}</p>
    <div class="field"><span class="label">Ticket #:</span> {ticket_number}</div>
    <div class="field"><span class="label">Subject:</span> {subject}</div>
    <div class="field"><span class="label">Status:</span>
      <span class="badge badge-{status}">{status_display}</span></div>
    <div class="field"><span class="label">Priority:</span>
      <span class="badge badge-{priority}">{priority_display}</span></div>
    <div class="field"><span class="label">Category:</span> {category}</div>
    <div class="field"><span class="label">Assigned to:</span> {assignee}</div>
    {sla_section}
    {comment_section}
    <a class="btn" href="{ticket_url}">View Ticket</a>
  </div>
  <div class="footer">
    This email was sent by the {org_name} IT Help Desk.
    Reply to this email to add a comment to the ticket.
  </div>
</div>
</body>
</html>
"""

_EVENT_MESSAGES = {
    'created': 'Your support ticket has been created successfully. Our team will review it shortly.',
    'assigned': 'Your ticket has been assigned to an agent who will be in touch with you soon.',
    'commented': 'A new reply has been added to your ticket.',
    'status_changed': 'The status of your ticket has been updated.',
    'resolved': 'Your ticket has been marked as resolved. If the issue persists, please reply to reopen it.',
    'closed': 'Your ticket has been closed. Thank you for contacting the IT Help Desk.',
}

_EVENT_HEADERS = {
    'created': 'Ticket Created',
    'assigned': 'Ticket Assigned',
    'commented': 'New Reply on Your Ticket',
    'status_changed': 'Ticket Status Updated',
    'resolved': 'Ticket Resolved',
    'closed': 'Ticket Closed',
}


def _get_reply_to(ticket_number):
    """
    Build the Reply-To address for email threading.
    Uses the ACTUAL configured inbound mailbox with plus-addressing so that
    customer replies land in the correct mailbox and get routed back to the ticket.
    e.g. testsupport+ticket-TKT-00001@bluspring.in
    """
    # Prefer the active InboundMailbox configured in DB
    try:
        from apps.email_config.models import InboundMailbox
        mb = InboundMailbox.objects.filter(is_active=True).first()
        if mb and '@' in mb.email_address:
            local, domain = mb.email_address.split('@', 1)
            return f'{local}+ticket-{ticket_number}@{domain}'
    except Exception:
        pass
    # Fallback to IMAP_USER env var
    imap_user = getattr(settings, 'IMAP_USER', '')
    if imap_user and '@' in imap_user:
        local, domain = imap_user.split('@', 1)
        return f'{local}+ticket-{ticket_number}@{domain}'
    # Last fallback: use DEFAULT_FROM_EMAIL domain
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'helpdesk@yourdomain.local')
    if '@' in from_email:
        local, domain = from_email.split('@', 1)
        return f'{local}+ticket-{ticket_number}@{domain}'
    return from_email


@shared_task(queue='email', bind=True, max_retries=3, default_retry_delay=60)
def send_ticket_notification(self, ticket_id, event_type, comment_id=None):
    """
    Send an email notification to the ticket requestor on the given event.
    Events: created, assigned, commented, status_changed, resolved, closed.
    Internal notes (comment_type='note') are silently skipped.
    """
    from .models import Comment, Ticket

    try:
        ticket = Ticket.objects.select_related(
            'requestor', 'assignee', 'category'
        ).get(pk=ticket_id)
    except Ticket.DoesNotExist:
        logger.warning('send_ticket_notification: ticket %s not found', ticket_id)
        return

    # Skip notification for internal notes
    if comment_id:
        try:
            comment = Comment.objects.get(pk=comment_id)
            if comment.comment_type == Comment.NOTE:
                logger.debug(
                    'send_ticket_notification: skipping internal note %s on ticket %s',
                    comment_id, ticket_id,
                )
                return
        except Comment.DoesNotExist:
            comment = None
    else:
        comment = None

    requestor = ticket.requestor
    if not requestor or not requestor.email:
        logger.warning('send_ticket_notification: ticket %s has no requestor email', ticket_id)
        return

    frontend_url = getattr(settings, 'FRONTEND_URL', 'https://helpdesk.yourdomain.local')
    ticket_url = f'{frontend_url}/tickets/{ticket.pk}/'
    org_name = 'Bluspring Enterprises'

    assignee_display = ticket.assignee.full_name if ticket.assignee else 'Unassigned'
    category_display = ticket.category.name if ticket.category else 'Uncategorised'

    sla_section = ''
    if ticket.sla_due_at:
        sla_str = ticket.sla_due_at.strftime('%d %b %Y %H:%M UTC')
        breach_warning = ' <strong style="color:#dc2626;">(SLA Breached)</strong>' if ticket.sla_breached else ''
        sla_section = (
            f'<div class="field"><span class="label">SLA Due:</span> {sla_str}{breach_warning}</div>'
        )

    comment_section = ''
    if comment:
        author_name = comment.author.full_name if comment.author else 'Agent'
        comment_section = (
            f'<div class="comment-box"><strong>{author_name} wrote:</strong>'
            f'<p style="margin:8px 0 0;">{comment.body}</p></div>'
        )

    event_message = _EVENT_MESSAGES.get(event_type, 'Your ticket has been updated.')
    header_title = _EVENT_HEADERS.get(event_type, 'Ticket Update')

    html_body = _BASE_HTML.format(
        header_title=header_title,
        requestor_name=requestor.full_name,
        event_message=event_message,
        ticket_number=ticket.ticket_number,
        subject=ticket.subject,
        status=ticket.status,
        status_display=ticket.get_status_display(),
        priority=ticket.priority,
        priority_display=ticket.get_priority_display(),
        category=category_display,
        assignee=assignee_display,
        sla_section=sla_section,
        comment_section=comment_section,
        ticket_url=ticket_url,
        org_name=org_name,
    )

    text_body = (
        f'{header_title}\n\n'
        f'Hello {requestor.full_name},\n\n'
        f'{event_message}\n\n'
        f'Ticket #: {ticket.ticket_number}\n'
        f'Subject:  {ticket.subject}\n'
        f'Status:   {ticket.get_status_display()}\n'
        f'Priority: {ticket.get_priority_display()}\n'
        f'Category: {category_display}\n'
        f'Assigned: {assignee_display}\n'
    )
    if comment:
        text_body += f'\nReply:\n{comment.body}\n'
    text_body += f'\nView ticket: {ticket_url}\n'

    subject_line = f'[Ticket #{ticket.ticket_number}] {ticket.subject}'
    reply_to = _get_reply_to(ticket.ticket_number)
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'helpdesk@yourdomain.local')

    try:
        msg = EmailMultiAlternatives(
            subject=subject_line,
            body=text_body,
            from_email=from_email,
            to=[requestor.email],
            reply_to=[reply_to],
        )
        msg.attach_alternative(html_body, 'text/html')
        # Add In-Reply-To header for email threading when the ticket has a known message-id
        if ticket.email_message_id:
            msg.extra_headers['In-Reply-To'] = ticket.email_message_id
            msg.extra_headers['References'] = ticket.email_message_id
        msg.send()
        logger.info(
            'send_ticket_notification: sent %s notification for ticket %s to %s',
            event_type, ticket.ticket_number, requestor.email,
        )
    except Exception as exc:
        logger.error(
            'send_ticket_notification: failed to send email for ticket %s: %s',
            ticket.ticket_number, exc,
        )
        raise self.retry(exc=exc)


@shared_task(queue='default')
def check_sla_breaches():
    """
    Scheduled task (every 15 minutes) that detects SLA breaches.
    Marks tickets as sla_breached=True and notifies the assignee or IT manager.
    """
    from .models import Ticket

    now = timezone.now()
    breached_tickets = Ticket.objects.filter(
        sla_due_at__lte=now,
        sla_breached=False,
    ).exclude(
        status__in=[Ticket.RESOLVED, Ticket.CLOSED]
    ).select_related('requestor', 'assignee', 'category')

    ticket_ids = list(breached_tickets.values_list('id', flat=True))
    if not ticket_ids:
        return

    # Bulk mark as breached
    Ticket.objects.filter(id__in=ticket_ids).update(sla_breached=True)
    logger.info('check_sla_breaches: marked %d tickets as SLA breached', len(ticket_ids))

    # Send notifications for each breached ticket
    for ticket in breached_tickets:
        # Reload to reflect the updated flag
        ticket.sla_breached = True
        _send_sla_breach_alert(ticket)


def _send_sla_breach_alert(ticket):
    """Send an SLA breach alert email to the assignee (or IT managers if unassigned)."""
    from apps.accounts.models import Role, User

    recipients = []
    if ticket.assignee and ticket.assignee.email:
        recipients.append(ticket.assignee.email)

    if not recipients:
        # Notify all IT managers / super admins
        manager_emails = list(
            User.objects.filter(
                role__name__in=[Role.IT_MANAGER, Role.SUPER_ADMIN],
                is_active=True,
            ).values_list('email', flat=True)
        )
        recipients.extend(manager_emails)

    if not recipients:
        logger.warning('check_sla_breaches: no recipients for ticket %s', ticket.ticket_number)
        return

    frontend_url = getattr(settings, 'FRONTEND_URL', 'https://helpdesk.yourdomain.local')
    ticket_url = f'{frontend_url}/tickets/{ticket.pk}/'
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'helpdesk@yourdomain.local')
    org_name = 'Bluspring Enterprises'

    sla_str = ticket.sla_due_at.strftime('%d %b %Y %H:%M UTC') if ticket.sla_due_at else 'N/A'
    category_display = ticket.category.name if ticket.category else 'Uncategorised'
    requestor_display = ticket.requestor.full_name if ticket.requestor else 'Unknown'

    subject_line = f'[SLA BREACH] Ticket #{ticket.ticket_number} — {ticket.subject}'

    html_body = f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: Arial, sans-serif; font-size: 14px; color: #333; }}
    .container {{ max-width: 600px; margin: 30px auto; border: 1px solid #fca5a5; border-radius: 4px; overflow: hidden; }}
    .header {{ background: #dc2626; color: #fff; padding: 20px 24px; }}
    .header h2 {{ margin: 0; font-size: 18px; }}
    .body {{ padding: 24px; }}
    .field {{ margin-bottom: 10px; }}
    .label {{ font-weight: bold; color: #555; width: 140px; display: inline-block; }}
    .footer {{ background: #f9fafb; padding: 14px 24px; font-size: 12px; color: #9ca3af; border-top: 1px solid #ddd; }}
    .btn {{ display: inline-block; margin-top: 16px; padding: 10px 20px; background: #dc2626;
             color: #fff; text-decoration: none; border-radius: 4px; font-size: 14px; }}
  </style>
</head>
<body>
<div class="container">
  <div class="header"><h2>SLA Breach Alert</h2></div>
  <div class="body">
    <p><strong>Ticket #{ticket.ticket_number}</strong> has exceeded its SLA deadline and requires immediate attention.</p>
    <div class="field"><span class="label">Ticket #:</span> {ticket.ticket_number}</div>
    <div class="field"><span class="label">Subject:</span> {ticket.subject}</div>
    <div class="field"><span class="label">Requestor:</span> {requestor_display}</div>
    <div class="field"><span class="label">Category:</span> {category_display}</div>
    <div class="field"><span class="label">Status:</span> {ticket.get_status_display()}</div>
    <div class="field"><span class="label">Priority:</span> {ticket.get_priority_display()}</div>
    <div class="field"><span class="label">SLA Deadline:</span> <strong style="color:#dc2626;">{sla_str}</strong></div>
    <a class="btn" href="{ticket_url}">View &amp; Resolve Ticket</a>
  </div>
  <div class="footer">
    This is an automated SLA breach notification from {org_name} IT Help Desk.
  </div>
</div>
</body>
</html>
"""

    text_body = (
        f'SLA BREACH ALERT\n\n'
        f'Ticket #{ticket.ticket_number} has exceeded its SLA deadline.\n\n'
        f'Subject:   {ticket.subject}\n'
        f'Requestor: {requestor_display}\n'
        f'Category:  {category_display}\n'
        f'Status:    {ticket.get_status_display()}\n'
        f'Priority:  {ticket.get_priority_display()}\n'
        f'SLA Due:   {sla_str}\n\n'
        f'View ticket: {ticket_url}\n'
    )

    try:
        msg = EmailMultiAlternatives(
            subject=subject_line,
            body=text_body,
            from_email=from_email,
            to=recipients,
        )
        msg.attach_alternative(html_body, 'text/html')
        msg.send()
        logger.info(
            'check_sla_breaches: sent breach alert for ticket %s to %s',
            ticket.ticket_number, recipients,
        )
    except Exception as exc:
        logger.error(
            'check_sla_breaches: failed to send breach alert for ticket %s: %s',
            ticket.ticket_number, exc,
        )
