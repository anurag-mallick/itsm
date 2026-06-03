import React, { useState, useCallback, useRef } from 'react';
import {
  Typography,
  Tabs,
  Form,
  Input,
  Checkbox,
  Button,
  Spin,
  Table,
  Tag,
  Space,
  message,
  Empty,
  Alert,
  Drawer,
  Descriptions,
  Divider,
  Tooltip,
  Badge,
} from 'antd';
import {
  RadarChartOutlined,
  ImportOutlined,
  StopOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  DesktopOutlined,
  CodeOutlined,
  EyeOutlined,
  LaptopOutlined,
  PrinterOutlined,
  CloudServerOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import client from '../../api/client';

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscoveredDevice {
  id: string;
  ip_address: string;
  hostname: string;
  mac_address: string;
  os_info: string;
  device_type: string;
  open_ports: number[];
  port_services: Record<string, string>;
  snmp_info: Record<string, string>;
  ssh_info: Record<string, string>;
  banners: Record<string, string>;
  rdp_available: boolean;
  ssh_available: boolean;
  vnc_available: boolean;
  status: 'new' | 'matched' | 'imported' | 'ignored';
  matched_asset_tag?: string;
  asset_type_guess?: string;
}

interface Scan {
  id: string;
  network_range: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  devices_found: number;
  devices?: DiscoveredDevice[];
}

interface ScansResponse {
  results: Scan[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVICE_STATUS_COLORS: Record<string, string> = {
  new: 'blue',
  matched: 'orange',
  imported: 'green',
  ignored: 'default',
};

const SCAN_STATUS_COLORS: Record<string, string> = {
  pending: 'gold',
  running: 'blue',
  completed: 'green',
  failed: 'red',
};

const PORT_SERVICE_COLORS: Record<string, string> = {
  RDP: 'red',
  SSH: 'blue',
  HTTP: 'green',
  HTTPS: 'cyan',
  'HTTP-Alt': 'geekblue',
  'HTTPS-Alt': 'teal',
  FTP: 'orange',
  SMB: 'volcano',
  SNMP: 'purple',
  Printer: 'magenta',
  VNC: 'gold',
  MySQL: 'lime',
  MSSQL: 'blue',
  PostgreSQL: 'geekblue',
  MongoDB: 'green',
  Telnet: 'red',
  SMTP: 'orange',
  IMAP: 'cyan',
  IMAPS: 'cyan',
  POP3: 'purple',
  POP3S: 'purple',
  DNS: 'default',
  LDAP: 'default',
};

function getServiceColor(service: string): string {
  return PORT_SERVICE_COLORS[service] ?? 'default';
}

function DeviceTypeIcon({ type }: { type: string }) {
  const style = { marginRight: 4 };
  switch (type) {
    case 'server': return <CloudServerOutlined style={style} />;
    case 'desktop': return <LaptopOutlined style={style} />;
    case 'printer': return <PrinterOutlined style={style} />;
    case 'network_switch':
    case 'router': return <CloudServerOutlined style={style} />;
    default: return <QuestionCircleOutlined style={style} />;
  }
}

// ---------------------------------------------------------------------------
// Device Detail Drawer
// ---------------------------------------------------------------------------

interface DeviceDrawerProps {
  device: DiscoveredDevice | null;
  open: boolean;
  onClose: () => void;
  onImport: (device: DiscoveredDevice) => void;
  onIgnore: (device: DiscoveredDevice) => void;
  actionLoading: string | null;
}

const DeviceDrawer: React.FC<DeviceDrawerProps> = ({
  device, open, onClose, onImport, onIgnore, actionLoading,
}) => {
  if (!device) return null;

  const hasSSHInfo = device.ssh_info && Object.keys(device.ssh_info).length > 0;
  const hasSNMPInfo = device.snmp_info && Object.keys(device.snmp_info).length > 0;
  const hasBanners = device.banners && Object.keys(device.banners).length > 0;

  function handleRDPDownload() {
    if (!device) return;
    const url = `/api/discovery/devices/${device.id}/rdp/`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${device.hostname || device.ip_address}.rdp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleSSHCopy() {
    if (!device) return;
    const user = device.ssh_info?.hostname ? '' : 'user';
    const cmd = `ssh ${user ? user + '@' : ''}${device.ip_address}`;
    navigator.clipboard.writeText(cmd).then(() => {
      message.success(`Copied to clipboard: ${cmd}`);
    });
  }

  const portServiceRows = Object.entries(device.port_services ?? {});

  return (
    <Drawer
      title={
        <Space>
          <DeviceTypeIcon type={device.device_type} />
          <span>{device.hostname || device.ip_address}</span>
          <Tag color={DEVICE_STATUS_COLORS[device.status] ?? 'default'}>
            {device.status.charAt(0).toUpperCase() + device.status.slice(1)}
          </Tag>
        </Space>
      }
      width={520}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          {(device.status === 'new' || device.status === 'matched') && (
            <>
              <Button
                type="primary"
                size="small"
                icon={<ImportOutlined />}
                loading={actionLoading === device.id}
                onClick={() => onImport(device)}
              >
                Import
              </Button>
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                loading={actionLoading === device.id}
                onClick={() => onIgnore(device)}
              >
                Ignore
              </Button>
            </>
          )}
        </Space>
      }
    >
      {/* Basic Info */}
      <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="IP Address">
          <Text style={{ fontFamily: 'monospace' }}>{device.ip_address}</Text>
        </Descriptions.Item>
        {device.hostname && (
          <Descriptions.Item label="Hostname">{device.hostname}</Descriptions.Item>
        )}
        {device.mac_address && (
          <Descriptions.Item label="MAC Address">
            <Text style={{ fontFamily: 'monospace' }}>{device.mac_address}</Text>
          </Descriptions.Item>
        )}
        {device.os_info && (
          <Descriptions.Item label="OS">{device.os_info}</Descriptions.Item>
        )}
        <Descriptions.Item label="Device Type">
          <Space>
            <DeviceTypeIcon type={device.device_type} />
            <span>{device.device_type || 'Unknown'}</span>
          </Space>
        </Descriptions.Item>
      </Descriptions>

      {/* Remote Access */}
      {(device.rdp_available || device.ssh_available || device.vnc_available) && (
        <>
          <Text strong>Remote Access</Text>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <Space wrap>
              {device.rdp_available && (
                <Button
                  icon={<DesktopOutlined />}
                  style={{ color: '#cf1322', borderColor: '#cf1322' }}
                  onClick={handleRDPDownload}
                >
                  Download RDP File
                </Button>
              )}
              {device.ssh_available && (
                <Button
                  icon={<CodeOutlined />}
                  style={{ color: '#1677ff', borderColor: '#1677ff' }}
                  onClick={handleSSHCopy}
                >
                  Copy SSH Command
                </Button>
              )}
              {device.vnc_available && (
                <Tag color="gold" style={{ padding: '4px 8px', fontSize: 13 }}>
                  VNC available on port 5900
                </Tag>
              )}
            </Space>
          </div>
        </>
      )}

      {/* Open Ports */}
      {portServiceRows.length > 0 && (
        <>
          <Text strong>Open Ports &amp; Services</Text>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            {portServiceRows.map(([port, service]) => (
              <Tag key={port} color={getServiceColor(service)} style={{ marginBottom: 4 }}>
                {port}/{service}
              </Tag>
            ))}
          </div>
        </>
      )}

      {/* SSH System Info */}
      {hasSSHInfo && (
        <>
          <Divider orientation="left" plain>System Information (SSH)</Divider>
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            {device.ssh_info.cpu_model && (
              <Descriptions.Item label="CPU" span={2}>{device.ssh_info.cpu_model}</Descriptions.Item>
            )}
            {device.ssh_info.cpu_cores && (
              <Descriptions.Item label="CPU Cores">{device.ssh_info.cpu_cores}</Descriptions.Item>
            )}
            {device.ssh_info.arch && (
              <Descriptions.Item label="Architecture">{device.ssh_info.arch}</Descriptions.Item>
            )}
            {device.ssh_info.ram_total_mb && (
              <Descriptions.Item label="RAM Total">{device.ssh_info.ram_total_mb} MB</Descriptions.Item>
            )}
            {device.ssh_info.ram_free_mb && (
              <Descriptions.Item label="RAM Free">{device.ssh_info.ram_free_mb} MB</Descriptions.Item>
            )}
            {device.ssh_info.disk_total_gb && (
              <Descriptions.Item label="Disk Total">{device.ssh_info.disk_total_gb} GB</Descriptions.Item>
            )}
            {device.ssh_info.disk_free_gb && (
              <Descriptions.Item label="Disk Free">{device.ssh_info.disk_free_gb} GB</Descriptions.Item>
            )}
            {device.ssh_info.os_pretty && (
              <Descriptions.Item label="OS" span={2}>{device.ssh_info.os_pretty}</Descriptions.Item>
            )}
            {device.ssh_info.kernel && (
              <Descriptions.Item label="Kernel" span={2}>{device.ssh_info.kernel}</Descriptions.Item>
            )}
            {device.ssh_info.uptime && (
              <Descriptions.Item label="Uptime" span={2}>{device.ssh_info.uptime}</Descriptions.Item>
            )}
            {device.ssh_info.logged_users && (
              <Descriptions.Item label="Logged Users">{device.ssh_info.logged_users}</Descriptions.Item>
            )}
          </Descriptions>

          {device.ssh_info.ip_addresses && (
            <>
              <Text strong style={{ fontSize: 12 }}>Network Addresses</Text>
              <div style={{ marginBottom: 8 }}>
                {device.ssh_info.ip_addresses.split(',').filter(Boolean).map((ip) => (
                  <Tag key={ip} style={{ fontFamily: 'monospace', marginTop: 4 }}>{ip.trim()}</Tag>
                ))}
              </div>
            </>
          )}

          {device.ssh_info.running_services && device.ssh_info.running_services !== 'unknown' && (
            <>
              <Text strong style={{ fontSize: 12 }}>Running Services</Text>
              <div style={{ marginBottom: 8 }}>
                {device.ssh_info.running_services.split(',').filter(Boolean).map((svc) => (
                  <Tag key={svc} color="processing" style={{ marginTop: 4, fontSize: 11 }}>{svc.trim()}</Tag>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* SNMP Info */}
      {hasSNMPInfo && (
        <>
          <Divider orientation="left" plain>SNMP Information</Divider>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
            {Object.entries(device.snmp_info).map(([key, val]) => (
              <Descriptions.Item key={key} label={key}>{String(val)}</Descriptions.Item>
            ))}
          </Descriptions>
        </>
      )}

      {/* Banners */}
      {hasBanners && (
        <>
          <Divider orientation="left" plain>Service Banners</Divider>
          {Object.entries(device.banners).map(([port, banner]) => (
            <div key={port} style={{ marginBottom: 8 }}>
              <Text strong>Port {port}: </Text>
              <pre style={{
                background: '#f5f5f5', padding: '6px 10px',
                borderRadius: 4, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                margin: '4px 0 0',
              }}>{banner}</pre>
            </div>
          ))}
        </>
      )}
    </Drawer>
  );
};

// ---------------------------------------------------------------------------
// Devices table
// ---------------------------------------------------------------------------

interface DevicesTableProps {
  devices: DiscoveredDevice[];
  onImport: (device: DiscoveredDevice) => void;
  onIgnore: (device: DiscoveredDevice) => void;
  onViewDetail: (device: DiscoveredDevice) => void;
  actionLoading: string | null;
}

const DevicesTable: React.FC<DevicesTableProps> = ({
  devices,
  onImport,
  onIgnore,
  onViewDetail,
  actionLoading,
}) => {
  function handleRDPDownload(device: DiscoveredDevice, e: React.MouseEvent) {
    e.stopPropagation();
    const url = `/api/discovery/devices/${device.id}/rdp/`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${device.hostname || device.ip_address}.rdp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleSSHCopy(device: DiscoveredDevice, e: React.MouseEvent) {
    e.stopPropagation();
    const cmd = `ssh user@${device.ip_address}`;
    navigator.clipboard.writeText(cmd).then(() => {
      message.success(`Copied: ${cmd}`);
    });
  }

  const columns: ColumnsType<DiscoveredDevice> = [
    {
      title: 'IP Address',
      dataIndex: 'ip_address',
      key: 'ip_address',
      render: (val: string) => <Text style={{ fontFamily: 'monospace' }}>{val}</Text>,
    },
    {
      title: 'Hostname',
      dataIndex: 'hostname',
      key: 'hostname',
      render: (val: string) => val || <Text type="secondary">—</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'device_type',
      key: 'device_type',
      render: (val: string) => (
        <Tag>
          <DeviceTypeIcon type={val} />
          {val || 'Unknown'}
        </Tag>
      ),
    },
    {
      title: 'Services',
      dataIndex: 'port_services',
      key: 'port_services',
      render: (services: Record<string, string>) => {
        if (!services || Object.keys(services).length === 0) {
          return <Text type="secondary">—</Text>;
        }
        const entries = Object.entries(services).slice(0, 6);
        const extra = Object.keys(services).length - 6;
        return (
          <Space wrap size={2}>
            {entries.map(([port, svc]) => (
              <Tooltip key={port} title={`Port ${port}`}>
                <Tag color={getServiceColor(svc)} style={{ fontSize: 11, margin: 0 }}>{svc}</Tag>
              </Tooltip>
            ))}
            {extra > 0 && <Tag style={{ fontSize: 11, margin: 0 }}>+{extra}</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Remote Access',
      key: 'remote',
      render: (_: unknown, record: DiscoveredDevice) => (
        <Space>
          {record.rdp_available && (
            <Tooltip title="Download RDP file">
              <Button
                size="small"
                danger
                icon={<DesktopOutlined />}
                onClick={(e) => handleRDPDownload(record, e)}
              >
                RDP
              </Button>
            </Tooltip>
          )}
          {record.ssh_available && (
            <Tooltip title="Copy SSH command">
              <Button
                size="small"
                icon={<CodeOutlined />}
                style={{ color: '#1677ff', borderColor: '#1677ff' }}
                onClick={(e) => handleSSHCopy(record, e)}
              >
                SSH
              </Button>
            </Tooltip>
          )}
          {!record.rdp_available && !record.ssh_available && (
            <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string, record: DiscoveredDevice) => (
        <Space direction="vertical" size={0}>
          <Tag color={DEVICE_STATUS_COLORS[val] ?? 'default'}>
            {val.charAt(0).toUpperCase() + val.slice(1)}
          </Tag>
          {record.matched_asset_tag && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.matched_asset_tag}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: DiscoveredDevice) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={(e) => { e.stopPropagation(); onViewDetail(record); }}
          >
            Details
          </Button>
          {(record.status === 'new' || record.status === 'matched') && (
            <Button
              size="small"
              type="primary"
              icon={<ImportOutlined />}
              loading={actionLoading === record.id}
              onClick={(e) => { e.stopPropagation(); onImport(record); }}
            >
              Import
            </Button>
          )}
          {(record.status === 'new' || record.status === 'matched') && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              loading={actionLoading === record.id}
              onClick={(e) => { e.stopPropagation(); onIgnore(record); }}
            >
              Ignore
            </Button>
          )}
          {record.status === 'imported' && (
            <Text type="success" style={{ fontSize: 12 }}>Imported</Text>
          )}
          {record.status === 'ignored' && (
            <Text type="secondary" style={{ fontSize: 12 }}>Ignored</Text>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table<DiscoveredDevice>
      dataSource={devices}
      columns={columns}
      rowKey="id"
      size="small"
      pagination={{ pageSize: 20, showSizeChanger: false }}
      onRow={(record) => ({
        style: { cursor: 'pointer' },
        onClick: () => onViewDetail(record),
      })}
    />
  );
};

// ---------------------------------------------------------------------------
// Run Scan tab
// ---------------------------------------------------------------------------

const RunScanTab: React.FC = () => {
  const [form] = Form.useForm();
  const [scanning, setScanning] = useState(false);
  const [currentScan, setCurrentScan] = useState<Scan | null>(null);
  const [scanDevices, setScanDevices] = useState<DiscoveredDevice[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [drawerDevice, setDrawerDevice] = useState<DiscoveredDevice | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollScan = useCallback(
    async (scanId: string) => {
      try {
        const { data } = await client.get<Scan>(`/discovery/scans/${scanId}/`);
        setCurrentScan(data);
        if (data.status === 'completed' || data.status === 'failed') {
          stopPolling();
          setScanning(false);
          setScanDevices(data.devices ?? []);
          if (data.status === 'completed') {
            message.success(`Scan complete. ${data.devices_found} device(s) found.`);
          } else {
            message.error('Scan failed.');
          }
        }
      } catch {
        stopPolling();
        setScanning(false);
        message.error('Failed to poll scan status.');
      }
    },
    [stopPolling],
  );

  async function handleStartScan() {
    try {
      const values = await form.validateFields();
      setScanning(true);
      setCurrentScan(null);
      setScanDevices([]);
      const { data } = await client.post<Scan>('/discovery/scans/', {
        network_range: values.network_range,
        enable_snmp: values.enable_snmp ?? false,
        enable_ssh: values.enable_ssh ?? false,
        enable_banners: values.enable_banners ?? false,
      });
      setCurrentScan(data);
      pollRef.current = setInterval(() => pollScan(data.id), 3000);
    } catch (err: any) {
      if (err?.errorFields) return;
      const msg =
        err?.response?.data?.detail ??
        Object.values(err?.response?.data ?? {}).flat().join(' ') ??
        'Failed to start scan.';
      message.error(String(msg));
      setScanning(false);
    }
  }

  async function handleImport(device: DiscoveredDevice) {
    setActionLoading(device.id);
    try {
      await client.post(`/discovery/devices/${device.id}/import/`);
      setScanDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, status: 'imported' as const } : d)),
      );
      if (drawerDevice?.id === device.id) {
        setDrawerDevice((prev) => prev ? { ...prev, status: 'imported' } : prev);
      }
      message.success('Device imported as asset.');
    } catch {
      message.error('Failed to import device.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleIgnore(device: DiscoveredDevice) {
    setActionLoading(device.id);
    try {
      await client.post(`/discovery/devices/${device.id}/ignore/`);
      setScanDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, status: 'ignored' as const } : d)),
      );
      if (drawerDevice?.id === device.id) {
        setDrawerDevice((prev) => prev ? { ...prev, status: 'ignored' } : prev);
      }
      message.success('Device marked as ignored.');
    } catch {
      message.error('Failed to ignore device.');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      <Form form={form} layout="vertical" style={{ maxWidth: 520, marginBottom: 24 }}>
        <Form.Item
          label="Network Range"
          name="network_range"
          rules={[
            { required: true, message: 'Network range is required.' },
            {
              pattern: /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/,
              message: 'Enter a valid CIDR range, e.g. 192.168.1.0/24',
            },
          ]}
        >
          <Input placeholder="e.g. 192.168.1.0/24" />
        </Form.Item>

        <Text strong style={{ display: 'block', marginBottom: 8 }}>Scan Options</Text>

        <Form.Item name="port_scan" valuePropName="checked" initialValue={true} style={{ marginBottom: 4 }}>
          <Checkbox disabled checked>
            Port Scan (always enabled)
          </Checkbox>
        </Form.Item>
        <Form.Item name="enable_snmp" valuePropName="checked" initialValue={false} style={{ marginBottom: 4 }}>
          <Checkbox>SNMP Discovery (requires SNMP community configured)</Checkbox>
        </Form.Item>
        <Form.Item name="enable_ssh" valuePropName="checked" initialValue={false} style={{ marginBottom: 4 }}>
          <Checkbox>SSH System Info (requires SSH credentials in Settings)</Checkbox>
        </Form.Item>
        <Form.Item name="enable_banners" valuePropName="checked" initialValue={false} style={{ marginBottom: 16 }}>
          <Checkbox>Banner Grabbing (identifies service versions)</Checkbox>
        </Form.Item>

        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={handleStartScan}
          loading={scanning}
          disabled={scanning}
        >
          Start Scan
        </Button>
      </Form>

      {scanning && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            background: '#f0f7ff',
            border: '1px solid #bae0ff',
            borderRadius: 8,
            marginBottom: 24,
          }}
        >
          <Spin />
          <Text>
            Scanning network{currentScan ? ` ${currentScan.network_range}` : ''}...
          </Text>
        </div>
      )}

      {!scanning && currentScan?.status === 'failed' && (
        <Alert
          type="error"
          message="Scan failed"
          description="The scan encountered an error. Check your network range and try again."
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {!scanning && scanDevices.length > 0 && (
        <div>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            Scan Results — {scanDevices.length} device(s) discovered
          </Text>
          <DevicesTable
            devices={scanDevices}
            onImport={handleImport}
            onIgnore={handleIgnore}
            onViewDetail={setDrawerDevice}
            actionLoading={actionLoading}
          />
        </div>
      )}

      {!scanning && currentScan?.status === 'completed' && scanDevices.length === 0 && (
        <Empty description="No devices were discovered in the scanned range." />
      )}

      <DeviceDrawer
        device={drawerDevice}
        open={drawerDevice !== null}
        onClose={() => setDrawerDevice(null)}
        onImport={handleImport}
        onIgnore={handleIgnore}
        actionLoading={actionLoading}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Scan History tab
// ---------------------------------------------------------------------------

const ScanHistoryTab: React.FC = () => {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedScan, setExpandedScan] = useState<Scan | null>(null);
  const [expandedDevices, setExpandedDevices] = useState<DiscoveredDevice[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [drawerDevice, setDrawerDevice] = useState<DiscoveredDevice | null>(null);

  const fetchScans = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get<ScansResponse>('/discovery/scans/');
      setScans(data.results ?? []);
    } catch {
      message.error('Failed to load scan history.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  async function handleViewDetails(scan: Scan) {
    setExpandedScan(scan);
    setDetailLoading(true);
    try {
      const { data } = await client.get<Scan>(`/discovery/scans/${scan.id}/`);
      setExpandedDevices(data.devices ?? []);
    } catch {
      message.error('Failed to load scan details.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleImport(device: DiscoveredDevice) {
    setActionLoading(device.id);
    try {
      await client.post(`/discovery/devices/${device.id}/import/`);
      setExpandedDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, status: 'imported' as const } : d)),
      );
      if (drawerDevice?.id === device.id) {
        setDrawerDevice((prev) => prev ? { ...prev, status: 'imported' } : prev);
      }
      message.success('Device imported as asset.');
    } catch {
      message.error('Failed to import device.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleIgnore(device: DiscoveredDevice) {
    setActionLoading(device.id);
    try {
      await client.post(`/discovery/devices/${device.id}/ignore/`);
      setExpandedDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, status: 'ignored' as const } : d)),
      );
      if (drawerDevice?.id === device.id) {
        setDrawerDevice((prev) => prev ? { ...prev, status: 'ignored' } : prev);
      }
      message.success('Device marked as ignored.');
    } catch {
      message.error('Failed to ignore device.');
    } finally {
      setActionLoading(null);
    }
  }

  const scanColumns: ColumnsType<Scan> = [
    {
      title: 'Network Range',
      dataIndex: 'network_range',
      key: 'network_range',
      render: (val: string) => <Text style={{ fontFamily: 'monospace' }}>{val}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => (
        <Tag color={SCAN_STATUS_COLORS[val] ?? 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Started',
      dataIndex: 'started_at',
      key: 'started_at',
      render: (val: string) => new Date(val).toLocaleString(),
    },
    {
      title: 'Duration',
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (val?: number) =>
        val != null ? `${val}s` : <Text type="secondary">—</Text>,
    },
    {
      title: 'Devices Found',
      dataIndex: 'devices_found',
      key: 'devices_found',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: Scan) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetails(record)}>
          View Details
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Table<Scan>
        dataSource={scans}
        columns={scanColumns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />

      {expandedScan && (
        <div style={{ marginTop: 24 }}>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            Devices from scan: {expandedScan.network_range}
          </Text>
          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Spin />
            </div>
          ) : expandedDevices.length === 0 ? (
            <Empty description="No devices in this scan." />
          ) : (
            <DevicesTable
              devices={expandedDevices}
              onImport={handleImport}
              onIgnore={handleIgnore}
              onViewDetail={setDrawerDevice}
              actionLoading={actionLoading}
            />
          )}
        </div>
      )}

      <DeviceDrawer
        device={drawerDevice}
        open={drawerDevice !== null}
        onClose={() => setDrawerDevice(null)}
        onImport={handleImport}
        onIgnore={handleIgnore}
        actionLoading={actionLoading}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DiscoveryPage: React.FC = () => (
  <div style={{ padding: 24 }}>
    <div style={{ marginBottom: 24 }}>
      <Title level={3} style={{ margin: 0 }}>
        <RadarChartOutlined style={{ marginRight: 10, color: '#1677ff' }} />
        Asset Discovery
      </Title>
      <Text type="secondary">Scan your network to discover and import devices as assets</Text>
    </div>

    <Tabs
      defaultActiveKey="scan"
      items={[
        {
          key: 'scan',
          label: (
            <span>
              <PlayCircleOutlined style={{ marginRight: 6 }} />
              Run Scan
            </span>
          ),
          children: <RunScanTab />,
        },
        {
          key: 'history',
          label: (
            <span>
              <HistoryOutlined style={{ marginRight: 6 }} />
              Scan History
            </span>
          ),
          children: <ScanHistoryTab />,
        },
      ]}
    />
  </div>
);

export default DiscoveryPage;
