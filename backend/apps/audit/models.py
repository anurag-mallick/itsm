import uuid
from django.db import models


class AuditLog(models.Model):
    # Action constants
    CREATE = 'create'
    UPDATE = 'update'
    DELETE = 'delete'
    LOGIN = 'login'
    LOGOUT = 'logout'

    ACTION_CHOICES = [
        (CREATE, 'Create'),
        (UPDATE, 'Update'),
        (DELETE, 'Delete'),
        (LOGIN, 'Login'),
        (LOGOUT, 'Logout'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Store email directly — not a FK — so the log is preserved even if the user is deleted
    user_email = models.EmailField(blank=True, db_index=True)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES, db_index=True)
    module = models.CharField(max_length=50, db_index=True)
    record_id = models.CharField(max_length=100, blank=True)
    record_repr = models.CharField(max_length=255, blank=True)
    field_name = models.CharField(max_length=100, blank=True)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'audit_log'
        ordering = ['-timestamp']

    def __str__(self):
        return f'{self.timestamp:%Y-%m-%d %H:%M} | {self.user_email} | {self.action} | {self.module}'

    def save(self, *args, **kwargs):
        # _state.adding is True only when the object has never been saved to the DB.
        # We cannot use `if self.pk` because UUID PKs are set before the first save.
        if not self._state.adding:
            raise PermissionError('Audit log entries are immutable and cannot be modified.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError('Audit log entries cannot be deleted.')

    @classmethod
    def log(cls, *, user, action, module, record_id='', record_repr='',
            field_name='', old_value=None, new_value=None, ip_address=None, user_agent=''):
        return cls.objects.create(
            user_email=user.email if user and user.is_authenticated else '',
            action=action,
            module=module,
            record_id=str(record_id),
            record_repr=record_repr,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            ip_address=ip_address,
            user_agent=user_agent,
        )
