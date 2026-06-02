import os
from datetime import timedelta
from .base import *  # noqa: F401, F403

# --- Core security hardening ---
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True

CORS_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('FRONTEND_URL', '').split(',') if o.strip()]
CORS_ALLOW_CREDENTIALS = True

# --- Additional production security ---
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = False  # nginx handles redirect
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.environ.get('FRONTEND_URL', '').split(',') if o.strip()]

# --- Password reset token validity ---
PASSWORD_RESET_TIMEOUT = 3600  # 1 hour

# --- Stricter JWT in production ---
SIMPLE_JWT = {
    **globals().get('SIMPLE_JWT', {}),
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=4),   # shorter in prod
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),   # shorter in prod
}
