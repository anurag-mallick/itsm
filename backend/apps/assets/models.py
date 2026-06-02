import uuid

from django.db import models, transaction
from django.utils import timezone

from apps.accounts.models import User


class AssetCounter(models.Model):
    """Singleton row (id=1) used for thread-safe sequential asset numbering."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    current = models.PositiveIntegerField(default=0)

    class Meta:
        app_label = 'assets'
        db_table = 'assets_counter'

    @classmethod
    def next(cls):
        with transaction.atomic():
            counter, _ = cls.objects.select_for_update().get_or_create(id=1)
            counter.current += 1
            counter.save(update_fields=['current'])
            return counter.current


class Site(models.Model):
    """Physical office site / location."""
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    contact_name = models.CharField(max_length=200, blank=True)
    contact_email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'asset_site'

    def __str__(self):
        return f'{self.name} ({self.city})' if self.city else self.name


class HardwareAssetManager(models.Manager):
    """Default manager — excludes archived assets from all queries."""

    def get_queryset(self):
        return super().get_queryset().filter(is_archived=False)


class ArchivedHardwareAssetManager(models.Manager):
    """Returns only archived hardware assets."""

    def get_queryset(self):
        return super().get_queryset().filter(is_archived=True)


class HardwareAsset(models.Model):
    # Asset type choices
    LAPTOP = 'laptop'
    DESKTOP = 'desktop'
    SERVER = 'server'
    MONITOR = 'monitor'
    PHONE = 'phone'
    TABLET = 'tablet'
    PRINTER = 'printer'
    NETWORK_SWITCH = 'network_switch'
    ROUTER = 'router'
    UPS = 'ups'
    PERIPHERAL = 'peripheral'
    OTHER = 'other'

    ASSET_TYPE_CHOICES = [
        (LAPTOP, 'Laptop'),
        (DESKTOP, 'Desktop'),
        (SERVER, 'Server'),
        (MONITOR, 'Monitor'),
        (PHONE, 'Phone'),
        (TABLET, 'Tablet'),
        (PRINTER, 'Printer'),
        (NETWORK_SWITCH, 'Network Switch'),
        (ROUTER, 'Router'),
        (UPS, 'UPS'),
        (PERIPHERAL, 'Peripheral'),
        (OTHER, 'Other'),
    ]

    # Status choices
    PROCUREMENT = 'procurement'
    ACTIVE = 'active'
    UNDER_REPAIR = 'under_repair'
    RETIRED = 'retired'
    DISPOSED = 'disposed'

    STATUS_CHOICES = [
        (PROCUREMENT, 'Procurement'),
        (ACTIVE, 'Active'),
        (UNDER_REPAIR, 'Under Repair'),
        (RETIRED, 'Retired'),
        (DISPOSED, 'Disposed'),
    ]

    # Acceptance status choices
    ACCEPTANCE_NONE = 'none'
    ACCEPTANCE_PENDING = 'pending'
    ACCEPTANCE_ACCEPTED = 'accepted'
    ACCEPTANCE_REJECTED = 'rejected'

    ACCEPTANCE_STATUS_CHOICES = [
        (ACCEPTANCE_NONE,     'Not Required'),
        (ACCEPTANCE_PENDING,  'Pending User Acceptance'),
        (ACCEPTANCE_ACCEPTED, 'Accepted by User'),
        (ACCEPTANCE_REJECTED, 'Rejected by User'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_tag = models.CharField(max_length=50, unique=True, blank=True, db_index=True)
    name = models.CharField(max_length=200)
    asset_type = models.CharField(max_length=50, choices=ASSET_TYPE_CHOICES)
    make = models.CharField(max_length=100, blank=True)
    model_name = models.CharField(max_length=100, blank=True)
    serial_number = models.CharField(max_length=200, blank=True, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=ACTIVE,
        db_index=True,
    )
    location = models.CharField(max_length=200, blank=True)
    assigned_to = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='hardware_assets',
    )
    purchase_date = models.DateField(null=True, blank=True)
    purchase_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    warranty_expiry = models.DateField(null=True, blank=True, db_index=True)
    notes = models.TextField(blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    qr_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    site = models.ForeignKey(
        'Site',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assets',
    )
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='archived_assets'
    )
    archive_reason = models.TextField(blank=True)

    # Asset acceptance tracking
    acceptance_status = models.CharField(
        max_length=15,
        choices=ACCEPTANCE_STATUS_CHOICES,
        default=ACCEPTANCE_NONE,
        db_index=True,
    )
    acceptance_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    accepted_at = models.DateTimeField(null=True, blank=True)
    acceptance_notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Custom managers
    objects = HardwareAssetManager()          # default: excludes archived
    archived = ArchivedHardwareAssetManager() # archived records only
    all_records = models.Manager()            # unfiltered — for admin and archive/unarchive endpoints

    class Meta:
        app_label = 'assets'
        db_table = 'assets_hardware'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.asset_tag} — {self.name}'

    def save(self, *args, **kwargs):
        if not self.asset_tag:
            seq = AssetCounter.next()
            self.asset_tag = f'HW-{seq:05d}'
        super().save(*args, **kwargs)

    @property
    def warranty_status(self):
        if not self.warranty_expiry:
            return 'unknown'
        today = timezone.now().date()
        delta = (self.warranty_expiry - today).days
        if delta < 0:
            return 'expired'
        if delta <= 90:
            return 'expiring_soon'
        return 'valid'


class AssetStatusHistory(models.Model):
    asset = models.ForeignKey(
        HardwareAsset,
        on_delete=models.CASCADE,
        related_name='status_history',
    )
    old_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='asset_status_changes',
    )
    notes = models.CharField(max_length=500, blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'assets'
        db_table = 'assets_status_history'
        ordering = ['-changed_at']

    def __str__(self):
        return (
            f'{self.asset.asset_tag}: {self.old_status} → {self.new_status}'
            f' at {self.changed_at:%Y-%m-%d %H:%M}'
        )


class AssetAuditLog(models.Model):
    """Records scan-based audit confirmations — user confirms asset is at a location."""
    asset = models.ForeignKey(HardwareAsset, on_delete=models.CASCADE, related_name='audit_logs')
    confirmed_by = models.ForeignKey('accounts.User', on_delete=models.PROTECT)
    location_note = models.CharField(max_length=500, blank=True)
    confirmed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'asset_audit_log'
        ordering = ['-confirmed_at']

    def __str__(self):
        return f'{self.asset.asset_tag} confirmed by {self.confirmed_by.email} at {self.confirmed_at:%Y-%m-%d %H:%M}'
