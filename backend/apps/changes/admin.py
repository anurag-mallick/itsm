from django.contrib import admin

from .models import ChangeComment, ChangeRequest


@admin.register(ChangeRequest)
class ChangeRequestAdmin(admin.ModelAdmin):
    list_display = [
        'ref_number',
        'title',
        'change_type',
        'priority',
        'status',
        'reporter',
        'assignee',
        'due_date',
        'is_archived',
        'created_at',
    ]
    list_filter = ['status', 'priority', 'change_type', 'is_archived']
    search_fields = ['ref_number', 'title', 'description', 'reporter__email', 'assignee__email']
    readonly_fields = ['ref_number', 'created_at', 'updated_at']
    ordering = ['-created_at']


@admin.register(ChangeComment)
class ChangeCommentAdmin(admin.ModelAdmin):
    list_display = ['change', 'author', 'created_at']
    list_filter = ['created_at']
    search_fields = ['change__ref_number', 'author__email', 'body']
    readonly_fields = ['created_at']
    ordering = ['-created_at']
