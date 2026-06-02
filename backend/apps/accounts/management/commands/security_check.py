from django.core.management.base import BaseCommand
from django.conf import settings


PASS = 'PASS'
WARN = 'WARN'
FAIL = 'FAIL'


def _result(label, outcome, detail=''):
    colour = {'PASS': '\033[32m', 'WARN': '\033[33m', 'FAIL': '\033[31m'}
    reset = '\033[0m'
    line = f'[{colour[outcome]}{outcome}{reset}] {label}'
    if detail:
        line += f' — {detail}'
    return line


class Command(BaseCommand):
    help = 'Run pre-flight security checks for SOC2/ISO27001 compliance.'

    def handle(self, *args, **options):
        results = []

        # 1. SECRET_KEY length
        key = getattr(settings, 'SECRET_KEY', '')
        if len(key) >= 50:
            results.append(_result('SECRET_KEY length', PASS, f'{len(key)} characters'))
        else:
            results.append(_result('SECRET_KEY length', FAIL,
                                   f'Only {len(key)} characters — must be >= 50'))

        # 2. DEBUG disabled
        if not settings.DEBUG:
            results.append(_result('DEBUG=False', PASS))
        else:
            results.append(_result('DEBUG=False', FAIL, 'DEBUG is True — must be False in production'))

        # 3. ALLOWED_HOSTS not wildcard
        hosts = getattr(settings, 'ALLOWED_HOSTS', [])
        if '*' not in hosts and hosts:
            results.append(_result('ALLOWED_HOSTS not wildcard', PASS, str(hosts)))
        elif '*' in hosts:
            results.append(_result('ALLOWED_HOSTS not wildcard', FAIL,
                                   'ALLOWED_HOSTS contains "*" — restrict to specific hostnames'))
        else:
            results.append(_result('ALLOWED_HOSTS not wildcard', WARN,
                                   'ALLOWED_HOSTS is empty — set explicit hostnames'))

        # 4. Database SSL
        db_opts = settings.DATABASES.get('default', {}).get('OPTIONS', {})
        ssl_configured = (
            'sslmode' in db_opts
            or 'sslrootcert' in db_opts
            or db_opts.get('connect_timeout') is not None and 'ssl' in str(db_opts).lower()
        )
        # Check environment variable as a fallback indicator
        import os
        db_ssl_env = os.environ.get('DB_SSLMODE', '')
        if db_ssl_env in ('require', 'verify-ca', 'verify-full'):
            results.append(_result('Database SSL', PASS, f'DB_SSLMODE={db_ssl_env}'))
        elif 'sslmode' in db_opts:
            results.append(_result('Database SSL', PASS, f"sslmode={db_opts['sslmode']}"))
        else:
            results.append(_result('Database SSL', WARN,
                                   'No SSL mode detected in DATABASES OPTIONS or DB_SSLMODE env var — '
                                   'set OPTIONS["sslmode"] = "require" for production'))

        # 5. Redis password
        redis_url = os.environ.get('REDIS_URL', '')
        if redis_url and ('@' in redis_url or ':**' in redis_url):
            results.append(_result('Redis password set', PASS))
        elif ':' in redis_url.split('@')[0].split('//')[-1] if redis_url else False:
            # URL pattern redis://:password@host format
            results.append(_result('Redis password set', PASS))
        else:
            results.append(_result('Redis password set', WARN,
                                   'REDIS_URL does not appear to contain a password — '
                                   'use redis://:password@host:port/db in production'))

        self.stdout.write('\nITSM Security Pre-flight Check')
        self.stdout.write('=' * 45)
        for line in results:
            self.stdout.write(line)
        self.stdout.write('')

        failures = [r for r in results if f'[{FAIL}]'.replace('\033[31m', '').replace('\033[0m', '') in r
                    or '\033[31m' in r]
        if failures:
            self.stderr.write(self.style.ERROR(
                f'{len(failures)} check(s) FAILED — resolve before deploying to production.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS('All critical checks passed.'))
