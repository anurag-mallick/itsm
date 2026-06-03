"""
Local development settings — SQLite, no Redis required, console emails.
Use: set DJANGO_SETTINGS_MODULE=config.settings.local
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Hardcoded for local dev — never use these values in production
SECRET_KEY = 'local-dev-secret-key-not-for-production-use-only'
DEBUG = True
ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'django_celery_beat',
    'django_celery_results',
    'drf_spectacular',
    'apps.accounts',
    'apps.audit',
    'apps.custom_fields',
    'apps.tickets',
    'apps.assets',
    'apps.software',
    'apps.email_processor',
    'apps.teams_bot',
    'apps.system_config',
    'apps.reports',
    'apps.changes',
    'apps.access_requests',
    'apps.notifications',
    'apps.discovery',
    'apps.catalog',
    'apps.knowledge',
    'apps.problems',
    'apps.email_config',
    'apps.workflows',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.audit.middleware.AuditMiddleware',
    'apps.accounts.security_middleware.SecurityHeadersMiddleware',
    'apps.accounts.security_middleware.RequestSizeLimitMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
AUTH_USER_MODEL = 'accounts.User'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [BASE_DIR / 'templates'],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.debug',
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

# ── SQLite — no PostgreSQL needed locally ─────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db_local.sqlite3',
    }
}

# ── Cache — use local memory (no Redis needed) ────────────────────────────────
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}

# ── Email — print to console ──────────────────────────────────────────────────
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

# iRedMail SMTP — port 465 SSL/TLS
EMAIL_HOST          = os.environ.get('SMTP_HOST',     'mail.bluspring.in')
EMAIL_PORT          = int(os.environ.get('SMTP_PORT', '465'))
EMAIL_HOST_USER     = os.environ.get('SMTP_USER',     'testsupport@bluspring.in')
EMAIL_HOST_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
EMAIL_USE_SSL       = True    # port 465
EMAIL_USE_TLS       = False   # NOT STARTTLS
DEFAULT_FROM_EMAIL  = os.environ.get('EMAIL_FROM', 'testsupport@bluspring.in')
SERVER_EMAIL        = DEFAULT_FROM_EMAIL

# ── Celery — run tasks synchronously in the same process (no worker needed) ───
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = False
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TIMEZONE = 'UTC'

# ── REST Framework ────────────────────────────────────────────────────────────
from datetime import timedelta
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework_simplejwt.authentication.JWTAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_CLASSES': [],   # no global throttle locally
    'DEFAULT_THROTTLE_RATES': {
        'login': '1000/minute',        # effectively unlimited in local dev
        'user_burst': '1000/minute',
        'user_sustained': '100000/day',
        'anon': '1000/hour',
        'teams_webhook': '1000/minute',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=24),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# ── Stub settings for unused integrations ────────────────────────────────────
IMAP_HOST = ''; IMAP_PORT = 993; IMAP_USER = ''; IMAP_PASSWORD = ''
IMAP_SSL = True; IMAP_PROCESSED_FOLDER = 'INBOX.Processed'

# POP3 inbound stub (local dev)
EMAIL_INBOUND_PROTOCOL = 'imap'
POP3_HOST = ''; POP3_PORT = 995; POP3_USER = ''; POP3_PASSWORD = ''

# Discovery SSH stub (local dev)
DISCOVERY_SSH_USER = ''; DISCOVERY_SSH_PASSWORD = ''
TEAMS_APP_ID = ''; TEAMS_APP_PASSWORD = ''; TEAMS_TENANT_ID = ''
FRONTEND_URL = 'http://localhost:3000'

# ── Security stubs ────────────────────────────────────────────────────────────
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {'.pdf','.png','.jpg','.jpeg','.gif','.xlsx','.xls','.docx','.doc','.txt','.csv','.zip'}
MAX_FAILED_LOGIN_ATTEMPTS = 10
LOCKOUT_DURATION_SECONDS = 300
SESSION_COOKIE_AGE = 86400
SESSION_EXPIRE_AT_BROWSER_CLOSE = False

# ── Static / Media ────────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

CORS_ALLOW_ALL_ORIGINS = True

AUTH_PASSWORD_VALIDATORS = []   # relaxed for local dev

SPECTACULAR_SETTINGS = {
    'TITLE': 'ITSM API (Local Dev)',
    'DESCRIPTION': 'Internal IT Service Management — Local Development',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'WARNING'},
    'loggers': {'django': {'handlers': ['console'], 'level': 'INFO', 'propagate': False}},
}
