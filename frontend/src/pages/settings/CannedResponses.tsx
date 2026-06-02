import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Typography,
  message,
  Popconfirm,
  Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import client from '../../api/client';
import { useAuthStore } from '../../store/auth';

const { Title, Text } = Typography;

interface Category {
  id: number;
  name: string;
}

interface CannedResponse {
  id: number;
  name: string;
  subject: string;
  body: string;
  category: Category | null;
  scope: 'global' | 'personal';
  created_by: { id: number; full_name: string };
}

const SCOPE_COLORS: Record<string, string> = {
  global: 'blue',
  personal: 'green',
};

const BODY_PLACEHOLDER = `Write your response here...

Available variables:
  {{requestor_name}}  — Full name of the requestor
  {{ticket_id}}       — Ticket ID (e.g. TKT-0042)
  {{agent_name}}      — Assigned agent name
  {{category}}        — Ticket category`;

const CannedResponses: React.FC = () => {
  const { user } = useAuthStore();

  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingResponse, setEditingResponse] = useState<CannedResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchResponses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/canned-responses/');
      setResponses(res.data.results ?? res.data);
    } catch {
      message.error('Failed to load canned responses.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await client.get('/categories/');
      setCategories(res.data.results ?? res.data);
    } catch {
      message.error('Failed to load categories.');
    }
  }, []);

  useEffect(() => {
    fetchResponses();
    fetchCategories();
  }, [fetchResponses, fetchCategories]);

  const openAddDrawer = () => {
    setEditingResponse(null);
    form.resetFields();
    form.setFieldsValue({ scope: 'personal' });
    setDrawerOpen(true);
  };

  const openEditDrawer = (record: CannedResponse) => {
    setEditingResponse(record);
    form.setFieldsValue({
      name: record.name,
      subject: record.subject,
      category_id: record.category?.id ?? null,
      scope: record.scope,
      body: record.body,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        name: values.name,
        subject: values.subject ?? '',
        body: values.body,
        category_id: values.category_id ?? null,
        scope: values.scope,
      };
      if (editingResponse) {
        await client.patch(`/api/canned-responses/${editingResponse.id}/`, payload);
        message.success('Canned response updated.');
      } else {
        await client.post('/canned-responses/', payload);
        message.success('Canned response created.');
      }
      setDrawerOpen(false);
      form.resetFields();
      setEditingResponse(null);
      fetchResponses();
    } catch (err: any) {
      if (err?.errorFields) return;
      const errMsg = err?.response?.data
        ? Object.values(err.response.data).flat().join(' ')
        : 'Failed to save canned response.';
      message.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: CannedResponse) => {
    setDeleting(record.id);
    try {
      await client.delete(`/api/canned-responses/${record.id}/`);
      message.success('Canned response deleted.');
      fetchResponses();
    } catch {
      message.error('Failed to delete canned response.');
    } finally {
      setDeleting(null);
    }
  };

  const columns: ColumnsType<CannedResponse> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (cat: Category | null) =>
        cat ? (
          <Tag color="purple">{cat.name}</Tag>
        ) : (
          <Text type="secondary">All Categories</Text>
        ),
    },
    {
      title: 'Scope',
      dataIndex: 'scope',
      key: 'scope',
      render: (val: string) => (
        <Tag color={SCOPE_COLORS[val] ?? 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Preview',
      dataIndex: 'body',
      key: 'body',
      render: (body: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {body.length > 60 ? body.substring(0, 60) + '…' : body}
        </Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: CannedResponse) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => openEditDrawer(record)}
          />
          <Popconfirm
            title="Delete this canned response?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              loading={deleting === record.id}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Title level={4} style={{ margin: 0 }}>Canned Responses</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddDrawer}>
          Add Response
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={responses}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="middle"
      />

      <Drawer
        title={editingResponse ? 'Edit Canned Response' : 'Add Canned Response'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingResponse(null); form.resetFields(); }}
        width={560}
        footer={
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button
              onClick={() => { setDrawerOpen(false); setEditingResponse(null); form.resetFields(); }}
            >
              Cancel
            </Button>
            <Button type="primary" loading={saving} onClick={handleSave}>
              {editingResponse ? 'Save Changes' : 'Create Response'}
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Name is required.' }]}
          >
            <Input placeholder="e.g. Password Reset Instructions" />
          </Form.Item>
          <Form.Item label="Subject (optional)" name="subject">
            <Input placeholder="Email subject line" />
          </Form.Item>
          <Form.Item label="Category (optional)" name="category_id">
            <Select allowClear placeholder="All Categories">
              {categories.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="Scope"
            name="scope"
            rules={[{ required: true, message: 'Scope is required.' }]}
          >
            <Select>
              <Select.Option value="global">Global (visible to all agents)</Select.Option>
              <Select.Option value="personal">Personal (visible only to me)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="Body"
            name="body"
            rules={[{ required: true, message: 'Body is required.' }]}
          >
            <Input.TextArea
              rows={10}
              placeholder={BODY_PLACEHOLDER}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Available variables: <Text code>{'{{requestor_name}}'}</Text>{' '}
            <Text code>{'{{ticket_id}}'}</Text>{' '}
            <Text code>{'{{agent_name}}'}</Text>{' '}
            <Text code>{'{{category}}'}</Text>
          </Text>
        </Form>
      </Drawer>
    </div>
  );
};

export default CannedResponses;
