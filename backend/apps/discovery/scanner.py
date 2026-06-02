"""
Network scanner using standard library + optional third-party libs.
Falls back gracefully if libraries are not installed.
"""
import socket
import subprocess
import concurrent.futures
import ipaddress
import logging
import platform
from typing import Any, Dict, List, Optional

logger = logging.getLogger('itsm.discovery')


def ping_host(ip: str, timeout: float = 1.0) -> bool:
    """ICMP ping a host. Works on Windows and Linux."""
    system = platform.system().lower()
    if system == 'windows':
        cmd = ['ping', '-n', '1', '-w', str(int(timeout * 1000)), ip]
    else:
        cmd = ['ping', '-c', '1', '-W', str(int(timeout)), ip]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout + 2)
        return result.returncode == 0
    except Exception:
        return False


def scan_ports(ip: str, ports: List[int], timeout: float = 0.5) -> List[int]:
    """TCP connect scan on common ports."""
    open_ports = []
    for port in ports:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((ip, port))
            sock.close()
            if result == 0:
                open_ports.append(port)
        except Exception:
            pass
    return open_ports


def resolve_hostname(ip: str) -> str:
    """Reverse DNS lookup."""
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ''


def get_snmp_info(ip: str) -> Dict[str, Any]:
    """Query basic SNMP OIDs (sysDescr, sysName, sysLocation)."""
    try:
        from pysnmp.hlapi import (
            getCmd, SnmpEngine, CommunityData, UdpTransportTarget,
            ContextData, ObjectType, ObjectIdentity,
        )
        result = {}
        oids = [
            ('sysDescr',    '1.3.6.1.2.1.1.1.0'),
            ('sysName',     '1.3.6.1.2.1.1.5.0'),
            ('sysLocation', '1.3.6.1.2.1.1.6.0'),
        ]
        for key, oid in oids:
            try:
                errorIndication, errorStatus, errorIndex, varBinds = next(
                    getCmd(
                        SnmpEngine(),
                        CommunityData('public', mpModel=0),
                        UdpTransportTarget((ip, 161), timeout=2, retries=0),
                        ContextData(),
                        ObjectType(ObjectIdentity(oid)),
                    )
                )
                if not errorIndication and not errorStatus:
                    for varBind in varBinds:
                        result[key] = str(varBind[1])
            except Exception:
                pass
        return result
    except ImportError:
        return {}


def get_ssh_info(
    ip: str,
    username: str = None,
    password: str = None,
    key_file: str = None,
) -> Dict[str, Any]:
    """SSH into host and collect system info."""
    try:
        import paramiko
        from django.conf import settings

        ssh_user = username or getattr(settings, 'DISCOVERY_SSH_USER', '')
        ssh_pass = password or getattr(settings, 'DISCOVERY_SSH_PASSWORD', '')
        if not ssh_user:
            return {}

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            ip,
            username=ssh_user,
            password=ssh_pass or None,
            key_filename=key_file,
            timeout=5,
            allow_agent=False,
            look_for_keys=False,
        )

        info = {}
        commands = {
            'hostname': 'hostname',
            'os': 'uname -a 2>/dev/null || systeminfo 2>/dev/null | head -5',
            'cpu': 'nproc 2>/dev/null || echo unknown',
            'ram_mb': "free -m 2>/dev/null | awk '/Mem:/{print $2}' || echo unknown",
            'disk_gb': "df -BG / 2>/dev/null | awk 'NR==2{print $2}' || echo unknown",
        }
        for key, cmd in commands.items():
            try:
                _, stdout, _ = client.exec_command(cmd, timeout=5)
                info[key] = stdout.read().decode().strip()
            except Exception:
                pass

        client.close()
        return info
    except ImportError:
        return {}
    except Exception as exc:
        logger.debug('SSH to %s failed: %s', ip, exc)
        return {}


COMMON_PORTS = [
    21, 22, 23, 25, 80, 110, 143, 161, 389, 443, 445,
    993, 995, 1433, 3306, 3389, 5432, 5900, 8080, 8443, 9100,
]


def scan_single_host(
    ip: str,
    scan_snmp: bool = True,
    scan_ssh: bool = False,
) -> Optional[Dict[str, Any]]:
    """Scan a single IP. Returns None if host is not reachable."""
    if not ping_host(ip):
        return None

    device: Dict[str, Any] = {
        'ip_address': ip,
        'hostname': resolve_hostname(ip),
        'open_ports': scan_ports(ip, COMMON_PORTS),
        'snmp_info': {},
        'ssh_info': {},
        'mac_address': '',
        'os_info': '',
    }

    if scan_snmp and 161 in device['open_ports']:
        device['snmp_info'] = get_snmp_info(ip)

    if scan_ssh and 22 in device['open_ports']:
        device['ssh_info'] = get_ssh_info(ip)

    # Guess OS from open ports / collected data
    ports = set(device['open_ports'])
    if 3389 in ports:
        device['os_info'] = 'Windows (RDP detected)'
    elif 22 in ports and device['ssh_info'].get('os'):
        device['os_info'] = device['ssh_info']['os'][:200]
    elif device['snmp_info'].get('sysDescr'):
        device['os_info'] = device['snmp_info']['sysDescr'][:200]

    return device


def scan_network(
    network_cidr: str,
    max_workers: int = 50,
    scan_snmp: bool = True,
    scan_ssh: bool = False,
) -> List[Dict[str, Any]]:
    """Scan all hosts in a CIDR range concurrently."""
    try:
        network = ipaddress.ip_network(network_cidr, strict=False)
    except ValueError as exc:
        raise ValueError(f'Invalid network range: {exc}')

    hosts = [str(h) for h in network.hosts()]
    if len(hosts) > 1024:
        raise ValueError(
            f'Network range too large ({len(hosts)} hosts). Use /22 or smaller.'
        )

    logger.info('Scanning %d hosts in %s', len(hosts), network_cidr)

    results: List[Dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(scan_single_host, ip, scan_snmp, scan_ssh): ip
            for ip in hosts
        }
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result:
                results.append(result)

    logger.info('Found %d active hosts in %s', len(results), network_cidr)
    return results
