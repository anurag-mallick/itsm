class AuditMiddleware:
    """Resolves the real client IP and attaches it to request.audit_ip."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        request.audit_ip = forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')
        return self.get_response(request)
