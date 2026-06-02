from rest_framework import serializers
from .models import AccessRequest


class AccessRequestListSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source='requested_by.full_name', read_only=True)
    requested_by_email = serializers.CharField(source='requested_by.email', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    type_display = serializers.CharField(source='get_request_type_display', read_only=True)
    hardware_asset_tag = serializers.CharField(
        source='hardware_asset.asset_tag', read_only=True, allow_null=True
    )
    software_license_name = serializers.CharField(
        source='software_license.name', read_only=True, allow_null=True
    )

    class Meta:
        model = AccessRequest
        fields = [
            'id', 'ref_number', 'request_type', 'type_display',
            'status', 'status_display',
            'requested_by_name', 'requested_by_email',
            'manager_email', 'manager_name', 'justification',
            'hardware_type', 'software_name',
            'hardware_asset_tag', 'software_license_name',
            'created_at', 'approved_at', 'assigned_at',
        ]


class AccessRequestDetailSerializer(AccessRequestListSerializer):
    class Meta(AccessRequestListSerializer.Meta):
        fields = AccessRequestListSerializer.Meta.fields + [
            'hardware_specification', 'manager_name', 'manager_notes',
            'assignment_notes', 'assigned_by', 'approval_token',
        ]
        extra_kwargs = {'approval_token': {'read_only': True}}


class AccessRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessRequest
        fields = [
            'request_type', 'justification', 'manager_email', 'manager_name',
            'hardware_type', 'hardware_specification', 'software_name',
        ]

    def validate(self, data):
        rt = data.get('request_type')
        if rt == AccessRequest.HARDWARE and not data.get('hardware_type'):
            raise serializers.ValidationError(
                {'hardware_type': 'Required for hardware requests.'}
            )
        if rt == AccessRequest.SOFTWARE and not data.get('software_name'):
            raise serializers.ValidationError(
                {'software_name': 'Required for software requests.'}
            )
        return data

    def to_representation(self, instance):
        return AccessRequestDetailSerializer(instance, context=self.context).data


class ManagerApprovalSerializer(serializers.Serializer):
    """Used by the public manager approval endpoint."""
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    notes = serializers.CharField(max_length=1000, allow_blank=True, default='')


class ITAssignmentSerializer(serializers.Serializer):
    """Used by IT agents to complete assignment."""
    hardware_asset_id = serializers.UUIDField(required=False, allow_null=True)
    software_license_id = serializers.UUIDField(required=False, allow_null=True)
    assignment_notes = serializers.CharField(max_length=1000, allow_blank=True, default='')
