import uuid

from django.db import models, transaction
from django.utils import timezone


class ServiceRequestCounter(models.Model):
    """Singleton row (id=1) used for thread-safe sequential SR numbering."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    current = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'catalog_sr_counter'

    @classmethod
    def next(cls):
        with transaction.atomic():
            counter, _ = cls.objects.select_for_update().get_or_create(id=1)
            counter.current += 1
            counter.save(update_fields=['current'])
            return counter.current


class CatalogCategory(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)  # ant-design icon name e.g. 'LaptopOutlined'
    display_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'catalog_category'
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name


class CatalogItem(models.Model):
    """A service that users can request (e.g. 'New Laptop', 'VPN Access', 'Office 365 License')."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        CatalogCategory, on_delete=models.PROTECT, related_name='items'
    )
    name = models.CharField(max_length=200)
    description = models.TextField()
    icon = models.CharField(max_length=50, blank=True)
    # JSON schema for the dynamic request form:
    # [{"name": "quantity", "label": "Quantity", "type": "number", "required": true}]
    form_fields = models.JSONField(default=list)
    fulfillment_sla_hours = models.PositiveIntegerField(default=72)
    # if True, creates a ticket automatically on request
    auto_create_ticket = models.BooleanField(default=True)
    requires_manager_approval = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'catalog_item'
        ordering = ['category', 'display_order', 'name']

    def __str__(self):
        return self.name


class ServiceRequest(models.Model):
    STATUS_SUBMITTED = 'submitted'
    STATUS_PENDING_APPROVAL = 'pending_approval'
    STATUS_APPROVED = 'approved'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_FULFILLED = 'fulfilled'
    STATUS_REJECTED = 'rejected'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_SUBMITTED,        'Submitted'),
        (STATUS_PENDING_APPROVAL, 'Pending Approval'),
        (STATUS_APPROVED,         'Approved'),
        (STATUS_IN_PROGRESS,      'In Progress'),
        (STATUS_FULFILLED,        'Fulfilled'),
        (STATUS_REJECTED,         'Rejected'),
        (STATUS_CANCELLED,        'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_number = models.CharField(max_length=20, unique=True, blank=True)  # SR-00001
    catalog_item = models.ForeignKey(
        CatalogItem, on_delete=models.PROTECT, related_name='requests'
    )
    requested_by = models.ForeignKey(
        'accounts.User', on_delete=models.PROTECT, related_name='service_requests'
    )
    form_data = models.JSONField(default=dict)  # user's answers to form_fields
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_SUBMITTED, db_index=True
    )
    notes = models.TextField(blank=True)  # fulfilment notes from IT
    linked_ticket = models.ForeignKey(
        'tickets.Ticket',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='service_requests',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    fulfilled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'catalog_service_request'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ref_number} — {self.catalog_item.name}'

    def save(self, *args, **kwargs):
        if not self.ref_number:
            self.ref_number = f'SR-{ServiceRequestCounter.next():05d}'
        if self.status == self.STATUS_FULFILLED and not self.fulfilled_at:
            self.fulfilled_at = timezone.now()
        super().save(*args, **kwargs)
