from django.contrib import admin
from .models import WorkflowRule


@admin.register(WorkflowRule)
class WorkflowRuleAdmin(admin.ModelAdmin):
    list_display = ['name', 'trigger', 'condition_match', 'is_active', 'run_order', 'times_triggered', 'last_triggered_at', 'created_at']
    list_filter = ['trigger', 'is_active', 'condition_match']
    search_fields = ['name', 'description']
    readonly_fields = ['id', 'times_triggered', 'last_triggered_at', 'created_at', 'updated_at']
    ordering = ['run_order', 'created_at']
