from django.utils import timezone
from rest_framework import serializers

from apps.custom_fields.models import FieldSchema

from .models import AssetAuditLog, AssetStatusHistory, HardwareAsset, Site


class AssetStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AssetStatusHistory
        fields = [
            'id',
            'old_status',
            'new_status',
            'changed_by',
            'changed_by_name',
            'notes',
            'changed_at',
        ]
        read_only_fields = fields

    def get_changed_by_name(self, obj):
        return obj.changed_by.full_name if obj.changed_by else ''


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = [
            'id',
            'name',
            'address',
            'city',
            'country',
            'contact_name',
            'contact_email',
            'is_active',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class AssetAuditLogSerializer(serializers.ModelSerializer):
    confirmed_by_name = serializers.CharField(source='confirmed_by.full_name', read_only=True)
    confirmed_by_email = serializers.CharField(source='confirmed_by.email', read_only=True)

    class Meta:
        model = AssetAuditLog
        fields = ['id', 'confirmed_by_name', 'confirmed_by_email', 'location_note', 'confirmed_at']


class HardwareAssetListSerializer(serializers.ModelSerializer):
    assigned_to_email = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    warranty_status = serializers.SerializerMethodField()
    archived_by_email = serializers.SerializerMethodField()
    site = SiteSerializer(read_only=True)
    site_id = serializers.PrimaryKeyRelatedField(
        queryset=Site.objects.all(), source='site', write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = HardwareAsset
        fields = [
            'id',
            'asset_tag',
            'name',
            'asset_type',
            'status',
            'location',
            'assigned_to',
            'assigned_to_email',
            'assigned_to_name',
            'warranty_expiry',
            'warranty_status',
            'qr_token',
            'site',
            'site_id',
            'is_archived',
            'archived_at',
            'archive_reason',
            'archived_by_email',
            'acceptance_status',
            'acceptance_token',
            'accepted_at',
            'acceptance_notes',
            'created_at',
        ]
        read_only_fields = [
            'id', 'asset_tag', 'qr_token', 'created_at',
            'is_archived', 'archived_at', 'archive_reason', 'archived_by_email',
            'acceptance_status',
            'acceptance_token', 'accepted_at', 'acceptance_notes',
        ]

    def get_assigned_to_email(self, obj):
        return obj.assigned_to.email if obj.assigned_to else None

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.full_name if obj.assigned_to else None

    def get_warranty_status(self, obj):
        return obj.warranty_status

    def get_archived_by_email(self, obj):
        return obj.archived_by.email if obj.archived_by else None


class HardwareAssetDetailSerializer(serializers.ModelSerializer):
    assigned_to_email = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    warranty_status = serializers.SerializerMethodField()
    archived_by_email = serializers.SerializerMethodField()
    status_history = AssetStatusHistorySerializer(many=True, read_only=True)
    site = SiteSerializer(read_only=True)
    site_id = serializers.PrimaryKeyRelatedField(
        queryset=Site.objects.all(), source='site', write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = HardwareAsset
        fields = [
            'id',
            'asset_tag',
            'name',
            'asset_type',
            'make',
            'model_name',
            'serial_number',
            'status',
            'location',
            'assigned_to',
            'assigned_to_email',
            'assigned_to_name',
            'purchase_date',
            'purchase_cost',
            'warranty_expiry',
            'warranty_status',
            'notes',
            'custom_fields',
            'qr_token',
            'site',
            'site_id',
            'is_archived',
            'archived_at',
            'archive_reason',
            'archived_by_email',
            'acceptance_status',
            'acceptance_token',
            'accepted_at',
            'acceptance_notes',
            'created_at',
            'updated_at',
            'status_history',
        ]
        read_only_fields = [
            'id', 'asset_tag', 'qr_token', 'created_at', 'updated_at',
            'is_archived', 'archived_at', 'archive_reason', 'archived_by_email',
            'acceptance_status',
            'acceptance_token', 'accepted_at', 'acceptance_notes',
        ]

    def validate(self, attrs):
        custom_fields = attrs.get('custom_fields', getattr(self.instance, 'custom_fields', {}))
        if custom_fields is None:
            custom_fields = {}

        from apps.custom_fields.models import FieldSchema

        schemas = {
            fs.name: fs
            for fs in FieldSchema.objects.filter(
                module=FieldSchema.HARDWARE, is_active=True
            )
        }

        errors = {}
        for field_name, field_value in custom_fields.items():
            schema = schemas.get(field_name)
            if schema is None:
                errors[field_name] = f'Unknown custom field: {field_name}.'
                continue
            valid, error = schema.validate_value(field_value)
            if not valid:
                errors[field_name] = error

        for name, schema in schemas.items():
            if schema.is_required and name not in custom_fields:
                errors[name] = f'{schema.label} is required.'

        if errors:
            raise serializers.ValidationError({'custom_fields': errors})

        return attrs

    def get_assigned_to_email(self, obj):
        return obj.assigned_to.email if obj.assigned_to else None

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.full_name if obj.assigned_to else None

    def get_warranty_status(self, obj):
        return obj.warranty_status

    def get_archived_by_email(self, obj):
        return obj.archived_by.email if obj.archived_by else None



class HardwareAssetCreateSerializer(serializers.ModelSerializer):
    site_id = serializers.PrimaryKeyRelatedField(
        queryset=Site.objects.all(), source='site', required=False, allow_null=True
    )

    class Meta:
        model = HardwareAsset
        fields = [
            'name',
            'asset_type',
            'make',
            'model_name',
            'serial_number',
            'status',
            'location',
            'assigned_to',
            'purchase_date',
            'purchase_cost',
            'warranty_expiry',
            'notes',
            'custom_fields',
            'site_id',
        ]

    def validate_custom_fields(self, value):
        """Validate each supplied custom field against its FieldSchema definition."""
        if not value:
            return value
        schemas = {
            fs.name: fs
            for fs in FieldSchema.objects.filter(
                module=FieldSchema.HARDWARE, is_active=True
            )
        }
        errors = {}
        for field_name, field_value in value.items():
            schema = schemas.get(field_name)
            if schema is None:
                errors[field_name] = f'Unknown custom field: {field_name}.'
                continue
            valid, error = schema.validate_value(field_value)
            if not valid:
                errors[field_name] = error
        if errors:
            raise serializers.ValidationError(errors)
        # Check required fields that were not supplied
        for name, schema in schemas.items():
            if schema.is_required and name not in value:
                errors[name] = f'{schema.label} is required.'
        if errors:
            raise serializers.ValidationError(errors)
        return value


class ArchiveActionSerializer(serializers.Serializer):
    """Mandatory reason for archiving or unarchiving. Minimum 10 characters."""
    reason = serializers.CharField(
        min_length=10,
        max_length=1000,
        help_text='Mandatory reason for archiving or unarchiving. Minimum 10 characters.',
        error_messages={'min_length': 'Archive reason must be at least 10 characters.'},
    )


# Alias kept for any internal references that use the old name.
AssetArchiveSerializer = ArchiveActionSerializer
