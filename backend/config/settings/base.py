import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ['SECRET_KEY']
DEBUG = os.environ.get('DEBUG', 'False') == 'True'
ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', 'localhost').split(',')]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'django_celery_beat',
    'django_celery_results',
    'drf_spectacular',
    # Local
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
    'apps.accounts.security_middleware.SecurityHeadersMiddleware',
    'apps.accounts.security_middleware.RequestSizeLimitMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.audit.middleware.AuditMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
AUTH_USER_MODEL = 'accounts.User'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ['DB_NAME'],
        'USER': os.environ['DB_USER'],
        'PASSWORD': os.environ['DB_PASSWORD'],
        'HOST': os.environ.get('DB_HOST', 'postgres'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'OPTIONS': {'connect_timeout': 10},
    }
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.environ.get('REDIS_URL', 'redis://redis:6379/0'),
    }
}

# --- Authentication ---
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# --- REST Framework ---
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'apps.accounts.throttles.UserBurstThrottle',
        'apps.accounts.throttles.UserSustainedThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/hour',
        'user_burst': '60/minute',
        'user_sustained': '2000/day',
        'login': '10/minute',
        'teams_webhook': '200/minute',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# --- Celery ---
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://redis:6379/0')
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TIMEZONE = 'UTC'
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ROUTES = {
    'apps.*.tasks.send_email*': {'queue': 'email'},
    'apps.*.tasks.send_teams*': {'queue': 'notifications'},
}

# ── Email (iRedMail SMTP) ─────────────────────────────────────────────────────
EMAIL_BACKEND    = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST       = os.environ.get('SMTP_HOST', '')
EMAIL_PORT       = int(os.environ.get('SMTP_PORT', '465'))
EMAIL_HOST_USER  = os.environ.get('SMTP_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
# Port 465 = SSL/TLS (EMAIL_USE_SSL=True, EMAIL_USE_TLS=False)
# Port 587 = STARTTLS  (EMAIL_USE_TLS=True, EMAIL_USE_SSL=False)
_smtp_port = int(os.environ.get('SMTP_PORT', '465'))
EMAIL_USE_SSL    = _smtp_port == 465
EMAIL_USE_TLS    = _smtp_port == 587
DEFAULT_FROM_EMAIL = os.environ.get('EMAIL_FROM', os.environ.get('SMTP_USER', 'helpdesk@company.local'))
SERVER_EMAIL     = DEFAULT_FROM_EMAIL

# --- IMAP (iRedMail inbound) ---
IMAP_HOST = os.environ.get('IMAP_HOST', '')
IMAP_PORT = int(os.environ.get('IMAP_PORT', '993'))
IMAP_USER = os.environ.get('IMAP_USER', '')
IMAP_PASSWORD = os.environ.get('IMAP_PASSWORD', '')
IMAP_SSL = os.environ.get('IMAP_SSL', 'True') == 'True'
IMAP_PROCESSED_FOLDER = os.environ.get('IMAP_PROCESSED_FOLDER', 'INBOX.Processed')

# --- POP3 inbound (alternative to IMAP) ---
EMAIL_INBOUND_PROTOCOL = os.environ.get('EMAIL_INBOUND_PROTOCOL', 'imap')  # 'imap' or 'pop3'
POP3_HOST = os.environ.get('POP3_HOST', '')
POP3_PORT = int(os.environ.get('POP3_PORT', '995'))
POP3_USER = os.environ.get('POP3_USER', '')
POP3_PASSWORD = os.environ.get('POP3_PASSWORD', '')

# --- Hardware asset auto-discovery ---
DISCOVERY_SSH_USER = os.environ.get('DISCOVERY_SSH_USER', '')
DISCOVERY_SSH_PASSWORD = os.environ.get('DISCOVERY_SSH_PASSWORD', '')

# --- Microsoft Teams ---
TEAMS_APP_ID = os.environ.get('TEAMS_APP_ID', '')
TEAMS_APP_PASSWORD = os.environ.get('TEAMS_APP_PASSWORD', '')
TEAMS_TENANT_ID = os.environ.get('TEAMS_TENANT_ID', '')

# --- Frontend ---
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://helpdesk.yourdomain.local')

# --- Static / Media ---
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# --- Internationalisation ---
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# --- API Docs ---
SPECTACULAR_SETTINGS = {
    'TITLE': 'ITSM API',
    'DESCRIPTION': 'Internal IT Service Management Platform — Bluspring Enterprises',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

# --- File upload security ---
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_UPLOAD_EXTENSIONS = {
    '.pdf', '.png', '.jpg', '.jpeg', '.gif',
    '.xlsx', '.xls', '.docx', '.doc',
    '.txt', '.csv', '.zip',
}

# --- Account lockout (uses Redis cache) ---
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 900  # 15 minutes

# --- Session security ---
SESSION_COOKIE_AGE = 28800  # 8 hours
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

# --- Structured logging ---
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{asctime} {levelname} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'security': {
            'format': '{asctime} SECURITY {levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'security_console': {
            'class': 'logging.StreamHandler',
            'formatter': 'security',
        },
    },
    'loggers': {
        'django': {'handlers': ['console'], 'level': 'WARNING'},
        'itsm.security': {'handlers': ['security_console'], 'level': 'INFO', 'propagate': False},
        'itsm.audit': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}
