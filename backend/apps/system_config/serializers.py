from rest_framework import serializers

from .models import SystemConfig


class SystemConfigSerializer(serializers.ModelSerializer):
    """
    Read serializer for SystemConfig.
    Secrets are masked in the display_value field.
    The actual value field is write-only so GET responses never expose raw secrets.
    """
    display_value = serializers.SerializerMethodField()

    def get_display_value(self, obj):
        if obj.is_secret and obj.value:
            return '••••••••'
        return obj.value

    class Meta:
        model = SystemConfig
        fields = [
            'id',
            'key',
            'value',
            'display_value',
            'section',
            'label',
            'help_text',
            'is_secret',
            'is_required',
            'display_order',
            'updated_at',
        ]
        extra_kwargs = {
            'value': {'write_only': True},
        }


class SystemConfigUpdateSerializer(serializers.Serializer):
    """
    Bulk update serializer.
    Accepts a list of {key, value} dicts.
    """
    updates = serializers.ListField(
        child=serializers.DictField(child=serializers.CharField(allow_blank=True)),
        min_length=1,
    )

    def validate_updates(self, updates):
        """Ensure each item has a 'key' field and that the key exists in the DB."""
        errors = []
        valid_keys = set(SystemConfig.objects.values_list('key', flat=True))

        for idx, item in enumerate(updates):
            if 'key' not in item:
                errors.append(f'Item at index {idx} is missing "key".')
                continue
            if item['key'] not in valid_keys:
                errors.append(f'Unknown config key: "{item["key"]}".')

        if errors:
            raise serializers.ValidationError(errors)

        return updates
