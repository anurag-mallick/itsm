import logging
from django.core.cache import cache
from django.conf import settings

logger = logging.getLogger('itsm.security')

ATTEMPTS_KEY = 'login_attempts:{email}'
LOCKOUT_KEY = 'login_lockout:{email}'


def record_failed_login(email: str, ip: str) -> int:
    """Increment failed attempt counter. Returns current attempt count."""
    key = ATTEMPTS_KEY.format(email=email.lower())
    count = cache.get(key, 0) + 1
    cache.set(key, count, timeout=settings.LOCKOUT_DURATION_SECONDS)
    logger.warning(
        f'Failed login attempt {count}/{settings.MAX_FAILED_LOGIN_ATTEMPTS} for {email} from {ip}'
    )
    if count >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
        cache.set(LOCKOUT_KEY.format(email=email.lower()), True, timeout=settings.LOCKOUT_DURATION_SECONDS)
        logger.warning(
            f'Account locked out: {email} from {ip} after {count} failed attempts'
        )
    return count


def is_locked_out(email: str) -> bool:
    return bool(cache.get(LOCKOUT_KEY.format(email=email.lower())))


def clear_failed_logins(email: str) -> None:
    cache.delete(ATTEMPTS_KEY.format(email=email.lower()))
    cache.delete(LOCKOUT_KEY.format(email=email.lower()))


def get_remaining_attempts(email: str) -> int:
    count = cache.get(ATTEMPTS_KEY.format(email=email.lower()), 0)
    return max(0, settings.MAX_FAILED_LOGIN_ATTEMPTS - count)
