import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Tag,
  Space,
  Typography,
  Badge,
  message,
  Tooltip,
  Popconfirm,
  Drawer,
  Tabs,
  Spin,
  Empty,
  Collapse,
  List as AntList,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  ReloadOutlined,
  DesktopOutlined,
  DisconnectOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import client from '../../api/client';
import { useAuthStore } from '../../store/auth';

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Role {
  id: number;
  name: string;
  display_name: string;
}

interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: number;
  role_name: string;
  role_display: string;
  account_type: string;
  is_active: boolean;
  created_at: string;
}

interface HardwareAsset {
  id: number;
  asset_tag: string;
  name: string;
  asset_type: string;
  status: string;
  acceptance_status: string;
  site: string;
  location: string;
  url: string;
}

interface SoftwareAsset {
  installation_id: number;
  license_id: number;
  license_name: string;
  vendor: string;
  license_type: string;
  installed_on: string;
  via_asset?: string;
  url: string;
}

interface UserAssetsData {
  user: { id: number; email: string; full_name: string; role: string };
  hardware: HardwareAsset[];
  software: SoftwareAsset[];
  hardware_count: number;
  software_count: number;
  total_assets: number;
}

interface DeallocationPreview {
  preview: boolean;
  hardware_count: number;
  software_count: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Role guide data
// ---------------------------------------------------------------------------

const ROLE_DESCRIPTIONS: Record<
  string,
  { label: string; color: string; description: string; capabilities: string[] }
> = {
  super_admin: {
    label: 'Super Admin',
    color: 'red',
    description: 'Full system access. Can manage all settings, users, and data.',
    capabilities: [
      'Manage all users and roles',
      'Configure email, Teams, custom fields',
      'Access all modules',
      'Manage system settings',
      'View audit logs',
    ],
  },
  it_manager: {
    label: 'IT Manager',
    color: 'orange',
    description: 'Manages IT operations and the IT team.',
    capabilities: [
      'Assign/reassign tickets',
      'Manage hardware & software assets',
      'Approve access requests',
      'View reports and audit logs',
      'Manage categories and catalog',
    ],
  },
  it_agent: {
    label: 'IT Agent',
    color: 'blue',
    description: 'Handles day-to-day IT support and asset management.',
    capabilities: [
      'Create and resolve tickets',
      'Assign hardware to users',
      'Handle access requests',
      'Add KB articles',
      'Run asset discovery scans',
    ],
  },
  requestor: {
    label: 'Requestor',
    color: 'green',
    description: 'Regular employee — can request services and report issues.',
    capabilities: [
      'Submit tickets and service requests',
      'View own tickets',
      'Browse knowledge base',
      'Request hardware/software via catalog',
    ],
  },
  auditor: {
    label: 'Auditor',
    color: 'purple',
    description: 'Compliance role — read-only access to all records.',
    capabilities: [
      'View all tickets, assets, and changes',
      'View full audit log',
      'Export audit reports',
      'Cannot create or modify records',
    ],
  },
};

// ---------------------------------------------------------------------------
// RoleGuide sub-component
// ---------------------------------------------------------------------------

const RoleGuide: React.FC = () => (
  <Collapse
    defaultActiveKey={[]}
    size="small"
    style={{ marginBottom: 16, background: '#fafafa', border: '1px solid #f0f0f0' }}
    items={[
      {
        key: 'roles',
        label: (
          <span style={{ fontSize: 13, color: '#595959' }}>
            <InfoCircleOutlined style={{ marginRight: 6, color: '#1677ff' }} />
            Role Definitions (expand to see what each role can do)
          </span>
        ),
        children: (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {Object.entries(ROLE_DESCRIPTIONS).map(([key, info]) => (
              <div
                key={key}
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 6,
                  padding: '10px 14px',
                  background: '#fff',
                }}
              >
                <Space align="start">
                  <Tag color={info.color} style={{ marginTop: 2 }}>
                    {info.label}
                  </Tag>
                  <div>
                    <Text style={{ fontSize: 13 }}>{info.description}</Text>
                    <AntList
                      size="small"
                      dataSource={info.capabilities}
                      style={{ marginTop: 6 }}
                      renderItem={(item) => (
                        <AntList.Item style={{ padding: '2px 0', border: 'none' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            · {item}
                          </Text>
                        </AntList.Item>
                      )}
                    />
                  </div>
                </Space>
              </div>
            ))}
          </Space>
        ),
      },
    ]}
  />
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'red',
  it_manager: 'volcano',
  it_agent: 'blue',
  requestor: 'green',
};

const ACCEPTANCE_STATUS_COLORS: Record<string, string> = {
  pending: 'gold',
  accepted: 'green',
  rejected: 'red',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const UserManagement: React.FC = () => {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role_name === 'super_admin';
  const isITManager = user?.role_name === 'it_manager';

  // ── User list state ────────────────────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  // ── Add / Edit modal state ─────────────────────────────────────────────────
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);

  // ── Assets drawer state ────────────────────────────────────────────────────
  const [assetsDrawerOpen, setAssetsDrawerOpen] = useState(false);
  const [assetsUser, setAssetsUser] = useState<User | null>(null);
  const [assetsData, setAssetsData] = useState<UserAssetsData | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);

  // ── Deallocate modal state ─────────────────────────────────────────────────
  const [deallocModalOpen, setDeallocModalOpen] = useState(false);
  const [deallocPreview, setDeallocPreview] = useState<DeallocationPreview | null>(null);
  const [deallocReason, setDeallocReason] = useState('');
  const [deallocLoading, setDeallocLoading] = useState(false);
  const [deallocPreviewLoading, setDeallocPreviewLoading] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/users/');
      setUsers(res.data.results ?? res.data);
    } catch {
      message.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await client.get('/roles/');
      setRoles(res.data);
    } catch {
      message.error('Failed to load roles.');
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, [fetchUsers, fetchRoles]);

  const fetchUserAssets = useCallback(async (userId: number) => {
    setAssetsLoading(true);
    setAssetsData(null);
    try {
      const res = await client.get<UserAssetsData>(`/users/${userId}/assets/`);
      setAssetsData(res.data);
    } catch {
      message.error('Failed to load user assets.');
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  // ── User CRUD handlers ─────────────────────────────────────────────────────

  const handleAddUser = async () => {
    try {
      const values = await addForm.validateFields();
      setSaving(true);
      await client.post('/users/', {
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name,
        role: values.role,
        account_type: values.account_type,
        password: values.password,
      });
      message.success('User created successfully.');
      setAddModalOpen(false);
      addForm.resetFields();
      fetchUsers();
    } catch (err: any) {
      if (err?.response?.data) {
        const errors = Object.values(err.response.data).flat().join(' ');
        message.error(`Failed to create user: ${errors}`);
      } else if (err?.errorFields) {
        // validation error — do nothing
      } else {
        message.error('Failed to create user.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = async () => {
    if (!editingUser) return;
    try {
      const values = await editForm.validateFields();
      setSaving(true);
      await client.patch(`/api/users/${editingUser.id}/`, {
        first_name: values.first_name,
        last_name: values.last_name,
        role: values.role,
        is_active: values.is_active,
      });
      message.success('User updated successfully.');
      setEditModalOpen(false);
      setEditingUser(null);
      editForm.resetFields();
      fetchUsers();
    } catch (err: any) {
      if (err?.response?.data) {
        const errors = Object.values(err.response.data).flat().join(' ');
        message.error(`Failed to update user: ${errors}`);
      } else if (err?.errorFields) {
        // validation error
      } else {
        message.error('Failed to update user.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (record: User) => {
    setToggling(record.id);
    try {
      await client.patch(`/api/users/${record.id}/`, { is_active: !record.is_active });
      message.success(`User ${record.is_active ? 'deactivated' : 'activated'} successfully.`);
      fetchUsers();
    } catch {
      message.error('Failed to update user status.');
    } finally {
      setToggling(null);
    }
  };

  const openEditModal = (record: User) => {
    setEditingUser(record);
    editForm.setFieldsValue({
      first_name: record.first_name,
      last_name: record.last_name,
      role: record.role,
      is_active: record.is_active,
    });
    setEditModalOpen(true);
  };

  // ── Assets drawer handlers ─────────────────────────────────────────────────

  const openAssetsDrawer = (record: User) => {
    setAssetsUser(record);
    setAssetsDrawerOpen(true);
    fetchUserAssets(record.id);
  };

  const closeAssetsDrawer = () => {
    setAssetsDrawerOpen(false);
    setAssetsUser(null);
    setAssetsData(null);
    setDeallocModalOpen(false);
    setDeallocPreview(null);
    setDeallocReason('');
  };

  // ── Deallocate handlers ────────────────────────────────────────────────────

  const openDeallocModal = async () => {
    if (!assetsUser) return;
    setDeallocPreviewLoading(true);
    setDeallocModalOpen(true);
    setDeallocReason('');
    try {
      const res = await client.post<DeallocationPreview>(
        `/users/${assetsUser.id}/deallocate-assets/`,
        { confirm: false },
      );
      setDeallocPreview(res.data);
    } catch {
      message.error('Failed to load deallocation preview.');
      setDeallocModalOpen(false);
    } finally {
      setDeallocPreviewLoading(false);
    }
  };

  const handleConfirmDealloc = async () => {
    if (!assetsUser) return;
    setDeallocLoading(true);
    try {
      await client.post(`/users/${assetsUser.id}/deallocate-assets/`, {
        confirm: true,
        reason: deallocReason,
      });
      message.success('All assets deallocated successfully.');
      setDeallocModalOpen(false);
      setDeallocPreview(null);
      setDeallocReason('');
      fetchUserAssets(assetsUser.id);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? 'Failed to deallocate assets.';
      message.error(msg);
    } finally {
      setDeallocLoading(false);
    }
  };

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filteredUsers = users.filter((u) => {
    const q = searchText.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role_display?.toLowerCase().includes(q)
    );
  });

  // ── Hardware table columns ─────────────────────────────────────────────────

  const hardwareColumns: ColumnsType<HardwareAsset> = [
    {
      title: 'Asset Tag',
      dataIndex: 'asset_tag',
      key: 'asset_tag',
      render: (val: string) => (
        <Text style={{ fontFamily: 'monospace' }}>{val}</Text>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Type',
      dataIndex: 'asset_type',
      key: 'asset_type',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => (
        <Tag color="blue">{val}</Tag>
      ),
    },
    {
      title: 'Acceptance',
      dataIndex: 'acceptance_status',
      key: 'acceptance_status',
      render: (val: string) => (
        <Tag color={ACCEPTANCE_STATUS_COLORS[val] ?? 'default'}>
          {val ? val.charAt(0).toUpperCase() + val.slice(1) : 'None'}
        </Tag>
      ),
    },
    {
      title: 'Location / Site',
      key: 'location_site',
      render: (_: unknown, record: HardwareAsset) => (
        <Space direction="vertical" size={0}>
          {record.location && <span>{record.location}</span>}
          {record.site && (
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.site}</span>
          )}
          {!record.location && !record.site && <span style={{ color: '#bfbfbf' }}>—</span>}
        </Space>
      ),
    },
  ];

  // ── Software table columns ─────────────────────────────────────────────────

  const softwareColumns: ColumnsType<SoftwareAsset> = [
    {
      title: 'License Name',
      dataIndex: 'license_name',
      key: 'license_name',
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
    },
    {
      title: 'Type',
      dataIndex: 'license_type',
      key: 'license_type',
      render: (val: string) => <Tag>{val}</Tag>,
    },
    {
      title: 'Installed On',
      dataIndex: 'installed_on',
      key: 'installed_on',
      render: (val: string) => (val ? new Date(val).toLocaleDateString() : '—'),
    },
    {
      title: 'Via Asset',
      dataIndex: 'via_asset',
      key: 'via_asset',
      render: (val?: string) =>
        val ? <Text style={{ fontFamily: 'monospace' }}>{val}</Text> : <span style={{ color: '#bfbfbf' }}>—</span>,
    },
  ];

  // ── Main user table columns ────────────────────────────────────────────────

  const columns: ColumnsType<User> = [
    {
      title: 'Name',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (text: string, record: User) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{text}</span>
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.email}</span>
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      responsive: ['md'] as any,
    },
    {
      title: 'Role',
      dataIndex: 'role_display',
      key: 'role',
      render: (text: string, record: User) => (
        <Tag color={ROLE_COLORS[record.role_name] ?? 'default'}>{text}</Tag>
      ),
    },
    {
      title: 'Account Type',
      dataIndex: 'account_type',
      key: 'account_type',
      render: (val: string) => (
        <Tag color={val === 'staff' ? 'blue' : 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => (
        <Badge
          status={active ? 'success' : 'default'}
          text={active ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => new Date(val).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: User) => (
        <Space>
          <Tooltip title={isSuperAdmin ? 'Edit user' : 'Super Admin only'}>
            <Button
              icon={<EditOutlined />}
              size="small"
              disabled={!isSuperAdmin}
              onClick={() => isSuperAdmin && openEditModal(record)}
            >
              Edit
            </Button>
          </Tooltip>

          <Button
            icon={<DesktopOutlined />}
            size="small"
            type="default"
            onClick={() => openAssetsDrawer(record)}
          >
            View Assets
          </Button>

          <Tooltip
            title={
              isSuperAdmin
                ? record.is_active
                  ? 'Deactivate user'
                  : 'Activate user'
                : 'Super Admin only'
            }
          >
            <ToggleActiveButton
              record={record}
              isSuperAdmin={isSuperAdmin}
              toggling={toggling}
              onConfirm={handleToggleActive}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Title level={4} style={{ margin: 0 }}>User Management</Title>
        <Space>
          <Input.Search
            placeholder="Search by name, email, or role..."
            allowClear
            style={{ width: 280 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Tooltip title={isSuperAdmin ? undefined : 'Only Super Admins can add users'}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!isSuperAdmin}
              onClick={() => setAddModalOpen(true)}
            >
              Add User
            </Button>
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading} />
        </Space>
      </Space>

      <Table
        columns={columns}
        dataSource={filteredUsers}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        size="middle"
      />

      {/* ── Add User Modal ─────────────────────────────────────────────────── */}
      <Modal
        title="Add User"
        open={addModalOpen}
        onOk={handleAddUser}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }}
        confirmLoading={saving}
        okText="Create User"
        width={560}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Email is required.' },
              { type: 'email', message: 'Enter a valid email address.' },
            ]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item
              label="First Name"
              name="first_name"
              rules={[{ required: true, message: 'First name is required.' }]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Input placeholder="First name" />
            </Form.Item>
            <Form.Item
              label="Last Name"
              name="last_name"
              rules={[{ required: true, message: 'Last name is required.' }]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Input placeholder="Last name" />
            </Form.Item>
          </Space>
          <div style={{ height: 16 }} />

          {/* Role guide */}
          <RoleGuide />

          <Form.Item
            label="Role"
            name="role"
            rules={[{ required: true, message: 'Role is required.' }]}
          >
            <Select placeholder="Select a role">
              {roles.map((r) => (
                <Select.Option key={r.id} value={r.id}>
                  {r.display_name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="Account Type"
            name="account_type"
            rules={[{ required: true, message: 'Account type is required.' }]}
          >
            <Select placeholder="Select account type">
              <Select.Option value="staff">Staff</Select.Option>
              <Select.Option value="guest">Guest</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[
              { required: true, message: 'Password is required.' },
              { min: 8, message: 'Password must be at least 8 characters.' },
            ]}
          >
            <Input.Password
              placeholder="Enter password"
              addonAfter={
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => {
                    const pwd = generatePassword(12);
                    addForm.setFieldValue('password', pwd);
                  }}
                >
                  Generate
                </Button>
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Edit User Modal ────────────────────────────────────────────────── */}
      <Modal
        title="Edit User"
        open={editModalOpen}
        onOk={handleEditUser}
        onCancel={() => { setEditModalOpen(false); setEditingUser(null); editForm.resetFields(); }}
        confirmLoading={saving}
        okText="Save Changes"
        width={560}
        destroyOnClose
      >
        {editingUser && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
            <span style={{ color: '#8c8c8c', fontSize: 13 }}>Editing: </span>
            <span style={{ fontWeight: 500 }}>{editingUser.email}</span>
          </div>
        )}
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item
              label="First Name"
              name="first_name"
              rules={[{ required: true, message: 'First name is required.' }]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="Last Name"
              name="last_name"
              rules={[{ required: true, message: 'Last name is required.' }]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Input />
            </Form.Item>
          </Space>
          <div style={{ height: 16 }} />

          {/* Role guide */}
          <RoleGuide />

          <Form.Item
            label="Role"
            name="role"
            rules={[{ required: true, message: 'Role is required.' }]}
          >
            <Select placeholder="Select a role">
              {roles.map((r) => (
                <Select.Option key={r.id} value={r.id}>
                  {r.display_name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Active" name="is_active" valuePropName="checked">
            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Assets Drawer ──────────────────────────────────────────────────── */}
      <Drawer
        title={assetsUser ? `Assets — ${assetsUser.full_name}` : 'User Assets'}
        width={560}
        open={assetsDrawerOpen}
        onClose={closeAssetsDrawer}
        footer={
          <Space>
            {(isITManager || isSuperAdmin) && assetsData && assetsData.total_assets > 0 && (
              <Button
                danger
                icon={<DisconnectOutlined />}
                onClick={openDeallocModal}
              >
                Deallocate All Assets
              </Button>
            )}
            <Button onClick={closeAssetsDrawer}>Close</Button>
          </Space>
        }
        footerStyle={{ display: 'flex', justifyContent: 'flex-end' }}
      >
        {assetsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Spin size="large" />
          </div>
        ) : assetsData ? (
          <>
            {/* Summary row */}
            <Space style={{ marginBottom: 16 }} wrap>
              <Tag color="blue">{assetsData.hardware_count} Hardware Asset(s)</Tag>
              <Tag color="purple">{assetsData.software_count} Software License(s)</Tag>
            </Space>

            {assetsData.total_assets === 0 ? (
              <Empty description="No assets assigned to this user." style={{ marginTop: 40 }} />
            ) : (
              <Tabs
                defaultActiveKey="hardware"
                items={[
                  {
                    key: 'hardware',
                    label: `Hardware (${assetsData.hardware_count})`,
                    children: (
                      <Table<HardwareAsset>
                        dataSource={assetsData.hardware}
                        columns={hardwareColumns}
                        rowKey="id"
                        size="small"
                        pagination={assetsData.hardware.length > 10 ? { pageSize: 10 } : false}
                        scroll={{ x: true }}
                      />
                    ),
                  },
                  {
                    key: 'software',
                    label: `Software (${assetsData.software_count})`,
                    children: (
                      <Table<SoftwareAsset>
                        dataSource={assetsData.software}
                        columns={softwareColumns}
                        rowKey="installation_id"
                        size="small"
                        pagination={assetsData.software.length > 10 ? { pageSize: 10 } : false}
                        scroll={{ x: true }}
                      />
                    ),
                  },
                ]}
              />
            )}
          </>
        ) : null}
      </Drawer>

      {/* ── Deallocate Confirmation Modal ──────────────────────────────────── */}
      <Modal
        title="Deallocate All Assets"
        open={deallocModalOpen}
        onCancel={() => {
          setDeallocModalOpen(false);
          setDeallocPreview(null);
          setDeallocReason('');
        }}
        onOk={handleConfirmDealloc}
        confirmLoading={deallocLoading}
        okText="Confirm Deallocation"
        okButtonProps={{ danger: true }}
        width={480}
        destroyOnClose
      >
        {deallocPreviewLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <Spin />
          </div>
        ) : deallocPreview ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div
              style={{
                background: '#fff7e6',
                border: '1px solid #ffd591',
                borderRadius: 6,
                padding: '10px 14px',
              }}
            >
              <Text>
                This will unassign{' '}
                <Text strong>{deallocPreview.hardware_count} hardware</Text> and{' '}
                <Text strong>{deallocPreview.software_count} software</Text> from{' '}
                <Text strong>{assetsUser?.email}</Text>.
              </Text>
            </div>
            <Text type="secondary">
              The assets will return to the unassigned pool and can be reallocated.
            </Text>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Reason{' '}
                <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                  (optional)
                </Text>
              </Text>
              <Input.TextArea
                rows={3}
                placeholder="Reason for deallocation, e.g. Employee offboarding"
                value={deallocReason}
                onChange={(e) => setDeallocReason(e.target.value)}
                maxLength={500}
                showCount
              />
            </div>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Toggle Active Button
// ---------------------------------------------------------------------------

interface ToggleActiveButtonProps {
  record: User;
  isSuperAdmin: boolean;
  toggling: number | null;
  onConfirm: (record: User) => void;
}

const ToggleActiveButton: React.FC<ToggleActiveButtonProps> = ({
  record,
  isSuperAdmin,
  toggling,
  onConfirm,
}) => {
  const [localAssetCount, setLocalAssetCount] = useState<number | null>(null);
  const [checkingAssets, setCheckingAssets] = useState(false);

  const getAssetCount = useCallback(async () => {
    if (localAssetCount !== null) return localAssetCount;
    setCheckingAssets(true);
    try {
      const res = await client.get<{ total_assets: number }>(`/users/${record.id}/assets/`);
      const count = res.data.total_assets;
      setLocalAssetCount(count);
      return count;
    } catch {
      return 0;
    } finally {
      setCheckingAssets(false);
    }
  }, [record.id, localAssetCount]);

  const [popconfirmTitle, setPopconfirmTitle] = useState<React.ReactNode>(
    record.is_active ? 'Deactivate this user?' : 'Activate this user?',
  );
  const [popconfirmDesc, setPopconfirmDesc] = useState<React.ReactNode>(null);

  const handleVisibleChange = async (visible: boolean) => {
    if (!visible || !isSuperAdmin || !record.is_active) return;
    const count = await getAssetCount();
    if (count > 0) {
      setPopconfirmTitle(`This user has ${count} asset(s) assigned. Deactivate anyway?`);
      setPopconfirmDesc('You can deallocate assets separately.');
    } else {
      setPopconfirmTitle('Deactivate this user?');
      setPopconfirmDesc(null);
    }
  };

  return (
    <Popconfirm
      title={popconfirmTitle}
      description={popconfirmDesc}
      onConfirm={() => onConfirm(record)}
      onOpenChange={handleVisibleChange}
      disabled={!isSuperAdmin}
      okText="Yes"
      cancelText="No"
    >
      <Button
        size="small"
        danger={record.is_active}
        disabled={!isSuperAdmin}
        loading={toggling === record.id || checkingAssets}
      >
        {record.is_active ? 'Deactivate' : 'Activate'}
      </Button>
    </Popconfirm>
  );
};

export default UserManagement;
