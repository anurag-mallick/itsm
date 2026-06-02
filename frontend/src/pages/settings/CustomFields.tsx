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
  Popconfirm,
  Tabs,
  InputNumber,
  Tooltip,
  Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LockOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import client from '../../api/client';
import { useAuthStore } from '../../store/auth';

const { Title, Text } = Typography;

type Module = 'tickets' | 'hardware_assets' | 'software_assets';

interface CustomField {
  id: number;
  module: Module;
  name: string;
  label: string;
  field_type: string;
  options: string[] | null;
  is_required: boolean;
  is_active: boolean;
  display_order: number;
  category_id: number | null;
}

// ── Built-in field definitions ────────────────────────────────────────────────

interface BuiltinField {
  label: string;
  type: string;
  required: 'Yes' | 'No' | '—';
  notes: string;
}

const BUILTIN_FIELDS: Record<Module, BuiltinField[]> = {
  tickets: [
    { label: 'Ticket Number', type: 'Auto-generated', required: '—', notes: 'Format: TKT-00001' },
    { label: 'Subject',       type: 'Text',           required: 'Yes', notes: '' },
    { label: 'Description',   type: 'Text Area',      required: 'No',  notes: '' },
    { label: 'Status',        type: 'Dropdown',       required: 'Yes', notes: 'Open / In Progress / Pending Info / Resolved / Closed' },
    { label: 'Priority',      type: 'Dropdown',       required: 'Yes', notes: 'Low / Medium / High / Critical' },
    { label: 'Category',      type: 'Dropdown',       required: 'No',  notes: 'From ticket categories settings' },
    { label: 'Requestor',     type: 'User',           required: 'Yes', notes: 'Auto-set to logged-in user' },
    { label: 'Assignee',      type: 'User',           required: 'No',  notes: 'Assigned by IT agents' },
    { label: 'Source',        type: 'Dropdown',       required: '—',   notes: 'Auto: Portal / Email / Teams' },
    { label: 'SLA Due Date',  type: 'Date / Time',    required: '—',   notes: 'Auto-calculated from category SLA' },
    { label: 'Created At',    type: 'Date / Time',    required: '—',   notes: 'Auto' },
  ],
  hardware_assets: [
    { label: 'Asset Tag',       type: 'Auto-generated', required: '—',   notes: 'Format: HW-00001' },
    { label: 'Name',            type: 'Text',           required: 'Yes', notes: '' },
    { label: 'Asset Type',      type: 'Dropdown',       required: 'Yes', notes: 'Laptop / Desktop / Server / …' },
    { label: 'Status',          type: 'Dropdown',       required: 'Yes', notes: 'Procurement / Active / Under Repair / …' },
    { label: 'Make',            type: 'Text',           required: 'No',  notes: '' },
    { label: 'Model',           type: 'Text',           required: 'No',  notes: '' },
    { label: 'Serial Number',   type: 'Text',           required: 'No',  notes: '' },
    { label: 'Location',        type: 'Text',           required: 'No',  notes: '' },
    { label: 'Site',            type: 'Dropdown',       required: 'No',  notes: 'From sites list' },
    { label: 'Assigned To',     type: 'User',           required: 'No',  notes: '' },
    { label: 'Purchase Date',   type: 'Date',           required: 'No',  notes: '' },
    { label: 'Purchase Cost',   type: 'Number',         required: 'No',  notes: '' },
    { label: 'Warranty Expiry', type: 'Date',           required: 'No',  notes: '' },
  ],
  software_assets: [
    { label: 'Name',          type: 'Text',     required: 'Yes', notes: '' },
    { label: 'Vendor',        type: 'Text',     required: 'No',  notes: '' },
    { label: 'Version',       type: 'Text',     required: 'No',  notes: '' },
    { label: 'License Type',  type: 'Dropdown', required: 'Yes', notes: 'Perpetual / Subscription / OEM / …' },
    { label: 'License Key',   type: 'Text',     required: 'No',  notes: 'Stored securely' },
    { label: 'Seat Count',    type: 'Number',   required: 'Yes', notes: '' },
    { label: 'Purchase Date', type: 'Date',     required: 'No',  notes: '' },
    { label: 'Expiry Date',   type: 'Date',     required: 'No',  notes: 'Alerts at 30 / 7 days' },
    { label: 'Purchase Cost', type: 'Number',   required: 'No',  notes: '' },
  ],
};

const BUILTIN_COLUMNS: ColumnsType<BuiltinField> = [
  {
    title: 'Label',
    dataIndex: 'label',
    key: 'label',
    render: (text: string) => <Text strong>{text}</Text>,
  },
  {
    title: 'Type',
    dataIndex: 'type',
    key: 'type',
    width: 160,
  },
  {
    title: 'Required',
    dataIndex: 'required',
    key: 'required',
    width: 100,
    render: (val: string) => {
      if (val === 'Yes') return <Badge status="error" text="Yes" />;
      if (val === 'No')  return <Badge status="default" text="No" />;
      return <Text type="secondary">—</Text>;
    },
  },
  {
    title: 'Notes',
    dataIndex: 'notes',
    key: 'notes',
    ellipsis: true,
    render: (val: string) => val || <Text type="secondary">—</Text>,
  },
];

// ── Custom field form helpers ─────────────────────────────────────────────────

const FIELD_TYPE_OPTIONS = [
  { value: 'text',         label: 'Text' },
  { value: 'textarea',     label: 'Text Area' },
  { value: 'number',       label: 'Number' },
  { value: 'date',         label: 'Date' },
  { value: 'datetime',     label: 'Date & Time' },
  { value: 'dropdown',     label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'checkbox',     label: 'Checkbox' },
  { value: 'url',          label: 'URL' },
  { value: 'email',        label: 'Email' },
];

const FIELD_TYPE_COLORS: Record<string, string> = {
  text:         'blue',
  textarea:     'geekblue',
  number:       'purple',
  date:         'cyan',
  datetime:     'teal',
  dropdown:     'orange',
  multi_select: 'volcano',
  checkbox:     'green',
  url:          'magenta',
  email:        'gold',
};

const MODULE_LABELS: Record<Module, string> = {
  tickets:         'Tickets',
  hardware_assets: 'Hardware Assets',
  software_assets: 'Software Assets',
};

function slugify(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ── OptionsInput ──────────────────────────────────────────────────────────────

interface OptionsInputProps {
  value?: string[];
  onChange?: (val: string[]) => void;
}

const OptionsInput: React.FC<OptionsInputProps> = ({ value = [], onChange }) => {
  const [inputVal, setInputVal] = useState('');

  const addOption = () => {
    const trimmed = inputVal.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      message.warning('Option already exists.');
      return;
    }
    onChange?.([...value, trimmed]);
    setInputVal('');
  };

  const removeOption = (opt: string) => {
    onChange?.(value.filter(v => v !== opt));
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 8 }}>
        {value.map(opt => (
          <Tag
            key={opt}
            closable
            onClose={() => removeOption(opt)}
            style={{ marginBottom: 4 }}
          >
            {opt}
          </Tag>
        ))}
      </Space>
      <Space>
        <Input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder="Add option..."
          onPressEnter={addOption}
          style={{ width: 200 }}
        />
        <Button size="small" onClick={addOption}>Add</Button>
      </Space>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const CustomFields: React.FC = () => {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role_name === 'super_admin';

  const [activeModule, setActiveModule] = useState<Module>('tickets');
  const [fields, setFields] = useState<Record<Module, CustomField[]>>({
    tickets:         [],
    hardware_assets: [],
    software_assets: [],
  });
  const [loading, setLoading] = useState<Record<Module, boolean>>({
    tickets:         false,
    hardware_assets: false,
    software_assets: false,
  });

  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingField,  setEditingField]  = useState<CustomField | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState<number | null>(null);
  const [form]                            = Form.useForm();
  const [fieldTypeValue, setFieldTypeValue] = useState<string>('text');

  const fetchFields = useCallback(async (mod: Module) => {
    setLoading(prev => ({ ...prev, [mod]: true }));
    try {
      // Use the correct path — Axios baseURL is '/api', so no '/api/' prefix here.
      const res = await client.get(`/custom-fields/?module=${mod}`);
      setFields(prev => ({ ...prev, [mod]: res.data.results ?? res.data }));
    } catch {
      message.error(`Failed to load custom fields for ${MODULE_LABELS[mod]}.`);
    } finally {
      setLoading(prev => ({ ...prev, [mod]: false }));
    }
  }, []);

  useEffect(() => {
    fetchFields('tickets');
    fetchFields('hardware_assets');
    fetchFields('software_assets');
  }, [fetchFields]);

  const openAddModal = () => {
    setEditingField(null);
    form.resetFields();
    form.setFieldsValue({ module: activeModule, is_required: false, display_order: 1 });
    setFieldTypeValue('text');
    setModalOpen(true);
  };

  const openEditModal = (record: CustomField) => {
    setEditingField(record);
    form.setFieldsValue({
      module:        record.module,
      label:         record.label,
      name:          record.name,
      field_type:    record.field_type,
      options:       record.options ?? [],
      is_required:   record.is_required,
      display_order: record.display_order,
    });
    setFieldTypeValue(record.field_type);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        module:        values.module,
        name:          values.name,
        label:         values.label,
        field_type:    values.field_type,
        is_required:   values.is_required ?? false,
        display_order: values.display_order ?? 1,
        options: ['dropdown', 'multi_select'].includes(values.field_type)
          ? values.options ?? []
          : null,
      };
      if (editingField) {
        await client.patch(`/custom-fields/${editingField.id}/`, payload);
        message.success('Custom field updated.');
      } else {
        await client.post('/custom-fields/', payload);
        message.success('Custom field created.');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingField(null);
      fetchFields(values.module as Module);
    } catch (err: unknown) {
      const e = err as { errorFields?: unknown; response?: { data: Record<string, unknown[]> } };
      if (e?.errorFields) return;
      const errMsg = e?.response?.data
        ? Object.values(e.response.data).flat().join(' ')
        : 'Failed to save custom field.';
      message.error(errMsg as string);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: CustomField) => {
    setDeleting(record.id);
    try {
      await client.delete(`/custom-fields/${record.id}/`);
      message.success('Custom field deleted.');
      fetchFields(record.module);
    } catch {
      message.error('Failed to delete custom field.');
    } finally {
      setDeleting(null);
    }
  };

  const buildCustomColumns = (mod: Module): ColumnsType<CustomField> => [
    {
      title: 'Label',
      dataIndex: 'label',
      key: 'label',
      render: (text: string, record: CustomField) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.name}</Text>
        </Space>
      ),
    },
    {
      title: 'Field Name',
      dataIndex: 'name',
      key: 'name',
      responsive: ['md'] as ('md')[],
    },
    {
      title: 'Type',
      dataIndex: 'field_type',
      key: 'field_type',
      render: (val: string) => (
        <Tag color={FIELD_TYPE_COLORS[val] ?? 'default'}>
          {FIELD_TYPE_OPTIONS.find(o => o.value === val)?.label ?? val}
        </Tag>
      ),
    },
    {
      title: 'Required',
      dataIndex: 'is_required',
      key: 'is_required',
      render: (val: boolean) => (
        <Badge status={val ? 'error' : 'default'} text={val ? 'Required' : 'Optional'} />
      ),
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (val: boolean) => (
        <Badge status={val ? 'success' : 'default'} text={val ? 'Active' : 'Inactive'} />
      ),
    },
    {
      title: 'Order',
      dataIndex: 'display_order',
      key: 'display_order',
      width: 70,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: CustomField) => (
        <Space>
          <Tooltip title={isSuperAdmin ? 'Edit' : 'Super Admin only'}>
            <Button
              icon={<EditOutlined />}
              size="small"
              disabled={!isSuperAdmin}
              onClick={() => isSuperAdmin && openEditModal(record)}
            />
          </Tooltip>
          <Tooltip title={isSuperAdmin ? 'Delete' : 'Super Admin only'}>
            <Popconfirm
              title="Delete this custom field?"
              description="This action cannot be undone."
              onConfirm={() => handleDelete(record)}
              disabled={!isSuperAdmin}
              okText="Delete"
              okButtonProps={{ danger: true }}
              cancelText="Cancel"
            >
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
                disabled={!isSuperAdmin}
                loading={deleting === record.id}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const tabItems = (['tickets', 'hardware_assets', 'software_assets'] as Module[]).map(mod => ({
    key: mod,
    label: MODULE_LABELS[mod],
    children: (
      <div>
        {/* Tab description */}
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Built-in fields are always present and cannot be modified. Use the section below to add
          additional fields specific to your organisation.
        </Text>

        {/* Built-in fields — read-only */}
        <div style={{ marginBottom: 4 }}>
          <Space align="center" style={{ marginBottom: 8 }}>
            <LockOutlined style={{ color: '#8c8c8c' }} />
            <Text strong style={{ fontSize: 14 }}>Built-in Fields</Text>
            <Tag color="default" style={{ fontSize: 11 }}>Read-only</Tag>
          </Space>
        </div>
        <Table<BuiltinField>
          columns={BUILTIN_COLUMNS}
          dataSource={BUILTIN_FIELDS[mod].map((f, i) => ({ ...f, key: i }))}
          rowKey="key"
          pagination={false}
          size="small"
          style={{ marginBottom: 0 }}
          rowClassName={() => 'builtin-field-row'}
        />

        <Divider style={{ margin: '20px 0' }} />

        {/* Custom fields — editable */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Space align="center">
            <Text strong style={{ fontSize: 14 }}>Custom Fields</Text>
            <Tag color="blue" style={{ fontSize: 11 }}>Organisation-defined</Tag>
          </Space>
          <Tooltip title={isSuperAdmin ? undefined : 'Super Admin only'}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!isSuperAdmin}
              onClick={openAddModal}
            >
              Add Field
            </Button>
          </Tooltip>
        </div>
        <Table<CustomField>
          columns={buildCustomColumns(mod)}
          dataSource={fields[mod]}
          rowKey="id"
          loading={loading[mod]}
          pagination={{ pageSize: 20 }}
          size="middle"
          locale={{ emptyText: 'No custom fields defined for this module yet.' }}
        />
      </div>
    ),
  }));

  const showOptions = ['dropdown', 'multi_select'].includes(fieldTypeValue);

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>Custom Fields</Title>
      <Tabs
        items={tabItems}
        activeKey={activeModule}
        onChange={(key: string) => setActiveModule(key as Module)}
      />

      <Modal
        title={editingField ? 'Edit Custom Field' : 'Add Custom Field'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditingField(null); form.resetFields(); }}
        confirmLoading={saving}
        okText={editingField ? 'Save Changes' : 'Create Field'}
        width={560}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onValuesChange={(changed: Record<string, unknown>) => {
            if (changed.field_type !== undefined) {
              setFieldTypeValue(changed.field_type as string);
            }
            if (changed.label !== undefined && !editingField) {
              form.setFieldValue('name', slugify(changed.label as string));
            }
          }}
        >
          <Form.Item label="Module" name="module">
            <Select disabled>
              {Object.entries(MODULE_LABELS).map(([val, lbl]) => (
                <Select.Option key={val} value={val}>{lbl}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="Label"
            name="label"
            rules={[{ required: true, message: 'Label is required.' }]}
          >
            <Input placeholder="e.g. Asset Location" />
          </Form.Item>
          <Form.Item
            label="Field Name (slug)"
            name="name"
            rules={[
              { required: true, message: 'Field name is required.' },
              {
                pattern: /^[a-z0-9_]+$/,
                message: 'Field name must be lowercase letters, numbers, and underscores only.',
              },
            ]}
            extra="Auto-filled from label. Used as the API key."
          >
            <Input placeholder="e.g. asset_location" />
          </Form.Item>
          <Form.Item
            label="Field Type"
            name="field_type"
            rules={[{ required: true, message: 'Field type is required.' }]}
          >
            <Select placeholder="Select field type">
              {FIELD_TYPE_OPTIONS.map(o => (
                <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          {showOptions && (
            <Form.Item
              label="Options"
              name="options"
              rules={[{ required: true, message: 'At least one option is required for this field type.' }]}
              extra="Press Enter or click Add to add each option."
            >
              <OptionsInput />
            </Form.Item>
          )}
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item
              label="Required"
              name="is_required"
              valuePropName="checked"
              style={{ marginBottom: 0 }}
            >
              <Switch checkedChildren="Yes" unCheckedChildren="No" />
            </Form.Item>
            <Form.Item
              label="Display Order"
              name="display_order"
              style={{ marginBottom: 0 }}
            >
              <InputNumber min={1} max={999} style={{ width: 100 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomFields;
