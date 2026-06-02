import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Alert,
  Typography,
  Space,
  Badge,
  Divider,
  Spin,
  message,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
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

const TEAMS_KEYS = ['teams_app_id', 'teams_app_password', 'teams_tenant_id', 'teams_webhook_url'];

function isSecretPlaceholder(val: string): boolean {
  return val === '••••••••' || val === '********';
}

function buildConfigMap(items: ConfigItem[]): ConfigMap {
  const map: ConfigMap = {};
  items.forEach((item) => { map[item.key] = item; });
  return map;
}

const TeamsConfig: React.FC = () => {
  const [config, setConfig] = useState<ConfigMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secretTouched, setSecretTouched] = useState<Record<string, boolean>>({});
  const [form] = Form.useForm();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/system-config/?section=teams');
      const map = buildConfigMap(res.data);
      setConfig(map);
      const formVals: Record<string, string> = {};
      TEAMS_KEYS.forEach((k) => {
        if (map[k]) {
          if (map[k].is_secret && isSecretPlaceholder(map[k].display_value)) {
            formVals[k] = '';
          } else {
            formVals[k] = map[k].value;
          }
        }
      });
      form.setFieldsValue(formVals);
    } catch {
      message.error('Failed to load Teams configuration.');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const updates: { key: string; value: string }[] = [];
      TEAMS_KEYS.forEach((k) => {
        if (config[k]?.is_secret) {
          if (secretTouched[k] && values[k]) {
            updates.push({ key: k, value: values[k] });
          } else {
            updates.push({ key: k, value: '' });
          }
        } else {
          updates.push({ key: k, value: String(values[k] ?? '') });
        }
      });
      await client.post('/system-config/update/', { updates });
      message.success('Teams configuration saved.');
      setSecretTouched({});
      fetchConfig();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error('Failed to save Teams configuration.');
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = !!(config['teams_app_id']?.value);

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Title level={4} style={{ margin: 0 }}>Teams Configuration</Title>
        <Badge
          status={isConfigured ? 'success' : 'warning'}
          text={
            <Text style={{ fontWeight: 500 }}>
              {isConfigured ? 'Configured' : 'Not Configured'}
            </Text>
          }
        />
      </Space>

      <Alert
        type="info"
        showIcon
        message="Microsoft Teams Integration"
        description={
          <>
            The webhook URL must be reachable from Microsoft Azure Bot Service. Configure port
            forwarding to expose this URL:{' '}
            <Text code>https://yourserver.com/api/teams/webhook/</Text>
          </>
        }
        style={{ marginBottom: 20 }}
      />

      <Card title="Microsoft Teams (Azure Bot)">
        <Spin spinning={loading}>
          <Form form={form} layout="vertical">
            <Form.Item
              label={config['teams_app_id']?.label ?? 'App ID'}
              name="teams_app_id"
              rules={
                config['teams_app_id']?.is_required
                  ? [{ required: true, message: 'App ID is required.' }]
                  : []
              }
              extra={config['teams_app_id']?.help_text}
            >
              <Input placeholder="Azure Bot App ID (GUID)" />
            </Form.Item>

            <Form.Item
              label={config['teams_app_password']?.label ?? 'App Password'}
              name="teams_app_password"
              extra={
                config['teams_app_password']?.is_secret &&
                isSecretPlaceholder(config['teams_app_password']?.display_value)
                  ? 'A password is already set. Enter a new value to change it.'
                  : config['teams_app_password']?.help_text
              }
            >
              <Input.Password
                placeholder={
                  config['teams_app_password']?.is_secret &&
                  isSecretPlaceholder(config['teams_app_password']?.display_value)
                    ? '••••••••'
                    : 'Enter app password'
                }
                onChange={() =>
                  setSecretTouched((prev) => ({ ...prev, teams_app_password: true }))
                }
              />
            </Form.Item>

            <Form.Item
              label={config['teams_tenant_id']?.label ?? 'Tenant ID'}
              name="teams_tenant_id"
              extra={config['teams_tenant_id']?.help_text}
            >
              <Input placeholder="Azure AD Tenant ID (GUID)" />
            </Form.Item>

            <Form.Item
              label={config['teams_webhook_url']?.label ?? 'Webhook URL'}
              name="teams_webhook_url"
              rules={[{ type: 'url', message: 'Enter a valid URL.' }]}
              extra={config['teams_webhook_url']?.help_text}
            >
              <Input placeholder="https://yourserver.com/api/teams/webhook/" />
            </Form.Item>

            <Divider />
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              Save Teams Settings
            </Button>
          </Form>
        </Spin>
      </Card>
    </div>
  );
};

export default TeamsConfig;
