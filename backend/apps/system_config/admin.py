from django.contrib import admin

from .models import SystemConfig


@admin.register(SystemConfig)
class SystemConfigAdmin(admin.ModelAdmin):
    list_display = ('key', 'section', 'label', 'is_secret', 'is_required', 'updated_at', 'updated_by_email')
    list_filter = ('section', 'is_secret', 'is_required')
    search_fields = ('key', 'label', 'help_text')
    ordering = ('section', 'display_order')
    readonly_fields = ('updated_at',)

    fieldsets = (
        (None, {
            'fields': ('key', 'section', 'label', 'help_text', 'value'),
        }),
        ('Flags', {
            'fields': ('is_secret', 'is_required', 'display_order'),
        }),
        ('Audit', {
            'fields': ('updated_at', 'updated_by_email'),
        }),
    )
