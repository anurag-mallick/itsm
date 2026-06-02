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
} from 'antd';
import {
  RadarChartOutlined,
  ImportOutlined,
  StopOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import client from '../../api/client';

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscoveredDevice {
  id: number;
  ip_address: string;
  hostname: string;
  device_type: string;
  open_ports: string[];
  status: 'new' | 'matched' | 'imported' | 'ignored';
  matched_asset_tag?: string;
}

interface Scan {
  id: number;
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

// ---------------------------------------------------------------------------
// Devices table
// ---------------------------------------------------------------------------

interface DevicesTableProps {
  devices: DiscoveredDevice[];
  onImport: (device: DiscoveredDevice) => void;
  onIgnore: (device: DiscoveredDevice) => void;
  actionLoading: number | null;
}

const DevicesTable: React.FC<DevicesTableProps> = ({
  devices,
  onImport,
  onIgnore,
  actionLoading,
}) => {
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
      render: (val: string) => <Tag>{val || 'Unknown'}</Tag>,
    },
    {
      title: 'Open Ports',
      dataIndex: 'open_ports',
      key: 'open_ports',
      render: (ports: string[]) =>
        ports && ports.length > 0 ? (
          <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {ports.join(', ')}
          </Text>
        ) : (
          <Text type="secondary">—</Text>
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
              Matched to {record.matched_asset_tag}
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
          {(record.status === 'new' || record.status === 'matched') && (
            <Button
              size="small"
              type="primary"
              icon={<ImportOutlined />}
              loading={actionLoading === record.id}
              onClick={() => onImport(record)}
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
              onClick={() => onIgnore(record)}
            >
              Ignore
            </Button>
          )}
          {record.status === 'imported' && (
            <Text type="success" style={{ fontSize: 12 }}>
              Imported
            </Text>
          )}
          {record.status === 'ignored' && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Ignored
            </Text>
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
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollScan = useCallback(
    async (scanId: number) => {
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
      message.success('Device marked as ignored.');
    } catch {
      message.error('Failed to ignore device.');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      <Form form={form} layout="vertical" style={{ maxWidth: 480, marginBottom: 24 }}>
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
        <Form.Item name="enable_snmp" valuePropName="checked" initialValue={false}>
          <Checkbox>Enable SNMP scanning</Checkbox>
        </Form.Item>
        <Form.Item name="enable_ssh" valuePropName="checked" initialValue={false}>
          <Checkbox>Enable SSH scanning</Checkbox>
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
            actionLoading={actionLoading}
          />
        </div>
      )}

      {!scanning && currentScan?.status === 'completed' && scanDevices.length === 0 && (
        <Empty description="No devices were discovered in the scanned range." />
      )}
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
  const [actionLoading, setActionLoading] = useState<number | null>(null);

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
        <Button size="small" onClick={() => handleViewDetails(record)}>
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
              actionLoading={actionLoading}
            />
          )}
        </div>
      )}
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
