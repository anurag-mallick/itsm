import uuid

from django.db import models
from django.utils import timezone

from apps.accounts.models import User
from apps.assets.models import HardwareAsset



class SoftwareLicense(models.Model):
    # License type choices
    PERPETUAL = 'perpetual'
    SUBSCRIPTION = 'subscription'
    OEM = 'oem'
    FREEWARE = 'freeware'
    OPEN_SOURCE = 'open_source'

    LICENSE_TYPE_CHOICES = [
        (PERPETUAL, 'Perpetual'),
        (SUBSCRIPTION, 'Subscription'),
        (OEM, 'OEM'),
        (FREEWARE, 'Freeware'),
        (OPEN_SOURCE, 'Open Source'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    vendor = models.CharField(max_length=200, blank=True)
    version = models.CharField(max_length=100, blank=True)
    license_type = models.CharField(
        max_length=20,
        choices=LICENSE_TYPE_CHOICES,
        default=PERPETUAL,
        db_index=True,
    )
    # Stored as-is; accessible only via admin
    license_key = models.TextField(blank=True)
    seat_count = models.PositiveIntegerField(default=1)
    purchase_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True, db_index=True)
    purchase_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    notes = models.TextField(blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'software'
        db_table = 'software_license'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.get_license_type_display()})'

    @property
    def seats_used(self):
        return self.installations.count()

    @property
    def seats_available(self):
        """Remaining assignable seats. Negative means over-licensed."""
        return self.seat_count - self.seats_used

    @property
    def is_compliant(self):
        return self.seats_used <= self.seat_count

    @property
    def days_until_expiry(self):
        if not self.expiry_date:
            return None
        today = timezone.now().date()
        return (self.expiry_date - today).days


class SoftwareInstallation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    license = models.ForeignKey(
        SoftwareLicense,
        on_delete=models.CASCADE,
        related_name='installations',
    )
    # hardware_asset is nullable — software can be assigned to a user
    # directly (user-based licence) without requiring a specific machine.
    hardware_asset = models.ForeignKey(
        HardwareAsset,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='software_installations',
    )
    # assigned_user tracks who holds this seat when no hardware is linked
    assigned_user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='software_user_installations',
    )
    installed_on = models.DateField(null=True, blank=True)
    installed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='software_installations',
    )
    notes = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'software'
        db_table = 'software_installation'
        ordering = ['-created_at']
        constraints = [
            # One installation per license+hardware when a hardware asset is linked
            models.UniqueConstraint(
                fields=['license', 'hardware_asset'],
                condition=models.Q(hardware_asset__isnull=False),
                name='unique_license_per_hardware',
            ),
            # One installation per license+user when no hardware is linked
            models.UniqueConstraint(
                fields=['license', 'assigned_user'],
                condition=models.Q(hardware_asset__isnull=True, assigned_user__isnull=False),
                name='unique_license_per_user',
            ),
        ]

    def __str__(self):
        target = self.hardware_asset.asset_tag if self.hardware_asset else (
            self.assigned_user.email if self.assigned_user else 'unlinked'
        )
        return f'{self.license.name} → {target}'


class SoftwareLicenseEvent(models.Model):
    """Immutable timeline record for every meaningful change to a software license."""
    SEAT_CHANGED = 'seat_count_changed'
    EXPIRY_RENEWED = 'expiry_renewed'
    EXPIRY_CHANGED = 'expiry_changed'
    INSTALLATION_ADDED = 'installation_added'
    INSTALLATION_REMOVED = 'installation_removed'
    STATUS_CHANGED = 'status_changed'
    LICENSE_CREATED = 'license_created'
    SEAT_REQUESTED = 'seat_requested'

    EVENT_CHOICES = [
        (SEAT_CHANGED, 'Seat Count Changed'),
        (EXPIRY_RENEWED, 'Subscription Renewed'),
        (EXPIRY_CHANGED, 'Expiry Date Changed'),
        (INSTALLATION_ADDED, 'Installation Added'),
        (INSTALLATION_REMOVED, 'Installation Removed'),
        (STATUS_CHANGED, 'Status Changed'),
        (LICENSE_CREATED, 'License Created'),
        (SEAT_REQUESTED, 'Additional Seats Requested'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    license = models.ForeignKey(SoftwareLicense, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=30, choices=EVENT_CHOICES)
    description = models.TextField()
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    actor_email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        app_label = 'software'
        db_table = 'software_license_event'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.license.name} — {self.get_event_type_display()} at {self.created_at:%Y-%m-%d}'


class SeatRequest(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    license = models.ForeignKey(SoftwareLicense, on_delete=models.CASCADE, related_name='seat_requests')
    requested_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT, related_name='seat_requests')
    seats_requested = models.PositiveIntegerField()
    justification = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    reviewed_by = models.ForeignKey(
        'accounts.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reviewed_seat_requests',
    )
    review_notes = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'software'
        db_table = 'software_seat_request'
        ordering = ['-created_at']

    def __str__(self):
        return f'SeatRequest({self.license.name}, {self.seats_requested} seats, {self.status})'
