from django.contrib import admin

from .models import InboundMailbox


@admin.register(InboundMailbox)
class InboundMailboxAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'email_address', 'protocol', 'host', 'port',
        'is_active', 'last_polled_at', 'emails_processed',
    ]
    list_filter = ['protocol', 'is_active']
    search_fields = ['name', 'email_address', 'host']
    readonly_fields = [
        'last_polled_at', 'last_error', 'emails_processed', 'created_at', 'updated_at',
    ]
