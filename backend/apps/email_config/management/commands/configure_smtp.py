"""Update outbound SMTP to port 465 SSL/TLS."""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Configure iRedMail SMTP outbound settings (port 465 SSL/TLS).'

    def handle(self, *args, **options):
        from apps.system_config.models import SystemConfig
        updates = {
            'smtp_host': 'mail.bluspring.in',
            'smtp_port': '465',
            'smtp_user': 'testsupport@bluspring.in',
            'smtp_password': 'Bangalore@2026',
            'smtp_use_tls': 'false',   # NOT STARTTLS
            'email_from': 'testsupport@bluspring.in',
        }
        for key, val in updates.items():
            obj, created = SystemConfig.objects.update_or_create(
                key=key, defaults={'value': val}
            )
            self.stdout.write(f'  {"Created" if created else "Updated"}: {key} = {val if "password" not in key else "***"}')
        self.stdout.write(self.style.SUCCESS('SMTP configured: mail.bluspring.in:465 SSL/TLS'))
