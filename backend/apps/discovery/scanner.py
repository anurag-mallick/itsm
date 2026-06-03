"""
Network scanner — collects detailed system information from discovered devices.
Uses only standard library + optional pure-Python packages (pysnmp, paramiko).
Gracefully degrades if packages are missing.
"""
import socket, subprocess, concurrent.futures, ipaddress, logging, platform, re, struct
from typing import Dict, Any, List, Optional

logger = logging.getLogger('itsm.discovery')

# ── Ping ─────────────────────────────────────────────────────────────────────

def ping_host(ip: str, timeout: float = 1.0) -> bool:
    sys = platform.system().lower()
    cmd = (['ping','-n','1','-w', str(int(timeout*1000)), ip]
           if sys == 'windows' else
           ['ping','-c','1','-W', str(int(timeout)), ip])
    try:
        return subprocess.run(cmd, capture_output=True, timeout=timeout+2).returncode == 0
    except Exception:
        return False

# ── ARP — get MAC address ─────────────────────────────────────────────────────

def get_mac_address(ip: str) -> str:
    """Read MAC from ARP cache after a ping. Works on Windows and Linux."""
    try:
        sys = platform.system().lower()
        if sys == 'windows':
            out = subprocess.run(['arp','-a', ip], capture_output=True, text=True, timeout=3).stdout
            match = re.search(r'([0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2})', out, re.IGNORECASE)
        else:
            out = subprocess.run(['arp','-n', ip], capture_output=True, text=True, timeout=3).stdout
            match = re.search(r'([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})', out, re.IGNORECASE)
        return match.group(1).upper() if match else ''
    except Exception:
        return ''

# ── TCP port scan ─────────────────────────────────────────────────────────────

COMMON_PORTS = {
    21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
    80: 'HTTP', 110: 'POP3', 143: 'IMAP', 161: 'SNMP', 389: 'LDAP',
    443: 'HTTPS', 445: 'SMB', 514: 'Syslog', 993: 'IMAPS', 995: 'POP3S',
    1433: 'MSSQL', 1521: 'Oracle', 3306: 'MySQL', 3389: 'RDP',
    5432: 'PostgreSQL', 5900: 'VNC', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt',
    9100: 'Printer', 27017: 'MongoDB',
}

def scan_ports(ip: str, timeout: float = 0.5) -> Dict[int, str]:
    """Returns {port: service_name} for open ports."""
    open_ports: Dict[int, str] = {}
    def _check(port: int) -> None:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(timeout)
            if s.connect_ex((ip, port)) == 0:
                open_ports[port] = COMMON_PORTS.get(port, 'unknown')
            s.close()
        except Exception:
            pass
    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as ex:
        list(ex.map(_check, COMMON_PORTS.keys()))
    return dict(sorted(open_ports.items()))

# ── Hostname ──────────────────────────────────────────────────────────────────

def resolve_hostname(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ''

# ── SNMP — comprehensive OIDs ─────────────────────────────────────────────────

SNMP_OIDS = {
    'sysDescr':         '1.3.6.1.2.1.1.1.0',
    'sysName':          '1.3.6.1.2.1.1.5.0',
    'sysLocation':      '1.3.6.1.2.1.1.6.0',
    'sysContact':       '1.3.6.1.2.1.1.4.0',
    'sysUpTime':        '1.3.6.1.2.1.1.3.0',
    'hrMemorySize':     '1.3.6.1.2.1.25.2.2.0',
    'hrSystemNumUsers': '1.3.6.1.2.1.25.1.5.0',
    'hrSystemProcesses':'1.3.6.1.2.1.25.1.6.0',
}

def get_snmp_info(ip: str, community: str = 'public') -> Dict[str, str]:
    try:
        from pysnmp.hlapi import (getCmd, SnmpEngine, CommunityData,
                                   UdpTransportTarget, ContextData, ObjectType, ObjectIdentity)
        result: Dict[str, str] = {}
        for key, oid in SNMP_OIDS.items():
            try:
                errI, errS, _, varBinds = next(getCmd(
                    SnmpEngine(),
                    CommunityData(community, mpModel=0),
                    UdpTransportTarget((ip, 161), timeout=2, retries=0),
                    ContextData(),
                    ObjectType(ObjectIdentity(oid)),
                ))
                if not errI and not errS:
                    result[key] = str(varBinds[0][1])
            except Exception:
                pass
        return result
    except ImportError:
        return {}

# ── SSH — deep system info ─────────────────────────────────────────────────────

SSH_COMMANDS = {
    'hostname':         'hostname',
    'os_pretty':        'cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'',
    'kernel':           'uname -r 2>/dev/null || echo unknown',
    'arch':             'uname -m 2>/dev/null || echo unknown',
    'cpu_model':        'cat /proc/cpuinfo 2>/dev/null | grep "model name" | head -1 | cut -d: -f2 | xargs || echo unknown',
    'cpu_cores':        'nproc 2>/dev/null || echo unknown',
    'ram_total_mb':     "free -m 2>/dev/null | awk '/Mem:/{print $2}' || echo unknown",
    'ram_free_mb':      "free -m 2>/dev/null | awk '/Mem:/{print $4}' || echo unknown",
    'disk_total_gb':    "df -BG / 2>/dev/null | awk 'NR==2{gsub(\"G\",\"\",$2); print $2}' || echo unknown",
    'disk_free_gb':     "df -BG / 2>/dev/null | awk 'NR==2{gsub(\"G\",\"\",$4); print $4}' || echo unknown",
    'uptime':           "uptime -s 2>/dev/null || cat /proc/uptime 2>/dev/null | awk '{print $1}' || echo unknown",
    'logged_users':     'who 2>/dev/null | wc -l || echo 0',
    'running_services': "systemctl list-units --type=service --state=running --no-legend 2>/dev/null | awk '{print $1}' | head -20 | tr '\\n' ',' || echo unknown",
    'ip_addresses':     "ip addr show 2>/dev/null | grep 'inet ' | awk '{print $2}' | tr '\\n' ',' || ifconfig 2>/dev/null | grep 'inet ' | awk '{print $2}' | tr '\\n' ','",
    'mac_addresses':    "ip link show 2>/dev/null | grep 'link/ether' | awk '{print $2}' | tr '\\n' ',' || echo unknown",
    'open_ports':       "ss -tlnp 2>/dev/null | awk 'NR>1{print $4}' | grep -oP ':\\K\\d+' | sort -n | uniq | head -30 | tr '\\n' ',' || netstat -tlnp 2>/dev/null | awk 'NR>2{print $4}' | grep -oP ':\\K\\d+' | sort -n | uniq | head -30 | tr '\\n' ','",
}

def get_ssh_info(ip: str, username: str = None, password: str = None, key_file: str = None) -> Dict[str, str]:
    try:
        import paramiko
        from django.conf import settings as django_settings
        ssh_user = username or getattr(django_settings, 'DISCOVERY_SSH_USER', '')
        ssh_pass = password or getattr(django_settings, 'DISCOVERY_SSH_PASSWORD', '')
        if not ssh_user:
            return {}
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, username=ssh_user, password=ssh_pass or None,
                       key_filename=key_file, timeout=8, allow_agent=False, look_for_keys=False)
        info: Dict[str, str] = {}
        for key, cmd in SSH_COMMANDS.items():
            try:
                _, stdout, _ = client.exec_command(cmd, timeout=5)
                info[key] = stdout.read().decode().strip()
            except Exception:
                info[key] = 'unknown'
        client.close()
        return info
    except ImportError:
        return {}
    except Exception as e:
        logger.debug(f'SSH {ip}: {e}')
        return {}

# ── Banner grabbing (identify service versions) ───────────────────────────────

def grab_banner(ip: str, port: int, timeout: float = 2.0) -> str:
    try:
        s = socket.socket()
        s.settimeout(timeout)
        s.connect((ip, port))
        if port in (80, 8080, 443, 8443):
            s.send(b'HEAD / HTTP/1.0\r\n\r\n')
        banner = s.recv(512).decode(errors='ignore').strip()[:200]
        s.close()
        return banner
    except Exception:
        return ''

# ── Device type classifier ────────────────────────────────────────────────────

def classify_device(open_ports: Dict[int, str], snmp_info: Dict[str, str],
                    ssh_info: Dict[str, str], hostname: str) -> str:
    ports = set(open_ports.keys())
    desc = (snmp_info.get('sysDescr') or '').lower()
    host = hostname.lower()
    if 9100 in ports: return 'printer'
    if 3389 in ports: return 'desktop'
    if 5900 in ports: return 'desktop'
    if any(x in desc for x in ['cisco','juniper','switch','catalyst']): return 'network_switch'
    if any(x in desc for x in ['router','gateway','mikrotik','ubiquiti']): return 'router'
    if any(x in desc for x in ['ups','apc','eaton']): return 'ups'
    if any(x in host for x in ['switch','sw-','sw0']): return 'network_switch'
    if any(x in host for x in ['router','gw-','gateway']): return 'router'
    if any(x in host for x in ['print','prn-','hp-']): return 'printer'
    if 22 in ports and ssh_info: return 'server'
    if 22 in ports: return 'server'
    if 445 in ports: return 'desktop'
    return 'other'

# ── Main: scan single host ────────────────────────────────────────────────────

def scan_single_host(ip: str, scan_snmp: bool = True, scan_ssh: bool = False,
                     scan_banners: bool = False) -> Optional[Dict[str, Any]]:
    if not ping_host(ip):
        return None
    mac      = get_mac_address(ip)
    ports    = scan_ports(ip)
    hostname = resolve_hostname(ip)
    snmp     = get_snmp_info(ip) if (scan_snmp and 161 in ports) else {}
    ssh      = get_ssh_info(ip)  if (scan_ssh  and 22  in ports) else {}
    banners: Dict[str, str] = {}
    if scan_banners:
        for port in [22, 80, 443, 21, 8080]:
            if port in ports:
                b = grab_banner(ip, port)
                if b: banners[str(port)] = b
    dev_type = classify_device(ports, snmp, ssh, hostname)
    os_info  = (ssh.get('os_pretty') or snmp.get('sysDescr') or
                ('Windows (RDP)' if 3389 in ports else ''))
    return {
        'ip_address':    ip,
        'hostname':      hostname,
        'mac_address':   mac,
        'os_info':       os_info[:200] if os_info else '',
        'device_type':   dev_type,
        'open_ports':    list(ports.keys()),
        'port_services': ports,
        'snmp_info':     snmp,
        'ssh_info':      ssh,
        'banners':       banners,
        'rdp_available': 3389 in ports,
        'ssh_available': 22   in ports,
        'vnc_available': 5900 in ports,
    }

# ── Scan network ──────────────────────────────────────────────────────────────

def scan_network(network_cidr: str, max_workers: int = 50,
                 scan_snmp: bool = True, scan_ssh: bool = False,
                 scan_banners: bool = False) -> List[Dict[str, Any]]:
    try:
        network = ipaddress.ip_network(network_cidr, strict=False)
    except ValueError as e:
        raise ValueError(f'Invalid network range: {e}')
    hosts = [str(h) for h in network.hosts()]
    if len(hosts) > 1024:
        raise ValueError(f'Range too large ({len(hosts)} hosts). Use /22 or smaller.')
    logger.info(f'Scanning {len(hosts)} hosts in {network_cidr}')
    results: List[Dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(scan_single_host, ip, scan_snmp, scan_ssh, scan_banners): ip
                   for ip in hosts}
        for f in concurrent.futures.as_completed(futures):
            r = f.result()
            if r: results.append(r)
    logger.info(f'{network_cidr}: found {len(results)} active hosts')
    return results
