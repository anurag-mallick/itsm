from .models import AuditLog


class AuditMixin:
    """
    DRF view mixin that writes audit log entries for create / update / destroy.
    Set audit_module on the view class to override the auto-derived module name.
    """
    audit_module = None

    def _module(self):
        return self.audit_module or self.__class__.__module__.split('.')[1]

    def _ip(self):
        return getattr(self.request, 'audit_ip', self.request.META.get('REMOTE_ADDR'))

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module=self._module(),
            record_id=instance.pk,
            record_repr=str(instance),
            new_value=serializer.data,
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )

    def perform_update(self, serializer):
        old_data = serializer.__class__(serializer.instance).data
        instance = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.UPDATE,
            module=self._module(),
            record_id=instance.pk,
            record_repr=str(instance),
            old_value=dict(old_data),
            new_value=serializer.data,
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )

    def perform_destroy(self, instance):
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.DELETE,
            module=self._module(),
            record_id=instance.pk,
            record_repr=str(instance),
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )
        instance.delete()
