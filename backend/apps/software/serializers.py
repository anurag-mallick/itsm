from rest_framework import serializers

from apps.custom_fields.models import FieldSchema

from .models import SeatRequest, SoftwareInstallation, SoftwareLicense, SoftwareLicenseEvent


class SoftwareInstallationSerializer(serializers.ModelSerializer):
    license_name = serializers.SerializerMethodField()
    hardware_asset_tag = serializers.SerializerMethodField()
    hardware_asset_name = serializers.SerializerMethodField()
    assigned_user_name = serializers.SerializerMethodField()
    assigned_user_email = serializers.SerializerMethodField()
    installed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SoftwareInstallation
        fields = [
            'id',
            'license',
            'license_name',
            'hardware_asset',
            'hardware_asset_tag',
            'hardware_asset_name',
            'assigned_user',
            'assigned_user_name',
            'assigned_user_email',
            'installed_on',
            'installed_by',
            'installed_by_name',
            'notes',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_license_name(self, obj):
        return obj.license.name

    def get_hardware_asset_tag(self, obj):
        return obj.hardware_asset.asset_tag if obj.hardware_asset else None

    def get_hardware_asset_name(self, obj):
        return obj.hardware_asset.name if obj.hardware_asset else None

    def get_assigned_user_name(self, obj):
        return obj.assigned_user.full_name if obj.assigned_user else None

    def get_assigned_user_email(self, obj):
        return obj.assigned_user.email if obj.assigned_user else None

    def get_installed_by_name(self, obj):
        return obj.installed_by.full_name if obj.installed_by else None

    def validate(self, attrs):
        license_obj = attrs.get('license') or (
            self.instance.license if self.instance else None
        )
        hardware_asset = attrs.get('hardware_asset') or (
            self.instance.hardware_asset if self.instance else None
        )
        if license_obj and hardware_asset:
            qs = SoftwareInstallation.objects.filter(
                license=license_obj, hardware_asset=hardware_asset
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    'This software license is already installed on the specified hardware asset.'
                )
        return attrs


class SoftwareLicenseListSerializer(serializers.ModelSerializer):
    seats_used = serializers.SerializerMethodField()
    is_compliant = serializers.SerializerMethodField()
    days_until_expiry = serializers.SerializerMethodField()

    class Meta:
        model = SoftwareLicense
        fields = [
            'id',
            'name',
            'vendor',
            'license_type',
            'seat_count',
            'seats_used',
            'seats_available',
            'is_compliant',
            'expiry_date',
            'days_until_expiry',
            'is_active',
        ]

    def get_seats_used(self, obj):
        # Use annotated value if present (for bulk queries), otherwise property
        if hasattr(obj, '_seats_used'):
            return obj._seats_used
        return obj.seats_used

    def get_is_compliant(self, obj):
        seats_used = self.get_seats_used(obj)
        return seats_used <= obj.seat_count

    def get_days_until_expiry(self, obj):
        return obj.days_until_expiry


class SoftwareLicenseDetailSerializer(serializers.ModelSerializer):
    """Full detail — license_key is intentionally excluded for security."""

    seats_used = serializers.SerializerMethodField()
    is_compliant = serializers.SerializerMethodField()
    days_until_expiry = serializers.SerializerMethodField()
    installations = SoftwareInstallationSerializer(many=True, read_only=True)

    class Meta:
        model = SoftwareLicense
        fields = [
            'id',
            'name',
            'vendor',
            'version',
            'license_type',
            'seat_count',
            'seats_used',
            'seats_available',
            'is_compliant',
            'purchase_date',
            'expiry_date',
            'days_until_expiry',
            'purchase_cost',
            'notes',
            'custom_fields',
            'is_active',
            'created_at',
            'updated_at',
            'installations',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        custom_fields = attrs.get('custom_fields', getattr(self.instance, 'custom_fields', {}))
        if custom_fields is None:
            custom_fields = {}

        from apps.custom_fields.models import FieldSchema

        schemas = {
            fs.name: fs
            for fs in FieldSchema.objects.filter(
                module=FieldSchema.SOFTWARE, is_active=True
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

    def get_seats_used(self, obj):
        return obj.seats_used

    def get_is_compliant(self, obj):
        return obj.is_compliant

    def get_days_until_expiry(self, obj):
        return obj.days_until_expiry



class SoftwareLicenseCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SoftwareLicense
        fields = [
            'name',
            'vendor',
            'version',
            'license_type',
            'license_key',
            'seat_count',
            'purchase_date',
            'expiry_date',
            'purchase_cost',
            'notes',
            'custom_fields',
            'is_active',
        ]

    def validate_custom_fields(self, value):
        """Validate each supplied custom field against its FieldSchema definition."""
        if not value:
            return value
        schemas = {
            fs.name: fs
            for fs in FieldSchema.objects.filter(
                module=FieldSchema.SOFTWARE, is_active=True
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
        for name, schema in schemas.items():
            if schema.is_required and name not in value:
                errors[name] = f'{schema.label} is required.'
        if errors:
            raise serializers.ValidationError(errors)
        return value


# ── Timeline / seat-request serializers ──────────────────────────────────────

class SoftwareLicenseEventSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)

    class Meta:
        model = SoftwareLicenseEvent
        fields = [
            'id',
            'event_type',
            'event_type_display',
            'description',
            'old_value',
            'new_value',
            'actor_email',
            'created_at',
        ]


class SeatRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source='requested_by.full_name', read_only=True)
    license_name = serializers.CharField(source='license.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = SeatRequest
        fields = [
            'id',
            'license',
            'license_name',
            'requested_by_name',
            'seats_requested',
            'justification',
            'status',
            'status_display',
            'review_notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'status', 'review_notes']


class AssignedUserSerializer(serializers.Serializer):
    """Shows which users have the software installed on their assigned hardware."""
    user_id = serializers.UUIDField(allow_null=True)
    user_name = serializers.CharField()
    user_email = serializers.EmailField(allow_blank=True)
    asset_tag = serializers.CharField()
    asset_name = serializers.CharField()
    installed_on = serializers.DateField(allow_null=True)
