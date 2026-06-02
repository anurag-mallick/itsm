"""
Django signals that auto-create SoftwareLicenseEvent records whenever
a SoftwareLicense or SoftwareInstallation changes meaningfully.
"""
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import SoftwareInstallation, SoftwareLicense, SoftwareLicenseEvent


# ── License signals ───────────────────────────────────────────────────────────

@receiver(pre_save, sender=SoftwareLicense)
def license_pre_save(sender, instance, **kwargs):
    """
    Capture old field values before the save so we can compare them in
    post_save without an extra DB query.
    """
    if not instance.pk:
        return  # Creation — nothing to diff yet
    try:
        old = SoftwareLicense.objects.get(pk=instance.pk)
    except SoftwareLicense.DoesNotExist:
        return
    instance._pre_save_seat_count = old.seat_count
    instance._pre_save_expiry_date = old.expiry_date
    instance._pre_save_is_active = old.is_active


@receiver(post_save, sender=SoftwareLicense)
def license_post_save(sender, instance, created, **kwargs):
    if created:
        SoftwareLicenseEvent.objects.create(
            license=instance,
            event_type=SoftwareLicenseEvent.LICENSE_CREATED,
            description=f'License "{instance.name}" created with {instance.seat_count} seat(s).',
            new_value={
                'seat_count': instance.seat_count,
                'expiry_date': str(instance.expiry_date) if instance.expiry_date else None,
            },
        )
        return

    # Seat count changed
    old_seats = getattr(instance, '_pre_save_seat_count', None)
    if old_seats is not None and old_seats != instance.seat_count:
        SoftwareLicenseEvent.objects.create(
            license=instance,
            event_type=SoftwareLicenseEvent.SEAT_CHANGED,
            description=f'Seat count changed from {old_seats} to {instance.seat_count}.',
            old_value={'seat_count': old_seats},
            new_value={'seat_count': instance.seat_count},
        )

    # Expiry date changed
    old_expiry = getattr(instance, '_pre_save_expiry_date', None)
    if old_expiry != instance.expiry_date and hasattr(instance, '_pre_save_expiry_date'):
        old_str = str(old_expiry) if old_expiry else None
        new_str = str(instance.expiry_date) if instance.expiry_date else None
        # Distinguish a genuine renewal (new date is later) from a simple edit
        if old_expiry and instance.expiry_date and instance.expiry_date > old_expiry:
            event_type = SoftwareLicenseEvent.EXPIRY_RENEWED
            description = f'Subscription renewed: expiry extended from {old_str} to {new_str}.'
        else:
            event_type = SoftwareLicenseEvent.EXPIRY_CHANGED
            description = f'Expiry date changed from {old_str} to {new_str}.'
        SoftwareLicenseEvent.objects.create(
            license=instance,
            event_type=event_type,
            description=description,
            old_value={'expiry_date': old_str},
            new_value={'expiry_date': new_str},
        )

    # Active status changed
    old_active = getattr(instance, '_pre_save_is_active', None)
    if old_active is not None and old_active != instance.is_active:
        SoftwareLicenseEvent.objects.create(
            license=instance,
            event_type=SoftwareLicenseEvent.STATUS_CHANGED,
            description=f'License status changed to {"Active" if instance.is_active else "Inactive"}.',
            old_value={'is_active': old_active},
            new_value={'is_active': instance.is_active},
        )


# ── Installation signals ──────────────────────────────────────────────────────

@receiver(post_save, sender=SoftwareInstallation)
def installation_added(sender, instance, created, **kwargs):
    if not created:
        return
    SoftwareLicenseEvent.objects.create(
        license=instance.license,
        event_type=SoftwareLicenseEvent.INSTALLATION_ADDED,
        description=(
            f'Installed on {instance.hardware_asset.asset_tag} '
            f'({instance.hardware_asset.name}).'
        ),
        new_value={
            'asset_tag': instance.hardware_asset.asset_tag,
            'asset_name': instance.hardware_asset.name,
        },
    )


@receiver(post_delete, sender=SoftwareInstallation)
def installation_removed(sender, instance, **kwargs):
    SoftwareLicenseEvent.objects.create(
        license=instance.license,
        event_type=SoftwareLicenseEvent.INSTALLATION_REMOVED,
        description=(
            f'Removed from {instance.hardware_asset.asset_tag} '
            f'({instance.hardware_asset.name}).'
        ),
        old_value={
            'asset_tag': instance.hardware_asset.asset_tag,
            'asset_name': instance.hardware_asset.name,
        },
    )
