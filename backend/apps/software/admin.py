from django.contrib import admin

from .models import SoftwareInstallation, SoftwareLicense


@admin.register(SoftwareLicense)
class SoftwareLicenseAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'vendor',
        'version',
        'license_type',
        'seat_count',
        'expiry_date',
        'is_active',
        'created_at',
    ]
    list_filter = ['license_type', 'is_active', 'expiry_date']
    search_fields = ['name', 'vendor', 'version']
    readonly_fields = ['created_at', 'updated_at']
    ordering = ['name']

    fieldsets = [
        (
            'License Details',
            {
                'fields': [
                    'name',
                    'vendor',
                    'version',
                    'license_type',
                    'seat_count',
                    'is_active',
                ]
            },
        ),
        (
            'License Key',
            {
                'fields': ['license_key'],
                'classes': ['collapse'],
                'description': (
                    'The license key is sensitive. Access is restricted to admin users only.'
                ),
            },
        ),
        (
            'Purchase & Expiry',
            {'fields': ['purchase_date', 'expiry_date', 'purchase_cost']},
        ),
        (
            'Additional',
            {'fields': ['notes', 'custom_fields', 'created_at', 'updated_at']},
        ),
    ]


@admin.register(SoftwareInstallation)
class SoftwareInstallationAdmin(admin.ModelAdmin):
    list_display = [
        'license',
        'hardware_asset',
        'installed_on',
        'installed_by',
        'created_at',
    ]
    list_filter = ['installed_on', 'created_at']
    search_fields = [
        'license__name',
        'hardware_asset__asset_tag',
        'hardware_asset__name',
        'installed_by__email',
    ]
    readonly_fields = ['created_at']
    raw_id_fields = ['license', 'hardware_asset', 'installed_by']
    ordering = ['-created_at']
