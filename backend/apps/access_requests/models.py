import uuid
from django.db import models, transaction


class AccessRequestCounter(models.Model):
    """Singleton row (id=1) used for thread-safe sequential access request numbering."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    current = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'access_request_counter'

    @classmethod
    def next(cls):
        with transaction.atomic():
            counter, _ = cls.objects.select_for_update().get_or_create(id=1)
            counter.current += 1
            counter.save(update_fields=['current'])
            return counter.current


class AccessRequest(models.Model):
    HARDWARE = 'hardware'
    SOFTWARE = 'software'
    TYPE_CHOICES = [
        (HARDWARE, 'Hardware Assignment'),
        (SOFTWARE, 'Software Access'),
    ]

    PENDING_MANAGER = 'pending_manager'
    MANAGER_APPROVED = 'manager_approved'
    MANAGER_REJECTED = 'manager_rejected'
    PENDING_ASSIGNMENT = 'pending_assignment'
    ASSIGNED = 'assigned'
    CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (PENDING_MANAGER,    'Pending Manager Approval'),
        (MANAGER_APPROVED,   'Approved by Manager'),
        (MANAGER_REJECTED,   'Rejected by Manager'),
        (PENDING_ASSIGNMENT, 'Pending IT Assignment'),
        (ASSIGNED,           'Assigned'),
        (CANCELLED,          'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_number = models.CharField(max_length=20, unique=True)  # AR-00001
    request_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    status = models.CharField(
        max_length=25, choices=STATUS_CHOICES, default=PENDING_MANAGER, db_index=True
    )

    # Requester
    requested_by = models.ForeignKey(
        'accounts.User', on_delete=models.PROTECT, related_name='access_requests'
    )
    justification = models.TextField()

    # Manager approval
    manager_email = models.EmailField()   # user-supplied; manager does not need an account
    manager_name = models.CharField(max_length=200, blank=True)
    approval_token = models.UUIDField(default=uuid.uuid4, unique=True)  # used in email link
    manager_notes = models.TextField(blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    # What they need (hardware)
    hardware_type = models.CharField(max_length=50, blank=True)   # e.g. laptop, desktop
    hardware_specification = models.TextField(blank=True)          # desired specs
    hardware_asset = models.ForeignKey(
        'assets.HardwareAsset',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='access_requests',
    )

    # What they need (software)
    software_name = models.CharField(max_length=200, blank=True)
    software_license = models.ForeignKey(
        'software.SoftwareLicense',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='access_requests',
    )

    # Assignment (done by IT agent)
    assigned_by = models.ForeignKey(
        'accounts.User',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_access_requests',
    )
    assigned_at = models.DateTimeField(null=True, blank=True)
    assignment_notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'access_request'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ref_number} — {self.get_request_type_display()} by {self.requested_by.email}'

    def save(self, *args, **kwargs):
        if not self.ref_number:
            self.ref_number = f'AR-{AccessRequestCounter.next():05d}'
        super().save(*args, **kwargs)
