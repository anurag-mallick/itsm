from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_notification_type_display', read_only=True)
    is_read = serializers.SerializerMethodField()

    def get_is_read(self, obj):
        return obj.read_at is not None

    class Meta:
        model = Notification
        fields = [
            'id', 'notification_type', 'type_display',
            'title', 'body', 'url', 'is_read', 'read_at', 'created_at',
        ]
