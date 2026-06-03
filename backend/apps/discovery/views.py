from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from apps.accounts.permissions import IsITAgent
from apps.audit.models import AuditLog
from .models import DiscoveryScan, DiscoveredDevice
from .serializers import (
    DiscoveryScanSerializer,
    DiscoveryScanListSerializer,
    DiscoveredDeviceSerializer,
)


class DiscoveryScanListCreateView(generics.ListCreateAPIView):
    """GET /api/discovery/scans/ — list scans; POST — trigger a new scan."""
    permission_classes = [IsITAgent]
    ordering = ['-started_at']

    def get_queryset(self):
        return DiscoveryScan.objects.all()

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return DiscoveryScanListSerializer
        return DiscoveryScanSerializer

    def perform_create(self, serializer):
        scan = serializer.save(triggered_by=self.request.user)
        from .tasks import run_discovery_scan
        run_discovery_scan.delay(str(scan.id))
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='discovery',
            record_id=scan.pk,
            record_repr=f'Scan {scan.network_range}',
            ip_address=getattr(self.request, 'audit_ip', None),
        )


class DiscoveryScanDetailView(generics.RetrieveAPIView):
    """GET /api/discovery/scans/{id}/ — detail with all discovered devices."""
    queryset = DiscoveryScan.objects.prefetch_related('devices__matched_asset').all()
    serializer_class = DiscoveryScanSerializer
    permission_classes = [IsITAgent]


class DeviceImportView(APIView):
    """POST /api/discovery/devices/{id}/import/ — create a HardwareAsset from a discovered device."""
    permission_classes = [IsITAgent]

    def post(self, request, pk):
        device = get_object_or_404(DiscoveredDevice, pk=pk)

        if device.status == DiscoveredDevice.STATUS_IMPORTED:
            return Response({'detail': 'Already imported.'}, status=400)

        from apps.assets.models import HardwareAsset

        asset_type = device.guess_asset_type()
        name = device.hostname or device.ip_address

        asset = HardwareAsset(
            name=name,
            asset_type=asset_type,
            serial_number='',
            location=device.ip_address,
            notes=(
                f'Auto-discovered. OS: {device.os_info or "unknown"}. '
                f'Hostname: {device.hostname or "unknown"}.'
            ),
            custom_fields={
                'discovered_ip': device.ip_address,
                'discovered_hostname': device.hostname,
                'open_ports': str(device.open_ports),
            },
        )
        asset.save()

        device.status = DiscoveredDevice.STATUS_IMPORTED
        device.matched_asset = asset
        device.save(update_fields=['status', 'matched_asset'])

        AuditLog.log(
            user=request.user,
            action=AuditLog.CREATE,
            module='assets',
            record_id=asset.pk,
            record_repr=f'{asset.asset_tag} imported from discovery',
            ip_address=getattr(request, 'audit_ip', None),
        )

        return Response({
            'detail': f'Asset {asset.asset_tag} created from discovery.',
            'asset_id': str(asset.id),
            'asset_tag': asset.asset_tag,
        })


class DeviceIgnoreView(APIView):
    """POST /api/discovery/devices/{id}/ignore/ — mark a discovered device as ignored."""
    permission_classes = [IsITAgent]

    def post(self, request, pk):
        device = get_object_or_404(DiscoveredDevice, pk=pk)
        device.status = DiscoveredDevice.STATUS_IGNORED
        device.save(update_fields=['status'])
        return Response({'detail': 'Device marked as ignored.'})


class DeviceRDPFileView(APIView):
    """GET /api/discovery/devices/{id}/rdp/ — download a .rdp file for Windows Remote Desktop."""
    permission_classes = [IsITAgent]

    def get(self, request, pk):
        from django.http import HttpResponse
        device = get_object_or_404(DiscoveredDevice, pk=pk)
        if not device.rdp_available:
            return Response({'detail': 'RDP (port 3389) is not open on this device.'}, status=400)

        name = device.hostname or device.ip_address
        rdp_content = (
            f'full address:s:{device.ip_address}\r\n'
            f'prompt for credentials:i:1\r\n'
            f'screen mode id:i:2\r\n'
            f'use multimon:i:0\r\n'
            f'desktopwidth:i:1920\r\n'
            f'desktopheight:i:1080\r\n'
            f'connection type:i:7\r\n'
            f'authentication level:i:2\r\n'
            f'username:s:\r\n'
            f'redirectclipboard:i:1\r\n'
            f'redirectprinters:i:1\r\n'
        )
        response = HttpResponse(rdp_content, content_type='application/x-rdp')
        response['Content-Disposition'] = f'attachment; filename="{name}.rdp"'
        return response


class DeviceDetailView(generics.RetrieveAPIView):
    """GET /api/discovery/devices/{id}/ — full device detail including all collected info."""
    queryset = DiscoveredDevice.objects.select_related('scan', 'matched_asset').all()
    serializer_class = DiscoveredDeviceSerializer
    permission_classes = [IsITAgent]
