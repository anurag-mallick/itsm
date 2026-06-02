import logging
import smtplib
from email.mime.text import MIMEText

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsSuperAdmin
from apps.audit.models import AuditLog

from .models import ConfigSection, SystemConfig
from .serializers import SystemConfigSerializer, SystemConfigUpdateSerializer

logger = logging.getLogger(__name__)


class SystemConfigListView(APIView):
    """
    GET /api/system-config/?section=<section>

    Returns all SystemConfig records for the given section.
    Secrets are masked in the response (display_value = '••••••••').
    Requires Super Admin role.
    """
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        section = request.query_params.get('section', '').lower()

        qs = SystemConfig.objects.all()
        if section:
            qs = qs.filter(section=section)

        serializer = SystemConfigSerializer(qs, many=True)
        return Response(serializer.data)


class SystemConfigSectionListView(APIView):
    """
    GET /api/system-config/sections/

    Returns available config sections with their labels.
    Requires Super Admin role.
    """
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        sections = [
            {'value': choice[0], 'label': choice[1]}
            for choice in ConfigSection.choices
        ]
        return Response(sections)


class SystemConfigUpdateView(APIView):
    """
    POST /api/system-config/update/

    Body: { "updates": [ {"key": "smtp_host", "value": "mail.example.com"}, ... ] }

    Bulk-updates config values. Writes an audit trail (updated_by_email, updated_at).
    Requires Super Admin role.
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        serializer = SystemConfigUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updates = serializer.validated_data['updates']
        updated_by_email = request.user.email if request.user else ''

        updated_keys = []
        errors = []

        for item in updates:
            key = item.get('key', '').strip()
            value = item.get('value', '')
            try:
                cfg_obj = SystemConfig.objects.filter(key=key).first()
                if cfg_obj is None:
                    errors.append(f'Key not found: {key}')
                    continue
                old_value = cfg_obj.value
                SystemConfig.objects.filter(key=key).update(
                    value=value,
                    updated_by_email=updated_by_email,
                )
                updated_keys.append(key)
                AuditLog.log(
                    user=request.user,
                    action=AuditLog.UPDATE,
                    module='system_config',
                    record_id=str(cfg_obj.pk),
                    record_repr=key,
                    field_name=key,
                    old_value=old_value,
                    new_value=value,
                    ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                )
            except Exception as exc:
                logger.error(
                    'SystemConfigUpdateView: failed to update key %s: %s', key, exc
                )
                errors.append(f'Failed to update key {key}: {exc}')

        response_data = {
            'updated': updated_keys,
            'updated_count': len(updated_keys),
        }
        if errors:
            response_data['errors'] = errors

        http_status = (
            status.HTTP_200_OK if updated_keys else status.HTTP_400_BAD_REQUEST
        )
        return Response(response_data, status=http_status)


class SystemConfigTestEmailView(APIView):
    """
    POST /api/system-config/test-email/

    Body: { "to_email": "someone@example.com" }

    Reads current SMTP config from the database and sends a test email.
    Returns { "success": true/false, "error": "..." }.
    Requires Super Admin role.
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        to_email = (request.data.get('to_email') or '').strip()
        if not to_email:
            return Response(
                {'success': False, 'error': 'to_email is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Read SMTP config from the database
        smtp_section = SystemConfig.get_section(ConfigSection.SMTP)
        smtp_host = smtp_section.get('smtp_host', '').strip()
        smtp_port_str = smtp_section.get('smtp_port', '587').strip()
        smtp_user = smtp_section.get('smtp_user', '').strip()
        smtp_password = smtp_section.get('smtp_password', '').strip()
        smtp_use_tls = smtp_section.get('smtp_use_tls', 'true').lower() == 'true'
        email_from = smtp_section.get('email_from', '').strip() or smtp_user

        if not smtp_host:
            return Response(
                {'success': False, 'error': 'SMTP host is not configured.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            smtp_port = int(smtp_port_str)
        except ValueError:
            smtp_port = 587

        company_name = SystemConfig.get('company_name', 'Bluspring Enterprises')
        helpdesk_name = SystemConfig.get('helpdesk_name', 'IT Help Desk')

        subject = f'[{helpdesk_name}] SMTP Test Email'
        body = (
            f'This is a test email from the {company_name} {helpdesk_name}.\n\n'
            f'If you received this message, your SMTP configuration is working correctly.\n\n'
            f'Sent at: {timezone.now().strftime("%d %b %Y %H:%M UTC")}'
        )

        msg = MIMEText(body, 'plain', 'utf-8')
        msg['Subject'] = subject
        msg['From'] = email_from or 'helpdesk@yourdomain.local'
        msg['To'] = to_email

        try:
            if smtp_use_tls:
                server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
                server.ehlo()
                server.starttls()
                server.ehlo()
            else:
                server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
                server.ehlo()

            if smtp_user and smtp_password:
                server.login(smtp_user, smtp_password)

            server.sendmail(msg['From'], [to_email], msg.as_string())
            server.quit()

            logger.info(
                'SystemConfigTestEmailView: test email sent to %s via %s:%s',
                to_email, smtp_host, smtp_port,
            )
            return Response({'success': True, 'error': ''})

        except smtplib.SMTPAuthenticationError as exc:
            error_msg = f'SMTP authentication failed: {exc}'
            logger.warning('SystemConfigTestEmailView: %s', error_msg)
            return Response({'success': False, 'error': error_msg})
        except smtplib.SMTPConnectError as exc:
            error_msg = f'Could not connect to SMTP server {smtp_host}:{smtp_port}: {exc}'
            logger.warning('SystemConfigTestEmailView: %s', error_msg)
            return Response({'success': False, 'error': error_msg})
        except Exception as exc:
            error_msg = f'Failed to send test email: {exc}'
            logger.error('SystemConfigTestEmailView: %s', error_msg, exc_info=True)
            return Response({'success': False, 'error': error_msg})
