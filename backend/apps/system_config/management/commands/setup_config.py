from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Seed default SystemConfig records for SMTP, IMAP, Teams, and General settings.'

    def handle(self, *args, **options):
        from apps.system_config.models import SystemConfig

        self.stdout.write('Seeding default system configuration...')

        try:
            created_count, skipped_count = SystemConfig.seed_defaults()
            self.stdout.write(
                self.style.SUCCESS(
                    f'setup_config complete: {created_count} record(s) created, '
                    f'{skipped_count} already existed.'
                )
            )
        except Exception as exc:
            self.stderr.write(
                self.style.ERROR(f'setup_config failed: {exc}')
            )
            raise
