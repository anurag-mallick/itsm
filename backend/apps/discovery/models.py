import uuid
from django.db import models


class DiscoveryScan(models.Model):
    """A single network discovery scan run."""
    STATUS_RUNNING   = 'running'
    STATUS_COMPLETED = 'completed'
    STATUS_FAILED    = 'failed'
    STATUS_CHOICES = [
        (STATUS_RUNNING,   'Running'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_FAILED,    'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    network_range = models.CharField(max_length=100)  # e.g. "192.168.1.0/24"
    status = models.CharField(
        max_length=15, choices=STATUS_CHOICES, default=STATUS_RUNNING, db_index=True
    )
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    devices_found = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)
    triggered_by = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='discovery_scans',
    )

    class Meta:
        db_table = 'discovery_scan'
        ordering = ['-started_at']

    def __str__(self):
        return f'{self.network_range} ({self.status})'


class DiscoveredDevice(models.Model):
    """A device found during a network scan."""
    STATUS_NEW      = 'new'
    STATUS_MATCHED  = 'matched'
    STATUS_IMPORTED = 'imported'
    STATUS_IGNORED  = 'ignored'
    STATUS_CHOICES = [
        (STATUS_NEW,      'New — not in inventory'),
        (STATUS_MATCHED,  'Matched existing asset'),
        (STATUS_IMPORTED, 'Imported to inventory'),
        (STATUS_IGNORED,  'Ignored'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scan = models.ForeignKey(DiscoveryScan, on_delete=models.CASCADE, related_name='devices')
    ip_address = models.GenericIPAddressField(db_index=True)
    hostname = models.CharField(max_length=255, blank=True)
    mac_address = models.CharField(max_length=20, blank=True)
    os_info = models.CharField(max_length=300, blank=True)
    open_ports = models.JSONField(default=list)    # [22, 80, 443, ...]
    snmp_info = models.JSONField(default=dict)     # sysDescr, sysName, etc.
    ssh_info = models.JSONField(default=dict)      # hostname, os, cpu, ram
    port_services = models.JSONField(default=dict)  # {port: service_name}
    banners = models.JSONField(default=dict)        # {port: banner_text}
    rdp_available = models.BooleanField(default=False)
    ssh_available = models.BooleanField(default=False)
    vnc_available = models.BooleanField(default=False)
    device_type = models.CharField(max_length=50, blank=True)  # server/printer/router/workstation
    status = models.CharField(
        max_length=15, choices=STATUS_CHOICES, default=STATUS_NEW, db_index=True
    )
    matched_asset = models.ForeignKey(
        'assets.HardwareAsset', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='discovery_matches',
    )
    discovered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'discovery_device'
        ordering = ['ip_address']

    def __str__(self):
        return f'{self.ip_address} ({self.hostname or "unknown"})'

    def guess_asset_type(self):
        """Return a best-guess asset_type for the assets module."""
        ports = set(self.open_ports)
        if 9100 in ports:
            return 'printer'
        if 161 in ports and self.snmp_info:
            desc = self.snmp_info.get('sysDescr', '').lower()
            if 'cisco' in desc or 'juniper' in desc or 'switch' in desc:
                return 'network_switch'
            if 'router' in desc:
                return 'router'
        if 22 in ports:
            return 'server'
        if 3389 in ports:
            return 'desktop'
        return 'other'
