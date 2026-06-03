from django.apps import AppConfig
import logging

logger = logging.getLogger('itsm.email')


class EmailProcessorConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.email_processor'
    label = 'email_processor'

    def ready(self):
        import sys
        import os

        # Skip polling during management commands, migrations, testing
        skip_commands = {'migrate', 'makemigrations', 'test', 'shell',
                         'collectstatic', 'setup_roles', 'setup_demo_data',
                         'setup_config', 'create_initial_admin', 'setup_schedules',
                         'check', 'showmigrations', 'sqlmigrate'}
        running_cmd = set(sys.argv[1:2])
        if running_cmd & skip_commands:
            return

        # In Django dev server (runserver), only start in the child process
        # (RUN_MAIN=true), not in the parent auto-reloader process.
        if 'runserver' in sys.argv and os.environ.get('RUN_MAIN') != 'true':
            return

        self._start_polling_thread()

    @staticmethod
    def _start_polling_thread():
        import threading
        import time

        def _poll_loop():
            logger.info('Email polling background thread started (30 s interval)')
            # Wait 15 s on first boot so DB is ready
            time.sleep(15)
            while True:
                try:
                    from apps.email_processor.tasks import poll_all_inbound_mailboxes
                    poll_all_inbound_mailboxes()
                except Exception as exc:
                    logger.error(f'Email poll error: {exc}')
                time.sleep(30)

        t = threading.Thread(target=_poll_loop, daemon=True, name='itsm-email-poller')
        t.start()
        logger.info('Email polling thread launched')
