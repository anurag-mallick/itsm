import uuid
from django.db import models


class Notification(models.Model):
    TYPE_TICKET_ASSIGNED   = 'ticket_assigned'
    TYPE_TICKET_COMMENTED  = 'ticket_commented'
    TYPE_TICKET_RESOLVED   = 'ticket_resolved'
    TYPE_SLA_BREACH        = 'sla_breach'
    TYPE_ACCESS_APPROVED   = 'access_approved'
    TYPE_ACCESS_REJECTED   = 'access_rejected'
    TYPE_ACCESS_ASSIGNED   = 'access_assigned'
    TYPE_ASSET_EXPIRY      = 'asset_expiry'

    TYPE_CHOICES = [
        (TYPE_TICKET_ASSIGNED,  'Ticket Assigned'),
        (TYPE_TICKET_COMMENTED, 'New Comment'),
        (TYPE_TICKET_RESOLVED,  'Ticket Resolved'),
        (TYPE_SLA_BREACH,       'SLA Breach'),
        (TYPE_ACCESS_APPROVED,  'Access Request Approved'),
        (TYPE_ACCESS_REJECTED,  'Access Request Rejected'),
        (TYPE_ACCESS_ASSIGNED,  'Access Request Fulfilled'),
        (TYPE_ASSET_EXPIRY,     'Asset/License Expiry'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    notification_type = models.CharField(max_length=30, choices=TYPE_CHOICES, db_index=True)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    url = models.CharField(max_length=500, blank=True)  # frontend route e.g. /tickets/{id}
    read_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'notification'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.email}: {self.title}'

    @classmethod
    def create(cls, user, notification_type, title, body='', url=''):
        """Helper to create and return a notification."""
        return cls.objects.create(
            user=user,
            notification_type=notification_type,
            title=title,
            body=body,
            url=url,
        )
