import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Typography,
  Badge,
  message,
  Popconfirm,
  InputNumber,
  Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import client from '../../api/client';
import { useAuthStore } from '../../store/auth';

const { Title } = Typography;

interface Category {
  id: number;
  name: string;
  sla_response_hours: number;
  sla_resolution_hours: number;
  is_active: boolean;
}

const Categories: React.FC = () => {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role_name === 'super_admin';

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/categories/');
      setCategories(res.data.results ?? res.data);
    } catch {
      message.error('Failed to load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openAddModal = () => {
    setEditingCategory(null);
    form.resetFields();
    form.setFieldsValue({ sla_response_hours: 8, sla_resolution_hours: 24 });
    setModalOpen(true);
  };

  const openEditModal = (record: Category) => {
    setEditingCategory(record);
    form.setFieldsValue({
      name: record.name,
      sla_response_hours: record.sla_response_hours,
      sla_resolution_hours: record.sla_resolution_hours,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        name: values.name,
        sla_response_hours: values.sla_response_hours,
        sla_resolution_hours: values.sla_resolution_hours,
      };
      if (editingCategory) {
        await client.patch(`/api/categories/${editingCategory.id}/`, payload);
        message.success('Category updated.');
      } else {
        await client.post('/categories/', payload);
        message.success('Category created.');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingCategory(null);
      fetchCategories();
    } catch (err: any) {
      if (err?.errorFields) return;
      const errMsg = err?.response?.data
        ? Object.values(err.response.data).flat().join(' ')
        : 'Failed to save category.';
      message.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (record: Category) => {
    setToggling(record.id);
    try {
      await client.patch(`/api/categories/${record.id}/`, { is_active: !record.is_active });
      message.success(`Category ${record.is_active ? 'deactivated' : 'activated'}.`);
      fetchCategories();
    } catch {
      message.error('Failed to update category status.');
    } finally {
      setToggling(null);
    }
  };

  const columns: ColumnsType<Category> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: 'SLA Response (hrs)',
      dataIndex: 'sla_response_hours',
      key: 'sla_response_hours',
      align: 'center',
      render: (val: number) => `${val}h`,
    },
    {
      title: 'SLA Resolution (hrs)',
      dataIndex: 'sla_resolution_hours',
      key: 'sla_resolution_hours',
      align: 'center',
      render: (val: number) => `${val}h`,
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
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: Category) => (
        <Space>
          <Tooltip title={isSuperAdmin ? 'Edit category' : 'Super Admin only'}>
            <Button
              icon={<EditOutlined />}
              size="small"
              disabled={!isSuperAdmin}
              onClick={() => isSuperAdmin && openEditModal(record)}
            />
          </Tooltip>
          <Tooltip
            title={
              isSuperAdmin
                ? record.is_active
                  ? 'Deactivate category'
                  : 'Activate category'
                : 'Super Admin only'
            }
          >
            <Popconfirm
              title={record.is_active ? 'Deactivate this category?' : 'Activate this category?'}
              onConfirm={() => handleToggleActive(record)}
              disabled={!isSuperAdmin}
              okText="Yes"
              cancelText="No"
            >
              <Button
                size="small"
                danger={record.is_active}
                disabled={!isSuperAdmin}
                loading={toggling === record.id}
              >
                {record.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Title level={4} style={{ margin: 0 }}>Ticket Categories</Title>
        <Tooltip title={isSuperAdmin ? undefined : 'Super Admin only'}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!isSuperAdmin}
            onClick={openAddModal}
          >
            Add Category
          </Button>
        </Tooltip>
      </Space>

      <Table
        columns={columns}
        dataSource={categories}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        size="middle"
      />

      <Modal
        title={editingCategory ? 'Edit Category' : 'Add Category'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditingCategory(null); form.resetFields(); }}
        confirmLoading={saving}
        okText={editingCategory ? 'Save Changes' : 'Create Category'}
        width={440}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Category Name"
            name="name"
            rules={[{ required: true, message: 'Category name is required.' }]}
          >
            <Input placeholder="e.g. Hardware Issue" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item
              label="SLA Response Hours"
              name="sla_response_hours"
              rules={[{ required: true, message: 'Required.' }]}
              style={{ flex: 1, marginBottom: 0 }}
              extra="Time to first response"
            >
              <InputNumber min={1} max={8760} style={{ width: '100%' }} addonAfter="hrs" />
            </Form.Item>
            <Form.Item
              label="SLA Resolution Hours"
              name="sla_resolution_hours"
              rules={[{ required: true, message: 'Required.' }]}
              style={{ flex: 1, marginBottom: 0 }}
              extra="Time to resolution"
            >
              <InputNumber min={1} max={8760} style={{ width: '100%' }} addonAfter="hrs" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default Categories;
