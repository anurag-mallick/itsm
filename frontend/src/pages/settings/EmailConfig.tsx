import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Form,
  Input,
  Switch,
  Button,
  Modal,
  Alert,
  Typography,
  Space,
  Tabs,
  message,
  Divider,
  InputNumber,
  Spin,
  Table,
  Tag,
  Radio,
  Select,
  Popconfirm,
  Collapse,
  Badge,
} from 'antd';
import {
  SaveOutlined,
  SendOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ApiOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import client from '../../api/client';

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InboundMailbox {
  id: number;
  name: string;
  email_address: string;
  protocol: 'imap' | 'pop3';
  host: string;
  port: number;
  username: string;
  use_ssl: boolean;
  imap_folder: string;
  processed_folder: string;
  default_category: number | null;
  default_category_name: string | null;
  default_priority: 'low' | 'medium' | 'high' | 'critical';
  is_active: boolean;
  poll_interval_seconds: number;
  last_polled_at: string | null;
  last_error: string | null;
  emails_processed: number;
}

interface Category {
  id: number;
  name: string;
}

interface ConfigItem {
  id: number;
  key: string;
  value: string;
  display_value: string;
  section: string;
  label: string;
  help_text: string;
  is_secret: boolean;
  is_required: boolean;
  display_order: number;
}

type ConfigMap = Record<string, ConfigItem>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_use_tls', 'email_from'];

function buildConfigMap(items: ConfigItem[]): ConfigMap {
  const map: ConfigMap = {};
  items.forEach((item) => { map[item.key] = item; });
  return map;
}

function isSecretPlaceholder(val: string): boolean {
  return val === '••••••••' || val === '********';
}

const DEFAULT_PORT: Record<'imap' | 'pop3', number> = { imap: 993, pop3: 995 };

const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

// ---------------------------------------------------------------------------
// Tab 1: Inbound Mailboxes
// ---------------------------------------------------------------------------

const InboundTab: React.FC = () => {
  const [mailboxes, setMailboxes] = useState<InboundMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InboundMailbox | null>(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; folders?: string[] } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [pollLoading, setPollLoading] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchMailboxes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/email-config/inbound/');
      setMailboxes(res.data.results ?? res.data);
    } catch {
      message.error('Failed to load inbound mailboxes.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await client.get('/tickets/categories/');
      setCategories(res.data.results ?? res.data);
    } catch {
      // Categories are optional — silently degrade
    }
  }, []);

  useEffect(() => {
    fetchMailboxes();
    fetchCategories();
  }, [fetchMailboxes, fetchCategories]);

  function openAdd() {
    setEditTarget(null);
    setTestResult(null);
    form.resetFields();
    form.setFieldsValue({ protocol: 'imap', port: 993, use_ssl: true, default_priority: 'medium' });
    setModalOpen(true);
  }

  function openEdit(mb: InboundMailbox) {
    setEditTarget(mb);
    setTestResult(null);
    form.setFieldsValue({
      name: mb.name,
      email_address: mb.email_address,
      protocol: mb.protocol,
      host: mb.host,
      port: mb.port,
      username: mb.username,
      use_ssl: mb.use_ssl,
      default_category: mb.default_category,
      default_priority: mb.default_priority,
      is_active: mb.is_active,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    let values: Record<string, any>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      // Auto-fill fields derived from email address
      const email = values.email_address ?? '';
      const protocol = values.protocol ?? 'imap';
      const payload: Record<string, any> = {
        ...values,
        name: values.name || email,          // use email as name if not set
        username: values.username || email,   // username = email for iRedMail
        port: values.port || (protocol === 'imap' ? 993 : 995),
        use_ssl: values.use_ssl !== false,    // default true
        imap_folder: 'INBOX',
        processed_folder: 'INBOX.Processed',
        default_priority: values.default_priority || 'medium',
      };

      if (editTarget) {
        if (!payload.password) delete payload.password;
        await client.patch(`/email-config/inbound/${editTarget.id}/`, payload);
        message.success('Mailbox updated.');
      } else {
        await client.post('/email-config/inbound/', payload);
        message.success('Mailbox created.');
      }
      setModalOpen(false);
      fetchMailboxes();
    } catch (err: any) {
      const detail = err?.response?.data?.detail
        ?? Object.values(err?.response?.data ?? {}).flat().join(' ')
        ?? 'Failed to save mailbox.';
      message.error(String(detail));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    // Save first if adding new, else test existing
    let targetId = editTarget?.id;
    if (!targetId) {
      let values: Record<string, any>;
      try {
        values = await form.validateFields();
      } catch {
        return;
      }
      setSaving(true);
      try {
        const res = await client.post('/email-config/inbound/', values);
        targetId = res.data.id;
        setEditTarget(res.data);
        fetchMailboxes();
      } catch (err: any) {
        const detail = err?.response?.data?.detail
          ?? Object.values(err?.response?.data ?? {}).flat().join(' ')
          ?? 'Failed to save mailbox before test.';
        message.error(String(detail));
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await client.post(`/email-config/inbound/${targetId}/test/`);
      setTestResult(res.data);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.response?.data?.message ?? err?.response?.data?.detail ?? 'Connection test failed.',
      });
    } finally {
      setTestLoading(false);
    }
  }

  async function handleDelete(mb: InboundMailbox) {
    try {
      await client.delete(`/email-config/inbound/${mb.id}/`);
      message.success('Mailbox deleted.');
      fetchMailboxes();
    } catch {
      message.error('Failed to delete mailbox.');
    }
  }

  async function handlePollNow(mb: InboundMailbox) {
    setPollLoading(mb.id);
    try {
      await client.post(`/email-config/inbound/${mb.id}/poll-now/`);
      message.success('Poll triggered successfully.');
      fetchMailboxes();
    } catch (err: any) {
      message.error(err?.response?.data?.detail ?? 'Failed to trigger poll.');
    } finally {
      setPollLoading(null);
    }
  }

  const columns: ColumnsType<InboundMailbox> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (val: string, record: InboundMailbox) => (
        <Space direction="vertical" size={0}>
          <Text strong>{val}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.email_address}</Text>
        </Space>
      ),
    },
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      render: (val: string) => <Tag color={val === 'imap' ? 'blue' : 'purple'}>{val}</Tag>,
    },
    {
      title: 'Host : Port',
      key: 'host_port',
      render: (_: unknown, record: InboundMailbox) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{record.host}:{record.port}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (val: boolean) => (
        <Badge status={val ? 'success' : 'default'} text={val ? 'Active' : 'Inactive'} />
      ),
    },
    {
      title: 'Last Polled',
      dataIndex: 'last_polled_at',
      key: 'last_polled_at',
      render: (val: string | null) =>
        val ? <Text style={{ fontSize: 12 }}>{new Date(val).toLocaleString()}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Processed',
      dataIndex: 'emails_processed',
      key: 'emails_processed',
      render: (val: number) => <Text>{val ?? 0}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: InboundMailbox) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Button
            size="small"
            icon={<ApiOutlined />}
            onClick={async () => {
              setEditTarget(record);
              setTestResult(null);
              setTestLoading(true);
              try {
                const res = await client.post(`/email-config/inbound/${record.id}/test/`);
                message.open({
                  type: res.data.success ? 'success' : 'error',
                  content: res.data.message,
                });
              } catch (err: any) {
                message.error(err?.response?.data?.message ?? 'Test failed.');
              } finally {
                setTestLoading(false);
              }
            }}
          >
            Test
          </Button>
          <Button
            size="small"
            icon={<SyncOutlined />}
            loading={pollLoading === record.id}
            onClick={() => handlePollNow(record)}
          >
            Poll Now
          </Button>
          <Popconfirm
            title="Delete this mailbox?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const iredMailGuide = (
    <Collapse
      ghost
      style={{ marginBottom: 16 }}
      items={[
        {
          key: 'guide',
          label: <Text strong>iRedMail Setup Guide</Text>,
          children: (
            <Alert
              type="info"
              showIcon
              message="iRedMail Connection Settings"
              description={
                <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                  <li>IMAP SSL: port <strong>993</strong> (recommended)</li>
                  <li>POP3 SSL: port <strong>995</strong></li>
                  <li>Username must be the full email address</li>
                  <li>Create mailboxes in iRedAdmin before adding them here</li>
                  <li>Ensure firewall allows inbound connections from this server</li>
                </ul>
              }
            />
          ),
        },
      ]}
    />
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>Inbound Mailboxes</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          Add Mailbox
        </Button>
      </div>

      {iredMailGuide}

      <Table<InboundMailbox>
        dataSource={mailboxes}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />

      {/* Add / Edit Modal */}
      <Modal
        title={editTarget ? `Edit Mailbox — ${editTarget.name}` : 'Add Inbound Mailbox'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={600}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              icon={<ApiOutlined />}
              loading={testLoading}
              onClick={handleTest}
            >
              Test Connection
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              {editTarget ? 'Save Changes' : 'Create Mailbox'}
            </Button>
          </Space>
        }
      >
        {/* iRedMail hint */}
        <Alert
          type="info" showIcon closable
          style={{ marginBottom: 16 }}
          message="iRedMail defaults: IMAP SSL port 993 · POP3 SSL port 995 · Username = email address"
        />

        <Form form={form} layout="vertical">
          {/* 1. Email address — auto-fills username */}
          <Form.Item
            label="Email Address"
            name="email_address"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email.' }]}
          >
            <Input
              placeholder="helpdesk@company.local"
              onChange={(e) => form.setFieldValue('username', e.target.value)}
            />
          </Form.Item>

          {/* 2. iRedMail server IP */}
          <Form.Item
            label="Mail Server (iRedMail host)"
            name="host"
            rules={[{ required: true, message: 'Enter your iRedMail server IP or hostname.' }]}
          >
            <Input placeholder="192.168.1.10" />
          </Form.Item>

          {/* 3. Password */}
          <Form.Item
            label={editTarget ? 'Password (leave blank to keep current)' : 'Password'}
            name="password"
            rules={editTarget ? [] : [{ required: true, message: 'Password is required.' }]}
          >
            <Input.Password placeholder={editTarget ? '••••••••' : 'Mailbox password'} />
          </Form.Item>

          {/* 4. Protocol selector — auto-sets port */}
          <Form.Item label="Protocol" name="protocol">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              onChange={(e) => {
                form.setFieldValue('port', DEFAULT_PORT[e.target.value as ('imap' | 'pop3')])
              }}
            >
              <Radio.Button value="imap">IMAP (port 993)</Radio.Button>
              <Radio.Button value="pop3">POP3 (port 995)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {/* 5. Active toggle */}
          <Form.Item label="Enable this mailbox" name="is_active" valuePropName="checked">
            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
          </Form.Item>

          {/* Hidden fields filled automatically */}
          <Form.Item name="name" hidden><Input /></Form.Item>
          <Form.Item name="username" hidden><Input /></Form.Item>
          <Form.Item name="port" hidden><InputNumber /></Form.Item>
          <Form.Item name="use_ssl" hidden valuePropName="checked"><Switch /></Form.Item>
        </Form>

        {testResult !== null && (
          <Alert
            type={testResult.success ? 'success' : 'error'}
            showIcon
            icon={testResult.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            message={testResult.success ? 'Connection Successful' : 'Connection Failed'}
            description={
              <div>
                <div>{testResult.message}</div>
                {testResult.folders && testResult.folders.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <Text type="secondary">Folders found: </Text>
                    {testResult.folders.map((f) => (
                      <Tag key={f} style={{ marginTop: 2 }}>{f}</Tag>
                    ))}
                  </div>
                )}
              </div>
            }
            style={{ marginTop: 16 }}
          />
        )}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab 2: Outbound SMTP
// ---------------------------------------------------------------------------

const OutboundTab: React.FC = () => {
  const [smtpConfig, setSmtpConfig] = useState<ConfigMap>({});
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSecretTouched, setSmtpSecretTouched] = useState<Record<string, boolean>>({});
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [smtpForm] = Form.useForm();

  const fetchSmtp = useCallback(async () => {
    setSmtpLoading(true);
    try {
      const res = await client.get('/system-config/?section=smtp');
      const map = buildConfigMap(res.data);
      setSmtpConfig(map);
      const formVals: Record<string, any> = {};
      SMTP_KEYS.forEach((k) => {
        if (map[k]) {
          if (k === 'smtp_use_tls') {
            formVals[k] = map[k].value === 'true' || map[k].value === '1' || map[k].value === 'True';
          } else if (map[k].is_secret && isSecretPlaceholder(map[k].display_value)) {
            formVals[k] = '';
          } else {
            formVals[k] = map[k].value;
          }
        }
      });
      smtpForm.setFieldsValue(formVals);
    } catch {
      message.error('Failed to load SMTP configuration.');
    } finally {
      setSmtpLoading(false);
    }
  }, [smtpForm]);

  useEffect(() => { fetchSmtp(); }, [fetchSmtp]);

  const handleSaveSmtp = async () => {
    try {
      const values = await smtpForm.validateFields();
      setSmtpSaving(true);
      const updates: { key: string; value: string }[] = [];
      SMTP_KEYS.forEach((k) => {
        if (k === 'smtp_use_tls') {
          updates.push({ key: k, value: values[k] ? 'true' : 'false' });
        } else if (smtpConfig[k]?.is_secret) {
          if (smtpSecretTouched[k] && values[k]) {
            updates.push({ key: k, value: values[k] });
          } else {
            updates.push({ key: k, value: '' });
          }
        } else {
          updates.push({ key: k, value: String(values[k] ?? '') });
        }
      });
      await client.post('/system-config/update/', { updates });
      message.success('SMTP configuration saved.');
      setSmtpSecretTouched({});
      fetchSmtp();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error('Failed to save SMTP configuration.');
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) { message.warning('Enter a recipient email address.'); return; }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await client.post('/system-config/test-email/', { to_email: testEmail });
      setTestResult(res.data);
      if (res.data.success) {
        message.success('Test email sent successfully.');
      } else {
        message.error(`Test failed: ${res.data.error}`);
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err?.response?.data?.error ?? 'Unknown error.' });
      message.error('Test email failed.');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div>
      <Title level={5} style={{ marginBottom: 16 }}>Outbound Email (SMTP)</Title>
      <Spin spinning={smtpLoading}>
        <Form form={smtpForm} layout="vertical" style={{ maxWidth: 520 }}>
          <Form.Item
            label={smtpConfig['smtp_host']?.label ?? 'SMTP Host'}
            name="smtp_host"
            rules={smtpConfig['smtp_host']?.is_required ? [{ required: true, message: 'SMTP host is required.' }] : []}
            extra={smtpConfig['smtp_host']?.help_text}
          >
            <Input placeholder="e.g. 192.168.1.10 or smtp.gmail.com" />
          </Form.Item>
          <Form.Item
            label={smtpConfig['smtp_port']?.label ?? 'SMTP Port'}
            name="smtp_port"
            extra={smtpConfig['smtp_port']?.help_text}
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="587" />
          </Form.Item>
          <Form.Item
            label={smtpConfig['smtp_user']?.label ?? 'SMTP Username'}
            name="smtp_user"
            extra={smtpConfig['smtp_user']?.help_text}
          >
            <Input placeholder="username@example.com" />
          </Form.Item>
          <Form.Item
            label={smtpConfig['smtp_password']?.label ?? 'SMTP Password'}
            name="smtp_password"
            extra={
              smtpConfig['smtp_password']?.is_secret &&
              isSecretPlaceholder(smtpConfig['smtp_password']?.display_value)
                ? 'A password is already set. Enter a new value to change it.'
                : smtpConfig['smtp_password']?.help_text
            }
          >
            <Input.Password
              placeholder={
                smtpConfig['smtp_password']?.is_secret &&
                isSecretPlaceholder(smtpConfig['smtp_password']?.display_value)
                  ? '••••••••'
                  : 'Enter password'
              }
              onChange={() => setSmtpSecretTouched((prev) => ({ ...prev, smtp_password: true }))}
            />
          </Form.Item>
          <Form.Item
            label={smtpConfig['smtp_use_tls']?.label ?? 'Use TLS'}
            name="smtp_use_tls"
            valuePropName="checked"
            extra={smtpConfig['smtp_use_tls']?.help_text}
          >
            <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
          </Form.Item>
          <Form.Item
            label={smtpConfig['email_from']?.label ?? 'From Email Address'}
            name="email_from"
            rules={[{ type: 'email', message: 'Enter a valid email address.' }]}
            extra={smtpConfig['email_from']?.help_text}
          >
            <Input placeholder="helpdesk@yourcompany.com" />
          </Form.Item>
          <Divider />
          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={smtpSaving}
              onClick={handleSaveSmtp}
            >
              Save SMTP Settings
            </Button>
            <Button
              icon={<SendOutlined />}
              onClick={() => { setTestResult(null); setTestEmail(''); setTestModalOpen(true); }}
            >
              Send Test Email
            </Button>
          </Space>
        </Form>
      </Spin>

      {/* Test Email Modal */}
      <Modal
        title="Send Test Email"
        open={testModalOpen}
        onOk={handleTestEmail}
        onCancel={() => setTestModalOpen(false)}
        okText="Send Test"
        confirmLoading={testLoading}
        destroyOnClose
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="Recipient Email Address" required>
            <Input
              type="email"
              placeholder="recipient@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </Form.Item>
        </Form>
        {testResult && (
          <Alert
            type={testResult.success ? 'success' : 'error'}
            message={testResult.success ? 'Test email sent successfully.' : `Error: ${testResult.error}`}
            showIcon
            style={{ marginTop: 8 }}
          />
        )}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const EmailConfig: React.FC = () => {
  const tabItems = [
    {
      key: 'inbound',
      label: 'Inbound Mailboxes (IMAP/POP3)',
      children: <InboundTab />,
    },
    {
      key: 'outbound',
      label: 'Outbound Email (SMTP)',
      children: <OutboundTab />,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>Email Configuration</Title>
      <Alert
        type="warning"
        showIcon
        message="Changes take effect immediately. SMTP credentials are stored in the database."
        style={{ marginBottom: 20 }}
      />
      <Card>
        <Tabs items={tabItems} defaultActiveKey="inbound" />
      </Card>
    </div>
  );
};

export default EmailConfig;
