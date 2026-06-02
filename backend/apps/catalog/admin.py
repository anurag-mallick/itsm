from django.contrib import admin

from .models import CatalogCategory, CatalogItem, ServiceRequest, ServiceRequestCounter


@admin.register(CatalogCategory)
class CatalogCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'display_order', 'is_active']
    list_editable = ['display_order', 'is_active']
    search_fields = ['name']
    ordering = ['display_order', 'name']


@admin.register(CatalogItem)
class CatalogItemAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'category', 'fulfillment_sla_hours',
        'auto_create_ticket', 'requires_manager_approval',
        'is_active', 'display_order',
    ]
    list_filter = ['category', 'is_active', 'auto_create_ticket', 'requires_manager_approval']
    list_editable = ['is_active', 'display_order']
    search_fields = ['name', 'description']
    ordering = ['category', 'display_order', 'name']
    readonly_fields = ['id', 'created_at']
    fieldsets = [
        (None, {
            'fields': ['id', 'category', 'name', 'description', 'icon', 'display_order', 'is_active'],
        }),
        ('Form & Fulfilment', {
            'fields': ['form_fields', 'fulfillment_sla_hours', 'auto_create_ticket', 'requires_manager_approval'],
        }),
        ('Timestamps', {
            'fields': ['created_at'],
            'classes': ['collapse'],
        }),
    ]


@admin.register(ServiceRequest)
class ServiceRequestAdmin(admin.ModelAdmin):
    list_display = [
        'ref_number', 'catalog_item', 'requested_by',
        'status', 'linked_ticket', 'created_at',
    ]
    list_filter = ['status', 'catalog_item__category']
    search_fields = ['ref_number', 'requested_by__email', 'catalog_item__name']
    readonly_fields = ['id', 'ref_number', 'created_at', 'updated_at', 'fulfilled_at']
    ordering = ['-created_at']
    raw_id_fields = ['catalog_item', 'requested_by', 'linked_ticket']


@admin.register(ServiceRequestCounter)
class ServiceRequestCounterAdmin(admin.ModelAdmin):
    list_display = ['id', 'current']
