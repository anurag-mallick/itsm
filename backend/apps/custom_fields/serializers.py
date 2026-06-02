from rest_framework import serializers
from .models import FieldSchema


class FieldSchemaSerializer(serializers.ModelSerializer):
    module_display = serializers.CharField(source='get_module_display', read_only=True)
    field_type_display = serializers.CharField(source='get_field_type_display', read_only=True)

    class Meta:
        model = FieldSchema
        fields = [
            'id', 'module', 'module_display', 'category_id',
            'name', 'label', 'field_type', 'field_type_display',
            'options', 'placeholder', 'help_text',
            'is_required', 'is_active', 'validation_rules',
            'display_order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        field_type = data.get('field_type', getattr(self.instance, 'field_type', ''))
        options = data.get('options', getattr(self.instance, 'options', []))
        if field_type in (FieldSchema.DROPDOWN, FieldSchema.MULTI_SELECT) and not options:
            raise serializers.ValidationError({'options': 'Options are required for dropdown and multi-select fields.'})
        return data
