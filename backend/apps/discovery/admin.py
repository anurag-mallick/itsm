from django.contrib import admin
from .models import DiscoveryScan, DiscoveredDevice


class DiscoveredDeviceInline(admin.TabularInline):
    model = DiscoveredDevice
    extra = 0
    readonly_fields = [
        'id', 'ip_address', 'hostname', 'mac_address', 'os_info',
        'open_ports', 'snmp_info', 'ssh_info', 'device_type',
        'status', 'matched_asset', 'discovered_at',
    ]
    can_delete = False
    show_change_link = True


@admin.register(DiscoveryScan)
class DiscoveryScanAdmin(admin.ModelAdmin):
    list_display = ['network_range', 'status', 'devices_found', 'started_at', 'completed_at', 'triggered_by']
    list_filter = ['status']
    search_fields = ['network_range']
    readonly_fields = ['id', 'started_at', 'completed_at', 'devices_found', 'error_message']
    ordering = ['-started_at']
    inlines = [DiscoveredDeviceInline]


@admin.register(DiscoveredDevice)
class DiscoveredDeviceAdmin(admin.ModelAdmin):
    list_display = ['ip_address', 'hostname', 'device_type', 'status', 'scan', 'discovered_at']
    list_filter = ['status', 'device_type']
    search_fields = ['ip_address', 'hostname', 'mac_address']
    readonly_fields = ['id', 'discovered_at', 'snmp_info', 'ssh_info', 'open_ports']
    ordering = ['ip_address']
    raw_id_fields = ['matched_asset']
