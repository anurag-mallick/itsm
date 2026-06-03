from rest_framework import serializers
from .models import DiscoveryScan, DiscoveredDevice


class DiscoveredDeviceSerializer(serializers.ModelSerializer):
    asset_type_guess = serializers.CharField(source='guess_asset_type', read_only=True)
    matched_asset_tag = serializers.CharField(
        source='matched_asset.asset_tag', read_only=True, allow_null=True,
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    port_services = serializers.DictField(read_only=True)
    banners = serializers.DictField(read_only=True)
    rdp_available = serializers.BooleanField(read_only=True)
    ssh_available = serializers.BooleanField(read_only=True)
    vnc_available = serializers.BooleanField(read_only=True)

    class Meta:
        model = DiscoveredDevice
        fields = [
            'id', 'ip_address', 'hostname', 'mac_address', 'os_info',
            'open_ports', 'port_services', 'snmp_info', 'ssh_info',
            'banners', 'rdp_available', 'ssh_available', 'vnc_available',
            'device_type', 'asset_type_guess', 'status', 'status_display',
            'matched_asset', 'matched_asset_tag', 'discovered_at',
        ]


class DiscoveryScanSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    triggered_by_email = serializers.CharField(
        source='triggered_by.email', read_only=True, allow_null=True,
    )
    devices = DiscoveredDeviceSerializer(many=True, read_only=True)

    class Meta:
        model = DiscoveryScan
        fields = [
            'id', 'network_range', 'status', 'status_display',
            'started_at', 'completed_at', 'devices_found', 'error_message',
            'triggered_by_email', 'devices',
        ]


class DiscoveryScanListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = DiscoveryScan
        fields = [
            'id', 'network_range', 'status', 'status_display',
            'started_at', 'completed_at', 'devices_found',
        ]
