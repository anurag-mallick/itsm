import uuid
from django.db import models


class WorkflowRule(models.Model):
    """A single automation rule with conditions and actions."""

    TRIGGER_TICKET_CREATED = 'ticket_created'
    TRIGGER_TICKET_UPDATED = 'ticket_updated'
    TRIGGER_CHOICES = [
        (TRIGGER_TICKET_CREATED, 'When a ticket is created'),
        (TRIGGER_TICKET_UPDATED, 'When a ticket is updated'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    trigger = models.CharField(
        max_length=30,
        choices=TRIGGER_CHOICES,
        default=TRIGGER_TICKET_CREATED,
        db_index=True,
    )

    # conditions: list of condition dicts
    # [{"field": "category_id", "operator": "equals", "value": "123"},
    #  {"field": "priority", "operator": "in", "value": ["high","critical"]}]
    conditions = models.JSONField(default=list)

    # condition_match: 'all' (AND) or 'any' (OR)
    condition_match = models.CharField(
        max_length=5,
        choices=[('all', 'All conditions (AND)'), ('any', 'Any condition (OR)')],
        default='all',
    )

    # actions: list of action dicts
    # [{"type": "assign_to", "value": "user-uuid"},
    #  {"type": "set_priority", "value": "high"},
    #  {"type": "set_category", "value": "cat-id"},
    #  {"type": "send_notification", "value": "agent-uuid"},
    #  {"type": "add_note", "value": "Auto-assigned based on priority rule"}]
    actions = models.JSONField(default=list)

    is_active = models.BooleanField(default=True, db_index=True)
    run_order = models.PositiveSmallIntegerField(
        default=0,
        help_text='Lower numbers run first',
    )

    # Execution stats
    times_triggered = models.PositiveIntegerField(default=0)
    last_triggered_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        'accounts.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_workflows',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'workflow_rule'
        ordering = ['run_order', 'created_at']

    def __str__(self):
        return f'{self.name} ({self.get_trigger_display()})'
