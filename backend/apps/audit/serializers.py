from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    action_display = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user_email', 'action', 'action_display',
            'module', 'record_id', 'record_repr', 'field_name',
            'old_value', 'new_value', 'ip_address', 'timestamp',
        ]
