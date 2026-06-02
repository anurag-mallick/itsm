from django.contrib import admin

from .models import Attachment, CannedResponse, Category, Comment, Ticket


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'parent', 'sla_response_hours', 'sla_resolution_hours', 'default_assignee', 'is_active']
    list_filter = ['is_active', 'parent']
    search_fields = ['name']
    raw_id_fields = ['default_assignee']
    list_select_related = ['parent', 'default_assignee']


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = [
        'ticket_number',
        'subject',
        'status',
        'priority',
        'source',
        'category',
        'requestor',
        'assignee',
        'sla_due_at',
        'sla_breached',
        'created_at',
    ]
    list_filter = ['status', 'priority', 'source', 'sla_breached', 'category']
    search_fields = ['ticket_number', 'subject', 'requestor__email', 'assignee__email']
    raw_id_fields = ['requestor', 'assignee', 'category']
    readonly_fields = ['ticket_number', 'created_at', 'updated_at', 'resolved_at', 'closed_at']
    list_select_related = ['category', 'requestor', 'assignee']
    date_hierarchy = 'created_at'
    ordering = ['-created_at']


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ['id', 'ticket', 'author', 'comment_type', 'source', 'created_at']
    list_filter = ['comment_type', 'source']
    search_fields = ['ticket__ticket_number', 'author__email', 'body']
    raw_id_fields = ['ticket', 'author']
    list_select_related = ['ticket', 'author']
    readonly_fields = ['created_at']


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'original_filename', 'ticket', 'uploaded_by', 'file_size', 'created_at']
    search_fields = ['original_filename', 'ticket__ticket_number', 'uploaded_by__email']
    raw_id_fields = ['ticket', 'comment', 'uploaded_by']
    list_select_related = ['ticket', 'uploaded_by']
    readonly_fields = ['created_at']


@admin.register(CannedResponse)
class CannedResponseAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'scope', 'category', 'created_by', 'is_active', 'created_at']
    list_filter = ['scope', 'is_active', 'category']
    search_fields = ['name', 'body', 'created_by__email']
    raw_id_fields = ['category', 'created_by']
    list_select_related = ['category', 'created_by']
    readonly_fields = ['created_at', 'updated_at']
