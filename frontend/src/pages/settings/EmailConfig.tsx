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
} from 'antd';
import { SaveOutlined, SendOutlined } from '@ant-design/icons';
import client from '../../api/client';

const { Title, Text } = Typography;

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

const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_use_tls', 'email_from'];
const IMAP_KEYS = ['imap_host', 'imap_port', 'imap_user', 'imap_password', 'imap_ssl', 'imap_processed_folder'];

function buildConfigMap(items: ConfigItem[]): ConfigMap {
  const map: ConfigMap = {};
  items.forEach((item) => { map[item.key] = item; });
  return map;
}

function isSecretPlaceholder(val: string): boolean {
  return val === '••••••••' || val === '********';
}

const EmailConfig: React.FC = () => {
  const [smtpConfig, setSmtpConfig] = useState<ConfigMap>({});
  const [imapConfig, setImapConfig] = useState<ConfigMap>({});
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [imapLoading, setImapLoading] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [imapSaving, setImapSaving] = useState(false);

  const [smtpForm] = Form.useForm();
  const [imapForm] = Form.useForm();

  // Tracks which secret fields the user has touched
  const [smtpSecretTouched, setSmtpSecretTouched] = useState<Record<string, boolean>>({});
  const [imapSecretTouched, setImapSecretTouched] = useState<Record<string, boolean>>({});

  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

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

  const fetchImap = useCallback(async () => {
    setImapLoading(true);
    try {
      const res = await client.get('/system-config/?section=imap');
      const map = buildConfigMap(res.data);
      setImapConfig(map);
      const formVals: Record<string, any> = {};
      IMAP_KEYS.forEach((k) => {
        if (map[k]) {
          if (k === 'imap_ssl') {
            formVals[k] = map[k].value === 'true' || map[k].value === '1' || map[k].value === 'True';
          } else if (map[k].is_secret && isSecretPlaceholder(map[k].display_value)) {
            formVals[k] = '';
          } else {
            formVals[k] = map[k].value;
          }
        }
      });
      imapForm.setFieldsValue(formVals);
    } catch {
      message.error('Failed to load IMAP configuration.');
    } finally {
      setImapLoading(false);
    }
  }, [imapForm]);

  useEffect(() => {
    fetchSmtp();
    fetchImap();
  }, [fetchSmtp, fetchImap]);

  const handleSaveSmtp = async () => {
    try {
      const values = await smtpForm.validateFields();
      setSmtpSaving(true);
      const updates: { key: string; value: string }[] = [];
      SMTP_KEYS.forEach((k) => {
        if (k === 'smtp_use_tls') {
          updates.push({ key: k, value: values[k] ? 'true' : 'false' });
        } else if (smtpConfig[k]?.is_secret) {
          // Only send if user changed the value
          if (smtpSecretTouched[k] && values[k]) {
            updates.push({ key: k, value: values[k] });
          }
          // If not touched or empty, send empty string (backend keeps existing)
          else {
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

  const handleSaveImap = async () => {
    try {
      const values = await imapForm.validateFields();
      setImapSaving(true);
      const updates: { key: string; value: string }[] = [];
      IMAP_KEYS.forEach((k) => {
        if (k === 'imap_ssl') {
          updates.push({ key: k, value: values[k] ? 'true' : 'false' });
        } else if (imapConfig[k]?.is_secret) {
          if (imapSecretTouched[k] && values[k]) {
            updates.push({ key: k, value: values[k] });
          } else {
            updates.push({ key: k, value: '' });
          }
        } else {
          updates.push({ key: k, value: String(values[k] ?? '') });
        }
      });
      await client.post('/system-config/update/', { updates });
      message.success('IMAP configuration saved.');
      setImapSecretTouched({});
      fetchImap();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error('Failed to save IMAP configuration.');
    } finally {
      setImapSaving(false);
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

  const renderSmtpForm = () => (
    <Spin spinning={smtpLoading}>
      <Form form={smtpForm} layout="vertical">
        <Form.Item
          label={smtpConfig['smtp_host']?.label ?? 'SMTP Host'}
          name="smtp_host"
          rules={smtpConfig['smtp_host']?.is_required ? [{ required: true, message: 'SMTP host is required.' }] : []}
          extra={smtpConfig['smtp_host']?.help_text}
        >
          <Input placeholder="e.g. smtp.gmail.com" />
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
  );

  const renderImapForm = () => (
    <Spin spinning={imapLoading}>
      <Form form={imapForm} layout="vertical">
        <Form.Item
          label={imapConfig['imap_host']?.label ?? 'IMAP Host'}
          name="imap_host"
          rules={imapConfig['imap_host']?.is_required ? [{ required: true, message: 'IMAP host is required.' }] : []}
          extra={imapConfig['imap_host']?.help_text}
        >
          <Input placeholder="e.g. imap.gmail.com" />
        </Form.Item>
        <Form.Item
          label={imapConfig['imap_port']?.label ?? 'IMAP Port'}
          name="imap_port"
          extra={imapConfig['imap_port']?.help_text}
        >
          <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="993" />
        </Form.Item>
        <Form.Item
          label={imapConfig['imap_user']?.label ?? 'IMAP Username'}
          name="imap_user"
          extra={imapConfig['imap_user']?.help_text}
        >
          <Input placeholder="username@example.com" />
        </Form.Item>
        <Form.Item
          label={imapConfig['imap_password']?.label ?? 'IMAP Password'}
          name="imap_password"
          extra={
            imapConfig['imap_password']?.is_secret &&
            isSecretPlaceholder(imapConfig['imap_password']?.display_value)
              ? 'A password is already set. Enter a new value to change it.'
              : imapConfig['imap_password']?.help_text
          }
        >
          <Input.Password
            placeholder={
              imapConfig['imap_password']?.is_secret &&
              isSecretPlaceholder(imapConfig['imap_password']?.display_value)
                ? '••••••••'
                : 'Enter password'
            }
            onChange={() => setImapSecretTouched((prev) => ({ ...prev, imap_password: true }))}
          />
        </Form.Item>
        <Form.Item
          label={imapConfig['imap_ssl']?.label ?? 'Use SSL'}
          name="imap_ssl"
          valuePropName="checked"
          extra={imapConfig['imap_ssl']?.help_text}
        >
          <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
        </Form.Item>
        <Form.Item
          label={imapConfig['imap_processed_folder']?.label ?? 'Processed Folder'}
          name="imap_processed_folder"
          extra={imapConfig['imap_processed_folder']?.help_text}
        >
          <Input placeholder="e.g. Processed" />
        </Form.Item>
        <Divider />
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={imapSaving}
          onClick={handleSaveImap}
        >
          Save IMAP Settings
        </Button>
      </Form>
    </Spin>
  );

  const tabItems = [
    {
      key: 'smtp',
      label: 'Outbound Email (SMTP)',
      children: renderSmtpForm(),
    },
    {
      key: 'imap',
      label: 'Inbound Email (IMAP)',
      children: renderImapForm(),
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
        <Tabs items={tabItems} />
      </Card>

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

export default EmailConfig;
