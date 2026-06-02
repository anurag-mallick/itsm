from django.contrib import admin

from .models import AssetAuditLog, AssetStatusHistory, HardwareAsset, Site


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ['name', 'city', 'country', 'contact_name', 'contact_email', 'is_active', 'created_at']
    list_filter = ['is_active', 'country', 'created_at']
    search_fields = ['name', 'city', 'country', 'contact_name', 'contact_email']
    ordering = ['name']


@admin.register(HardwareAsset)
class HardwareAssetAdmin(admin.ModelAdmin):
    list_display = [
        'asset_tag',
        'name',
        'asset_type',
        'status',
        'location',
        'site',
        'assigned_to',
        'warranty_expiry',
        'created_at',
    ]
    list_filter = ['status', 'asset_type', 'site', 'created_at']
    search_fields = ['asset_tag', 'name', 'serial_number', 'location']
    readonly_fields = ['asset_tag', 'qr_token', 'created_at', 'updated_at']
    raw_id_fields = ['assigned_to', 'site']
    ordering = ['-created_at']

    fieldsets = [
        (
            'Identification',
            {
                'fields': [
                    'asset_tag',
                    'name',
                    'asset_type',
                    'make',
                    'model_name',
                    'serial_number',
                    'qr_token',
                ]
            },
        ),
        (
            'Status & Location',
            {'fields': ['status', 'location', 'site', 'assigned_to']},
        ),
        (
            'Purchase & Warranty',
            {'fields': ['purchase_date', 'purchase_cost', 'warranty_expiry']},
        ),
        (
            'Additional',
            {'fields': ['notes', 'custom_fields', 'created_at', 'updated_at']},
        ),
    ]


@admin.register(AssetStatusHistory)
class AssetStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ['asset', 'old_status', 'new_status', 'changed_by', 'changed_at']
    list_filter = ['old_status', 'new_status', 'changed_at']
    search_fields = ['asset__asset_tag', 'asset__name', 'changed_by__email']
    readonly_fields = ['asset', 'old_status', 'new_status', 'changed_by', 'changed_at']
    ordering = ['-changed_at']


@admin.register(AssetAuditLog)
class AssetAuditLogAdmin(admin.ModelAdmin):
    list_display = ['asset', 'confirmed_by', 'location_note', 'confirmed_at']
    list_filter = ['confirmed_at']
    search_fields = ['asset__asset_tag', 'asset__name', 'confirmed_by__email', 'location_note']
    readonly_fields = ['asset', 'confirmed_by', 'location_note', 'confirmed_at']
    ordering = ['-confirmed_at']
