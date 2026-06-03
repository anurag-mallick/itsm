from rest_framework import serializers
from .models import InboundMailbox


class InboundMailboxSerializer(serializers.ModelSerializer):
    default_category_name = serializers.CharField(
        source='default_category.name', read_only=True, allow_null=True
    )
    protocol_display = serializers.CharField(source='get_protocol_display', read_only=True)
    # Never return raw password in GET responses
    password = serializers.CharField(write_only=True)

    class Meta:
        model = InboundMailbox
        fields = [
            'id', 'name', 'email_address', 'protocol', 'protocol_display',
            'host', 'port', 'username', 'password', 'use_ssl',
            'imap_folder', 'processed_folder',
            'default_category', 'default_category_name', 'default_priority',
            'is_active', 'poll_interval_seconds',
            'last_polled_at', 'last_error', 'emails_processed', 'created_at',
        ]
        read_only_fields = [
            'id', 'last_polled_at', 'last_error', 'emails_processed', 'created_at',
        ]

    def validate_port(self, value):
        if not (1 <= value <= 65535):
            raise serializers.ValidationError('Port must be between 1 and 65535.')
        return value
