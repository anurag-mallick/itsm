import json

from django.core.management.base import BaseCommand
from django_celery_beat.models import IntervalSchedule, PeriodicTask


class Command(BaseCommand):
    help = 'Set up periodic Celery Beat schedules for IMAP polling and SLA/expiry checks.'

    def handle(self, *args, **options):
        # ---- Schedule definitions ----
        # (task_name, task_path, every, period, queue)
        schedules = [
            {
                'name': 'Poll all inbound email mailboxes',
                'task': 'email_processor.poll_all_mailboxes',
                'every': 60,
                'period': IntervalSchedule.SECONDS,
                'queue': 'default',
                'description': 'Poll all configured inbound mailboxes every 60 seconds',
            },
            {
                'name': 'check_sla_breaches',
                'task': 'apps.tickets.tasks.check_sla_breaches',
                'every': 15,
                'period': IntervalSchedule.MINUTES,
                'queue': 'default',
                'description': 'Detect and flag SLA-breached tickets',
            },
            {
                'name': 'send_expiry_alerts',
                'task': 'apps.software.tasks.send_expiry_alerts',
                'every': 24,
                'period': IntervalSchedule.HOURS,
                'queue': 'email',
                'description': 'Send software license expiry alerts to IT Managers',
            },
        ]

        created_count = 0
        updated_count = 0

        for sched in schedules:
            interval, _ = IntervalSchedule.objects.get_or_create(
                every=sched['every'],
                period=sched['period'],
            )

            task_obj, created = PeriodicTask.objects.update_or_create(
                name=sched['name'],
                defaults={
                    'task': sched['task'],
                    'interval': interval,
                    'queue': sched['queue'],
                    'args': json.dumps([]),
                    'kwargs': json.dumps({}),
                    'enabled': True,
                },
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  [CREATED] {sched["name"]} — every {sched["every"]} '
                        f'{sched["period"]} ({sched["description"]})'
                    )
                )
            else:
                updated_count += 1
                self.stdout.write(
                    f'  [UPDATED] {sched["name"]} — every {sched["every"]} '
                    f'{sched["period"]} ({sched["description"]})'
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'\nsetup_schedules complete: {created_count} created, {updated_count} updated.'
            )
        )
