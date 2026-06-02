import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Inline HTML email template
# ---------------------------------------------------------------------------

_EXPIRY_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: Arial, sans-serif; font-size: 14px; color: #333; margin: 0; padding: 0; }}
    .container {{ max-width: 640px; margin: 30px auto; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }}
    .header {{ background: #b45309; color: #fff; padding: 20px 24px; }}
    .header h2 {{ margin: 0; font-size: 18px; }}
    .body {{ padding: 24px; }}
    .intro {{ margin-bottom: 16px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
    th {{ background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 12px;
          color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }}
    td {{ padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }}
    tr:last-child td {{ border-bottom: none; }}
    .badge-expired {{ color: #dc2626; font-weight: bold; }}
    .badge-expiring {{ color: #d97706; font-weight: bold; }}
    .footer {{ background: #f9fafb; padding: 14px 24px; font-size: 12px;
               color: #9ca3af; border-top: 1px solid #ddd; }}
  </style>
</head>
<body>
<div class="container">
  <div class="header"><h2>Software License Expiry Alert</h2></div>
  <div class="body">
    <p class="intro">
      The following {count} software license(s) require your attention — they are
      <strong>{threshold_label}</strong>.
    </p>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Vendor</th>
          <th>Type</th>
          <th>Seats</th>
          <th>Expiry Date</th>
          <th>Days Left</th>
        </tr>
      </thead>
      <tbody>
        {rows}
      </tbody>
    </table>
  </div>
  <div class="footer">
    This is an automated software license expiry notification from {org_name} IT Help Desk.
  </div>
</div>
</body>
</html>
"""

_ROW_TEMPLATE = """
<tr>
  <td>{name}</td>
  <td>{vendor}</td>
  <td>{license_type}</td>
  <td>{seat_count}</td>
  <td>{expiry_date}</td>
  <td class="{badge_class}">{days_left}</td>
</tr>
"""


def _build_html(licenses, threshold_label):
    rows = []
    for lic in licenses:
        days = lic.days_until_expiry
        if days is None:
            days_display = 'N/A'
            badge_class = ''
        elif days < 0:
            days_display = f'Expired {abs(days)}d ago'
            badge_class = 'badge-expired'
        else:
            days_display = f'{days} days'
            badge_class = 'badge-expiring'

        expiry_str = lic.expiry_date.strftime('%d %b %Y') if lic.expiry_date else 'N/A'
        rows.append(
            _ROW_TEMPLATE.format(
                name=lic.name,
                vendor=lic.vendor or '—',
                license_type=lic.get_license_type_display(),
                seat_count=lic.seat_count,
                expiry_date=expiry_str,
                days_left=days_display,
                badge_class=badge_class,
            )
        )
    return _EXPIRY_HTML.format(
        count=len(licenses),
        threshold_label=threshold_label,
        rows=''.join(rows),
        org_name='Bluspring Enterprises',
    )


def _build_text(licenses, threshold_label):
    lines = [
        'Software License Expiry Alert',
        '',
        f'The following {len(licenses)} license(s) are {threshold_label}:',
        '',
        f'{"Name":<40} {"Vendor":<25} {"Expiry":<15} {"Days Left"}',
        '-' * 100,
    ]
    for lic in licenses:
        days = lic.days_until_expiry
        if days is None:
            days_display = 'N/A'
        elif days < 0:
            days_display = f'Expired {abs(days)}d ago'
        else:
            days_display = f'{days} days'
        expiry_str = lic.expiry_date.strftime('%d %b %Y') if lic.expiry_date else 'N/A'
        lines.append(
            f'{lic.name:<40} {(lic.vendor or "—"):<25} {expiry_str:<15} {days_display}'
        )
    lines.append('')
    lines.append(
        'This is an automated notification from Bluspring Enterprises IT Help Desk.'
    )
    return '\n'.join(lines)


def _get_manager_emails():
    from apps.accounts.models import Role, User

    return list(
        User.objects.filter(
            role__name__in=[Role.IT_MANAGER, Role.SUPER_ADMIN],
            is_active=True,
        ).values_list('email', flat=True)
    )


def _send_alert_email(licenses, days_threshold):
    if not licenses:
        return

    recipients = _get_manager_emails()
    if not recipients:
        logger.warning(
            'send_expiry_alerts: no IT manager / super admin recipients found.'
        )
        return

    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'helpdesk@yourdomain.local')

    if days_threshold == 30:
        threshold_label = 'expiring within 30 days'
    elif days_threshold == 7:
        threshold_label = 'expiring within 7 days'
    else:
        threshold_label = f'expiring within {days_threshold} days'

    subject = (
        f'Software License Expiry Alert — {len(licenses)} '
        f'license(s) expiring soon ({days_threshold}-day notice)'
    )

    html_body = _build_html(licenses, threshold_label)
    text_body = _build_text(licenses, threshold_label)

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=from_email,
            to=recipients,
        )
        msg.attach_alternative(html_body, 'text/html')
        msg.send()
        logger.info(
            'send_expiry_alerts: sent %d-day alert for %d license(s) to %s',
            days_threshold,
            len(licenses),
            recipients,
        )
    except Exception as exc:
        logger.error(
            'send_expiry_alerts: failed to send %d-day alert: %s',
            days_threshold,
            exc,
        )
        raise


@shared_task(queue='email')
def send_expiry_alerts():
    """
    Called by celery-beat daily.
    Sends an email to IT Managers and Super Admins for licenses expiring
    in exactly 30 days or exactly 7 days (not already expired, is_active=True).
    """
    from .models import SoftwareLicense

    today = timezone.now().date()

    for days_threshold in (30, 7):
        target_date = today + timezone.timedelta(days=days_threshold)
        licenses = list(
            SoftwareLicense.objects.filter(
                expiry_date=target_date,
                is_active=True,
            ).order_by('name')
        )
        if licenses:
            _send_alert_email(licenses, days_threshold)
        else:
            logger.debug(
                'send_expiry_alerts: no licenses expiring in %d days on %s',
                days_threshold,
                target_date,
            )
