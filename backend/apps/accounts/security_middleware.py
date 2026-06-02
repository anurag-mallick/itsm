import logging
from django.http import HttpResponseForbidden

logger = logging.getLogger('itsm.security')


class SecurityHeadersMiddleware:
    """Adds security headers not already handled by nginx."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = 'DENY'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
        return response


class RequestSizeLimitMiddleware:
    """Reject requests larger than 20 MB to prevent memory exhaustion."""

    MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in ('POST', 'PUT', 'PATCH'):
            content_length = int(request.META.get('CONTENT_LENGTH') or 0)
            if content_length > self.MAX_UPLOAD_SIZE:
                logger.warning(
                    f'Request rejected: content-length {content_length} exceeds limit '
                    f'from {request.META.get("REMOTE_ADDR")}'
                )
                return HttpResponseForbidden('Request body too large.')
        return self.get_response(request)
