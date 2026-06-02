import os
from .base import *  # noqa: F401, F403

DEBUG = True
ALLOWED_HOSTS = ['*']

# Use console backend so emails are printed to stdout during development
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

CORS_ALLOW_ALL_ORIGINS = True

# Looser password rules for dev
AUTH_PASSWORD_VALIDATORS = []

try:
    import django_extensions  # noqa: F401
    INSTALLED_APPS += ['django_extensions']  # noqa: F405
except ImportError:
    pass
