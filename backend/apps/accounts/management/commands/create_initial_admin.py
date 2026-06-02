import secrets
import string
import os
from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = 'Create the initial Super Admin user on first deployment. Skips if any superuser already exists.'

    def handle(self, *args, **options):
        from apps.accounts.models import User, Role

        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write('Initial admin already exists — skipping.')
            return

        alphabet = string.ascii_letters + string.digits + '@#$!%^&*'
        password = ''.join(secrets.choice(alphabet) for _ in range(16))
        admin_email = os.environ.get('ADMIN_EMAIL', 'admin@helpdesk.local')

        role = Role.objects.filter(name=Role.SUPER_ADMIN).first()

        admin = User.objects.create_superuser(
            email=admin_email,
            password=password,
            first_name='System',
            last_name='Administrator',
        )
        admin.role = role
        admin.account_type = User.STAFF
        admin.save(update_fields=['role', 'account_type'])

        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://helpdesk.yourdomain.local')

        sep = '=' * 56
        banner = (
            f'\n{sep}\n'
            f'  ITSM -- INITIAL ADMIN CREDENTIALS\n'
            f'{sep}\n'
            f'  Email    : {admin_email}\n'
            f'  Password : {password}\n'
            f'  URL      : {frontend_url}\n'
            f'{sep}\n'
            f'  WARNING: CHANGE THIS PASSWORD ON FIRST LOGIN\n'
            f'{sep}\n'
        )
        self.stdout.write(self.style.SUCCESS(banner))

        # Save to file — works on Linux/Mac; skipped silently on Windows dev
        cred_paths = ['/app/initial_credentials', os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'initial_credentials.txt')]
        for path in cred_paths:
            try:
                with open(os.path.normpath(path), 'w', encoding='utf-8') as f:
                    f.write(f'email={admin_email}\npassword={password}\nurl={frontend_url}\n')
                self.stdout.write(f'  Credentials saved to: {os.path.normpath(path)}')
                break
            except (IOError, OSError):
                continue
