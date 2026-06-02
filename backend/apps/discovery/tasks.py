from celery import shared_task
import logging

logger = logging.getLogger('itsm.discovery')


@shared_task(queue='default', name='discovery.run_scan', bind=True, max_retries=0)
def run_discovery_scan(self, scan_id: str):
    """Run a network discovery scan for a given DiscoveryScan ID."""
    from django.utils import timezone
    from .models import DiscoveryScan, DiscoveredDevice
    from .scanner import scan_network
    from apps.assets.models import HardwareAsset

    try:
        scan = DiscoveryScan.objects.get(id=scan_id)
    except DiscoveryScan.DoesNotExist:
        logger.error('DiscoveryScan %s not found', scan_id)
        return

    scan.status = DiscoveryScan.STATUS_RUNNING
    scan.save(update_fields=['status'])

    try:
        devices = scan_network(scan.network_range)

        # Match against existing assets by IP stored in the location field
        existing_ips = {
            a.location: a
            for a in HardwareAsset.objects.exclude(location='').filter(is_archived=False)
        }

        for d in devices:
            status = DiscoveredDevice.STATUS_NEW
            matched = None

            if d['ip_address'] in existing_ips:
                matched = existing_ips[d['ip_address']]
                status = DiscoveredDevice.STATUS_MATCHED

            dd = DiscoveredDevice(
                scan=scan,
                ip_address=d['ip_address'],
                hostname=d.get('hostname', ''),
                mac_address=d.get('mac_address', ''),
                os_info=d.get('os_info', ''),
                open_ports=d.get('open_ports', []),
                snmp_info=d.get('snmp_info', {}),
                ssh_info=d.get('ssh_info', {}),
                status=status,
                matched_asset=matched,
            )
            dd.device_type = dd.guess_asset_type()
            dd.save()

        scan.status = DiscoveryScan.STATUS_COMPLETED
        scan.devices_found = len(devices)
        scan.completed_at = timezone.now()
        scan.save(update_fields=['status', 'devices_found', 'completed_at'])

        logger.info('Discovery scan %s completed: %d devices found', scan_id, len(devices))

    except Exception as exc:
        scan.status = DiscoveryScan.STATUS_FAILED
        scan.error_message = str(exc)
        scan.completed_at = timezone.now()
        scan.save(update_fields=['status', 'error_message', 'completed_at'])
        logger.error('Discovery scan %s failed: %s', scan_id, exc)
