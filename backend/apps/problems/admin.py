from django.contrib import admin

from .models import ProblemCounter, ProblemRecord


@admin.register(ProblemRecord)
class ProblemRecordAdmin(admin.ModelAdmin):
    list_display = [
        'ref_number', 'title', 'status', 'priority',
        'owner', 'linked_ticket_count', 'created_at', 'updated_at',
    ]
    list_filter = ['status', 'priority']
    search_fields = ['ref_number', 'title', 'description']
    readonly_fields = ['id', 'ref_number', 'created_at', 'updated_at', 'resolved_at']
    ordering = ['-created_at']
    raw_id_fields = ['owner']
    filter_horizontal = ['linked_tickets']
    fieldsets = [
        (None, {
            'fields': ['id', 'ref_number', 'title', 'description', 'status', 'priority', 'owner'],
        }),
        ('Investigation', {
            'fields': ['root_cause', 'workaround', 'resolution'],
        }),
        ('Linked Tickets', {
            'fields': ['linked_tickets'],
        }),
        ('Timestamps', {
            'fields': ['created_at', 'updated_at', 'resolved_at'],
            'classes': ['collapse'],
        }),
    ]

    def linked_ticket_count(self, obj):
        return obj.linked_tickets.count()
    linked_ticket_count.short_description = 'Tickets'


@admin.register(ProblemCounter)
class ProblemCounterAdmin(admin.ModelAdmin):
    list_display = ['id', 'current']
