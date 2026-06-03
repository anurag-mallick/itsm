# =============================================================================
#  ITSM Platform - Procfile
#  Run all local processes with: honcho start  (pip install honcho)
#  Or with Overmind: overmind start
#  Or with Foreman: foreman start
#
#  Set DJANGO_SETTINGS_MODULE=config.settings.local in your shell before running.
# =============================================================================

# Django development server
web: cd backend && python manage.py runserver 0.0.0.0:8000

# Vite frontend development server
frontend: cd frontend && npm run dev

# Celery worker — handles email notifications, Teams messages, discovery scans
# worker: cd backend && python -m celery -A config worker -l INFO -Q default,email,notifications --concurrency=2

# Celery Beat — scheduled tasks (IMAP poll, SLA checks, expiry alerts)
# beat: cd backend && python -m celery -A config beat -l INFO --scheduler django_celery_beat.schedulers:DatabaseScheduler
