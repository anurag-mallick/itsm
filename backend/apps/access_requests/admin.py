from django.contrib import admin
from .models import AccessRequest, AccessRequestCounter


@admin.register(AccessRequest)
class AccessRequestAdmin(admin.ModelAdmin):
    list_display = [
        'ref_number', 'request_type', 'status',
        'requested_by', 'manager_email', 'created_at',
    ]
    search_fields = ['ref_number', 'requested_by__email', 'manager_email']
    list_filter = ['status', 'request_type']
    readonly_fields = ['id', 'ref_number', 'approval_token', 'created_at', 'updated_at']


@admin.register(AccessRequestCounter)
class AccessRequestCounterAdmin(admin.ModelAdmin):
    list_display = ['id', 'current']
