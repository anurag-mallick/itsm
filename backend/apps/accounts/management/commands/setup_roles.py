from django.core.management.base import BaseCommand
from apps.accounts.models import Role


class Command(BaseCommand):
    help = 'Create the five default roles if they do not already exist.'

    def handle(self, *args, **options):
        for name, label in Role.ROLE_CHOICES:
            _, created = Role.objects.get_or_create(name=name)
            if created:
                self.stdout.write(self.style.SUCCESS(f'  Created role: {label}'))
            else:
                self.stdout.write(f'  Role already exists: {label}')
        self.stdout.write(self.style.SUCCESS('Roles setup complete.'))
