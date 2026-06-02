from rest_framework.throttling import UserRateThrottle, SimpleRateThrottle


class UserBurstThrottle(UserRateThrottle):
    scope = 'user_burst'


class UserSustainedThrottle(UserRateThrottle):
    scope = 'user_sustained'


class LoginRateThrottle(SimpleRateThrottle):
    """Per-IP throttle on the login endpoint."""

    scope = 'login'

    def get_cache_key(self, request, view):
        ident = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', ''))
        return self.cache_format % {'scope': self.scope, 'ident': ident.split(',')[0].strip()}


class TeamsWebhookThrottle(SimpleRateThrottle):
    scope = 'teams_webhook'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': 'teams'}
