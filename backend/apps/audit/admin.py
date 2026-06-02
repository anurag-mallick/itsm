from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['timestamp', 'user_email', 'action', 'module', 'record_repr', 'ip_address']
    list_filter = ['action', 'module']
    search_fields = ['user_email', 'record_repr', 'record_id']
    ordering = ['-timestamp']
    # Every field is read-only — the log must never be altered via the admin
    readonly_fields = [f.name for f in AuditLog._meta.get_fields()]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
