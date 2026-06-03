from rest_framework import serializers
from .models import WorkflowRule


class WorkflowRuleSerializer(serializers.ModelSerializer):
    trigger_display = serializers.CharField(source='get_trigger_display', read_only=True)
    created_by_email = serializers.CharField(
        source='created_by.email', read_only=True, allow_null=True
    )
    condition_match_display = serializers.CharField(
        source='get_condition_match_display', read_only=True
    )

    class Meta:
        model = WorkflowRule
        fields = [
            'id', 'name', 'description', 'trigger', 'trigger_display',
            'conditions', 'condition_match', 'condition_match_display',
            'actions', 'is_active', 'run_order',
            'times_triggered', 'last_triggered_at',
            'created_by_email', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'times_triggered', 'last_triggered_at',
            'created_at', 'updated_at', 'created_by_email',
        ]
