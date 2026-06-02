import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Tag, Space, Input, Select, Typography, Badge, Tooltip,
  Modal, Form, DatePicker, InputNumber, message, Tabs, Avatar, Alert,
  Spin, Divider, Checkbox,
} from 'antd'
import {
  PlusOutlined, SearchOutlined, LaptopOutlined, InboxOutlined,
} from '@ant-design/icons'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import client from '../../api/client'
import { useAuthStore } from '../../store/auth'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatusHistoryItem {
  old_status: string
  new_status: string
  changed_by: { full_name: string }
  notes: string
  changed_at: string
}

interface HardwareAsset {
  id: string
  asset_tag: string
  name: string
  asset_type: string
  make: string
  model_name: string
  serial_number: string
  status: string
  warranty_status: string
  location: string
  // API returns flat fields, not a nested object
  assigned_to: string | null        // UUID of assigned user (FK)
  assigned_to_email: string | null
  assigned_to_name: string | null
  purchase_date: string | null
  purchase_cost: string | null
  warranty_expiry: string | null
  notes: string
  custom_fields: Record<string, unknown>
  status_history: StatusHistoryItem[]
  created_at: string
  is_archived: boolean
  archived_at: string | null
  archived_by_email: string | null
  archive_reason: string
}

interface PaginatedAssets {
  count: number
  results: HardwareAsset[]
}

interface CustomFieldOption {
  label: string
  value: string
}

interface CustomField {
  id: number
  name: string
  field_key: string
  label: string
  field_type: 'text' | 'textarea' | 'number' | 'date' | 'dropdown' | 'checkbox' | 'multi_select'
  is_required: boolean
  options?: CustomFieldOption[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSET_TYPE_LABELS: Record<string, string> = {
  laptop: 'Laptop',
  desktop: 'Desktop',
  server: 'Server',
  monitor: 'Monitor',
  phone: 'Phone',
  tablet: 'Tablet',
  printer: 'Printer',
  network_switch: 'Network Switch',
  router: 'Router',
  ups: 'UPS',
  peripheral: 'Peripheral',
  other: 'Other',
}

const ASSET_TYPE_OPTIONS = Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => ({ value, label }))

const STATUS_OPTIONS = [
  { label: 'Procurement', value: 'procurement' },
  { label: 'Active', value: 'active' },
  { label: 'Under Repair', value: 'under_repair' },
  { label: 'Retired', value: 'retired' },
  { label: 'Disposed', value: 'disposed' },
]

const STATUS_COLORS: Record<string, string> = {
  active: 'green',
  procurement: 'blue',
  under_repair: 'orange',
  retired: 'default',
  disposed: 'red',
}

const WARRANTY_BADGE: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  valid: 'success',
  expiring_soon: 'warning',
  expired: 'error',
  unknown: 'default',
}

const WARRANTY_LABELS: Record<string, string> = {
  valid: 'Valid',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
  unknown: 'Unknown',
}

const PAGE_SIZE = 25

// ── Custom field renderer ─────────────────────────────────────────────────────

function renderCustomField(field: CustomField) {
  switch (field.field_type) {
    case 'text':
      return <Input />
    case 'textarea':
      return <Input.TextArea rows={3} />
    case 'number':
      return <InputNumber style={{ width: '100%' }} />
    case 'date':
      return <DatePicker style={{ width: '100%' }} />
    case 'dropdown':
      return (
        <Select style={{ width: '100%' }}>
          {(field.options ?? []).map(o => (
            <Option key={o.value} value={o.value}>{o.label}</Option>
          ))}
        </Select>
      )
    case 'checkbox':
      return <Checkbox />
    case 'multi_select':
      return (
        <Select mode="multiple" style={{ width: '100%' }}>
          {(field.options ?? []).map(o => (
            <Option key={o.value} value={o.value}>{o.label}</Option>
          ))}
        </Select>
      )
    default:
      return <Input />
  }
}

// ── ArchiveModal ──────────────────────────────────────────────────────────────

interface ArchiveModalProps {
  open: boolean
  assetTag: string
  loading: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

function ArchiveModal({ open, assetTag, loading, onConfirm, onCancel }: ArchiveModalProps) {
  const [reason, setReason] = useState('')

  function handleOk() {
    if (reason.trim().length < 10) {
      message.warning('Reason must be at least 10 characters.')
      return
    }
    onConfirm(reason.trim())
  }

  function handleCancel() {
    setReason('')
    onCancel()
  }

  return (
    <Modal
      title={`Archive Asset ${assetTag}`}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Archive"
      okButtonProps={{ danger: true, loading }}
      cancelButtonProps={{ disabled: loading }}
      destroyOnClose
      afterClose={() => setReason('')}
    >
      <Alert
        type="warning"
        showIcon
        message="This asset will be hidden from all active views. You can restore it from the Archived Assets tab."
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 8 }}>
        <Text strong>Reason for archiving</Text>
        <Text type="secondary" style={{ marginLeft: 4, fontSize: 12 }}>(min 10 characters)</Text>
      </div>
      <TextArea
        rows={4}
        placeholder="Enter reason for archiving this asset…"
        value={reason}
        onChange={e => setReason(e.target.value)}
        maxLength={500}
        showCount
      />
    </Modal>
  )
}

// ── UnarchiveModal ────────────────────────────────────────────────────────────

interface UnarchiveModalProps {
  open: boolean
  asset: HardwareAsset | null
  loading: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

function UnarchiveModal({ open, asset, loading, onConfirm, onCancel }: UnarchiveModalProps) {
  const [reason, setReason] = useState('')

  function handleOk() {
    if (reason.trim().length < 10) {
      message.warning('Reason must be at least 10 characters.')
      return
    }
    onConfirm(reason.trim())
  }

  function handleCancel() {
    setReason('')
    onCancel()
  }

  return (
    <Modal
      title="Restore Asset from Archive"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Restore"
      okButtonProps={{ loading }}
      cancelButtonProps={{ disabled: loading }}
      destroyOnClose
      afterClose={() => setReason('')}
    >
      {asset && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <div>
              <div>
                <Text strong>Archived at: </Text>
                <Text>
                  {asset.archived_at
                    ? dayjs(asset.archived_at).format('DD MMM YYYY, HH:mm')
                    : '—'}
                </Text>
              </div>
              {asset.archive_reason && (
                <div style={{ marginTop: 4 }}>
                  <Text strong>Archive reason: </Text>
                  <Text>{asset.archive_reason}</Text>
                </div>
              )}
            </div>
          }
        />
      )}
      <div style={{ marginBottom: 8 }}>
        <Text strong>Reason for restoring</Text>
        <Text type="secondary" style={{ marginLeft: 4, fontSize: 12 }}>(min 10 characters)</Text>
      </div>
      <TextArea
        rows={4}
        placeholder="Enter reason for restoring this asset…"
        value={reason}
        onChange={e => setReason(e.target.value)}
        maxLength={500}
        showCount
      />
    </Modal>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HardwareList() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const isAgent = ['it_agent', 'it_manager', 'super_admin'].includes(user?.role_name ?? '')

  // List state
  const [assets, setAssets] = useState<HardwareAsset[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  // Warranty alerts state
  const [warrantyAssets, setWarrantyAssets] = useState<HardwareAsset[]>([])
  const [warrantyLoading, setWarrantyLoading] = useState(false)

  // Archived assets state
  const [archivedAssets, setArchivedAssets] = useState<HardwareAsset[]>([])
  const [archivedTotal, setArchivedTotal] = useState(0)
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [archivedPage, setArchivedPage] = useState(1)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [searchRaw, setSearchRaw] = useState('')
  const [search, setSearch] = useState('')

  // Active tab
  const [activeTab, setActiveTab] = useState('all')

  // Add modal
  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [form] = Form.useForm()

  // Custom fields for Add Asset modal
  const [addCustomFields, setAddCustomFields] = useState<CustomField[]>([])
  const [addCustomFieldsLoading, setAddCustomFieldsLoading] = useState(false)

  // Archive modal
  const [archiveTarget, setArchiveTarget] = useState<HardwareAsset | null>(null)
  const [archiveLoading, setArchiveLoading] = useState(false)

  // Unarchive modal
  const [unarchiveTarget, setUnarchiveTarget] = useState<HardwareAsset | null>(null)
  const [unarchiveLoading, setUnarchiveLoading] = useState(false)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), 300)
    return () => clearTimeout(t)
  }, [searchRaw])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [statusFilter, typeFilter, search])

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { page, page_size: PAGE_SIZE }
      if (statusFilter.length) params.status = statusFilter.join(',')
      if (typeFilter.length) params.asset_type = typeFilter.join(',')
      if (search) params.search = search
      const { data } = await client.get<PaginatedAssets>('/assets/hardware/', { params })
      setAssets(data.results ?? [])
      setTotal(data.count ?? 0)
    } catch {
      const msg = 'Failed to load hardware assets.'
      setError(msg)
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, typeFilter, search])

  const fetchWarrantyAlerts = useCallback(async () => {
    setWarrantyLoading(true)
    try {
      const { data } = await client.get<HardwareAsset[] | PaginatedAssets>('/assets/hardware/warranty-alerts/')
      setWarrantyAssets(
        Array.isArray(data) ? data : (data as PaginatedAssets).results ?? []
      )
    } catch {
      message.error('Failed to load warranty alerts.')
    } finally {
      setWarrantyLoading(false)
    }
  }, [])

  const fetchArchivedAssets = useCallback(async () => {
    setArchivedLoading(true)
    try {
      const { data } = await client.get<PaginatedAssets>('/assets/hardware/archived/', {
        params: { page: archivedPage, page_size: PAGE_SIZE },
      })
      setArchivedAssets(data.results ?? [])
      setArchivedTotal(data.count ?? 0)
    } catch {
      message.error('Failed to load archived assets.')
    } finally {
      setArchivedLoading(false)
    }
  }, [archivedPage])

  // Load custom fields for Add Asset modal when it opens
  const fetchAddCustomFields = useCallback(async () => {
    setAddCustomFieldsLoading(true)
    try {
      const { data } = await client.get<CustomField[] | { results: CustomField[] }>(
        '/custom-fields/',
        { params: { module: 'hardware_assets' } }
      )
      const list = Array.isArray(data) ? data : (data as { results: CustomField[] }).results ?? []
      setAddCustomFields(list)
    } catch {
      message.error('Failed to load additional fields.')
    } finally {
      setAddCustomFieldsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAssets() }, [fetchAssets])

  useEffect(() => {
    if (activeTab === 'warranty') fetchWarrantyAlerts()
    if (activeTab === 'archived') fetchArchivedAssets()
  }, [activeTab, fetchWarrantyAlerts, fetchArchivedAssets])

  // Load custom fields when modal opens
  useEffect(() => {
    if (addOpen) fetchAddCustomFields()
  }, [addOpen, fetchAddCustomFields])

  const handleAdd = async (values: Record<string, unknown>) => {
    setAddLoading(true)
    try {
      // Separate standard fields from custom field values
      const custom_fields: Record<string, unknown> = {}
      addCustomFields.forEach(f => {
        const key = `cf_${f.field_key}`
        if (values[key] !== undefined && values[key] !== null) {
          custom_fields[f.name] = values[key]
        }
        delete values[key]
      })

      const payload: Record<string, unknown> = { ...values, custom_fields }
      if (values.purchase_date) {
        payload.purchase_date = dayjs(values.purchase_date as string).format('YYYY-MM-DD')
      }
      if (values.warranty_expiry) {
        payload.warranty_expiry = dayjs(values.warranty_expiry as string).format('YYYY-MM-DD')
      }

      await client.post('/assets/hardware/', payload)
      message.success('Asset created successfully.')
      setAddOpen(false)
      form.resetFields()
      fetchAssets()
    } catch {
      message.error('Failed to create asset.')
    } finally {
      setAddLoading(false)
    }
  }

  // ── Archive handlers ─────────────────────────────────────────────────────────

  async function handleArchiveConfirm(reason: string) {
    if (!archiveTarget) return
    setArchiveLoading(true)
    try {
      await client.post(`/assets/hardware/${archiveTarget.id}/archive/`, { reason })
      message.success(`Asset ${archiveTarget.asset_tag} archived.`)
      setArchiveTarget(null)
      fetchAssets()
      fetchArchivedAssets()
    } catch {
      message.error('Failed to archive asset.')
    } finally {
      setArchiveLoading(false)
    }
  }

  async function handleUnarchiveConfirm(reason: string) {
    if (!unarchiveTarget) return
    setUnarchiveLoading(true)
    try {
      await client.post(`/assets/hardware/${unarchiveTarget.id}/unarchive/`, { reason })
      message.success(`Asset ${unarchiveTarget.asset_tag} restored.`)
      setUnarchiveTarget(null)
      fetchArchivedAssets()
    } catch {
      message.error('Failed to restore asset.')
    } finally {
      setUnarchiveLoading(false)
    }
  }

  // ── Columns ──────────────────────────────────────────────────────────────────

  const assetColumns: ColumnsType<HardwareAsset> = [
    {
      title: 'Asset Tag',
      dataIndex: 'asset_tag',
      key: 'asset_tag',
      width: 120,
      render: (val: string) => (
        <Tag style={{ fontFamily: 'monospace', fontWeight: 600 }}>{val}</Tag>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (val: string, record: HardwareAsset) => (
        <a
          onClick={e => { e.stopPropagation(); navigate(`/assets/hardware/${record.id}`) }}
          style={{ fontWeight: 500 }}
        >
          {val}
        </a>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'asset_type',
      key: 'asset_type',
      width: 140,
      render: (val: string) => (
        <Tag icon={<LaptopOutlined />}>{ASSET_TYPE_LABELS[val] ?? val}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (val: string) => (
        <Tag color={STATUS_COLORS[val] ?? 'default'}>
          {(val ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
        </Tag>
      ),
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 160,
      ellipsis: true,
      render: (val: string) => val || <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'Assigned To',
      key: 'assigned_to',
      width: 180,
      ellipsis: true,
      render: (_: unknown, record: HardwareAsset) => {
        if (!record.assigned_to) return <span style={{ color: '#bbb' }}>Unassigned</span>
        const displayName = record.assigned_to_name || record.assigned_to_email || '?'
        const initial = displayName.charAt(0).toUpperCase()
        return (
          <Space size={6}>
            <Avatar size={24} style={{ backgroundColor: '#1677ff', fontSize: 11 }}>
              {initial}
            </Avatar>
            <span>{displayName}</span>
          </Space>
        )
      },
    },
    {
      title: 'Warranty',
      dataIndex: 'warranty_status',
      key: 'warranty_status',
      width: 140,
      render: (val: string) => (
        <Badge
          status={WARRANTY_BADGE[val] ?? 'default'}
          text={WARRANTY_LABELS[val] ?? val}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: isAgent ? 170 : 90,
      render: (_: unknown, record: HardwareAsset) => (
        <Space size={4}>
          <Button
            size="small"
            onClick={e => { e.stopPropagation(); navigate(`/assets/hardware/${record.id}`) }}
          >
            View
          </Button>
          {isAgent && (
            <Button
              size="small"
              danger
              icon={<InboxOutlined />}
              onClick={e => { e.stopPropagation(); setArchiveTarget(record) }}
            >
              Archive
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const archivedColumns: ColumnsType<HardwareAsset> = [
    {
      title: 'Asset Tag',
      dataIndex: 'asset_tag',
      key: 'asset_tag',
      width: 120,
      render: (val: string) => (
        <Tag style={{ fontFamily: 'monospace', fontWeight: 600 }}>{val}</Tag>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (val: string, record: HardwareAsset) => (
        <a
          onClick={e => { e.stopPropagation(); navigate(`/assets/hardware/${record.id}`) }}
          style={{ fontWeight: 500 }}
        >
          {val}
        </a>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'asset_type',
      key: 'asset_type',
      width: 140,
      render: (val: string) => (
        <Tag icon={<LaptopOutlined />}>{ASSET_TYPE_LABELS[val] ?? val}</Tag>
      ),
    },
    {
      title: 'Archived By',
      dataIndex: 'archived_by_email',
      key: 'archived_by_email',
      width: 180,
      ellipsis: true,
      render: (val: string | null) => val ?? '—',
    },
    {
      title: 'Archived At',
      dataIndex: 'archived_at',
      key: 'archived_at',
      width: 130,
      render: (val: string | null) =>
        val ? (
          <Tooltip title={dayjs(val).format('DD MMM YYYY, HH:mm')}>
            {dayjs(val).fromNow()}
          </Tooltip>
        ) : '—',
    },
    {
      title: 'Reason',
      dataIndex: 'archive_reason',
      key: 'archive_reason',
      ellipsis: true,
      render: (val: string) => {
        if (!val) return '—'
        const truncated = val.length > 50 ? val.slice(0, 50) + '…' : val
        return (
          <Tooltip title={val}>
            <span>{truncated}</span>
          </Tooltip>
        )
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: HardwareAsset) => (
        <Button
          size="small"
          onClick={e => { e.stopPropagation(); setUnarchiveTarget(record) }}
        >
          Restore
        </Button>
      ),
    },
  ]

  const activePagination: TablePaginationConfig = {
    current: page,
    pageSize: PAGE_SIZE,
    total,
    showSizeChanger: false,
    showTotal: (t: number) => `${t} asset${t !== 1 ? 's' : ''}`,
    onChange: (p: number) => setPage(p),
  }

  const archivedPagination: TablePaginationConfig = {
    current: archivedPage,
    pageSize: PAGE_SIZE,
    total: archivedTotal,
    showSizeChanger: false,
    showTotal: (t: number) => `${t} archived asset${t !== 1 ? 's' : ''}`,
    onChange: (p: number) => setArchivedPage(p),
  }

  const filterBar = (
    <Space wrap style={{ marginBottom: 16 }}>
      <Input
        placeholder="Search assets…"
        prefix={<SearchOutlined />}
        value={searchRaw}
        onChange={e => setSearchRaw(e.target.value)}
        allowClear
        style={{ width: 240 }}
      />
      <Select
        mode="multiple"
        placeholder="Filter by status"
        value={statusFilter}
        onChange={setStatusFilter}
        style={{ minWidth: 200 }}
        maxTagCount="responsive"
        allowClear
      >
        {STATUS_OPTIONS.map(o => (
          <Option key={o.value} value={o.value}>{o.label}</Option>
        ))}
      </Select>
      <Select
        mode="multiple"
        placeholder="Filter by type"
        value={typeFilter}
        onChange={setTypeFilter}
        style={{ minWidth: 200 }}
        maxTagCount="responsive"
        allowClear
      >
        {ASSET_TYPE_OPTIONS.map(o => (
          <Option key={o.value} value={o.value}>{o.label}</Option>
        ))}
      </Select>
      {(statusFilter.length > 0 || typeFilter.length > 0 || search) && (
        <Button
          size="small"
          onClick={() => { setStatusFilter([]); setTypeFilter([]); setSearchRaw('') }}
        >
          Clear filters
        </Button>
      )}
    </Space>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Hardware Assets</Title>
        {isAgent && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Add Asset
          </Button>
        )}
      </div>

      {/* Error alert shown above tabs when fetch fails */}
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={fetchAssets}>
              Retry
            </Button>
          }
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'all',
            label: 'Active Assets',
            children: (
              <>
                {filterBar}
                <Table<HardwareAsset>
                  rowKey="id"
                  columns={assetColumns}
                  dataSource={assets}
                  loading={loading}
                  pagination={activePagination}
                  onRow={record => ({
                    onClick: () => navigate(`/assets/hardware/${record.id}`),
                    style: { cursor: 'pointer' },
                  })}
                  size="middle"
                  scroll={{ x: 1000 }}
                />
              </>
            ),
          },
          {
            key: 'warranty',
            label: 'Warranty Alerts',
            children: (
              <Table<HardwareAsset>
                rowKey="id"
                columns={assetColumns.filter(c => c.key !== 'actions').concat([
                  {
                    title: 'Warranty Expiry',
                    key: 'warranty_expiry_date',
                    width: 140,
                    render: (_: unknown, record: HardwareAsset) =>
                      record.warranty_expiry
                        ? <Tooltip title={dayjs(record.warranty_expiry).format('DD MMM YYYY')}>
                            <span style={{ color: dayjs(record.warranty_expiry).isBefore(dayjs()) ? '#ff4d4f' : '#fa8c16' }}>
                              {dayjs(record.warranty_expiry).fromNow()}
                            </span>
                          </Tooltip>
                        : <span style={{ color: '#bbb' }}>—</span>,
                  },
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 90,
                    render: (_: unknown, record: HardwareAsset) => (
                      <Button
                        size="small"
                        onClick={e => { e.stopPropagation(); navigate(`/assets/hardware/${record.id}`) }}
                      >
                        View
                      </Button>
                    ),
                  },
                ])}
                dataSource={warrantyAssets}
                loading={warrantyLoading}
                pagination={false}
                onRow={record => ({
                  onClick: () => navigate(`/assets/hardware/${record.id}`),
                  style: { cursor: 'pointer' },
                })}
                size="middle"
                scroll={{ x: 1100 }}
              />
            ),
          },
          {
            key: 'archived',
            label: (
              <span>
                <InboxOutlined style={{ marginRight: 6 }} />
                Archived Assets
                {archivedTotal > 0 && (
                  <Badge
                    count={archivedTotal}
                    size="small"
                    style={{ marginLeft: 8, backgroundColor: '#8c8c8c' }}
                    overflowCount={999}
                  />
                )}
              </span>
            ),
            children: (
              <Table<HardwareAsset>
                rowKey="id"
                columns={archivedColumns}
                dataSource={archivedAssets}
                loading={archivedLoading}
                pagination={archivedPagination}
                onRow={record => ({
                  onClick: () => navigate(`/assets/hardware/${record.id}`),
                  style: { cursor: 'pointer' },
                })}
                size="middle"
                scroll={{ x: 1000 }}
              />
            ),
          },
        ]}
      />

      {/* Add Asset Modal */}
      <Modal
        title="Add Hardware Asset"
        open={addOpen}
        onCancel={() => { setAddOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        okText="Create Asset"
        confirmLoading={addLoading}
        width={640}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAdd}
          style={{ marginTop: 8 }}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Asset name is required.' }]}
          >
            <Input placeholder="e.g. Dell Latitude 7490" />
          </Form.Item>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="Asset Type" name="asset_type" style={{ flex: 1, marginBottom: 16 }}>
              <Select placeholder="Select type" style={{ width: '100%' }}>
                {ASSET_TYPE_OPTIONS.map(o => (
                  <Option key={o.value} value={o.value}>{o.label}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Make" name="make" style={{ flex: 1, marginBottom: 16 }}>
              <Input placeholder="e.g. Dell" />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="Model" name="model_name" style={{ flex: 1, marginBottom: 16 }}>
              <Input placeholder="e.g. Latitude 7490" />
            </Form.Item>
            <Form.Item label="Serial Number" name="serial_number" style={{ flex: 1, marginBottom: 16 }}>
              <Input placeholder="e.g. SN12345678" />
            </Form.Item>
          </Space>

          <Form.Item label="Location" name="location">
            <Input placeholder="e.g. Mumbai HQ, Floor 3" />
          </Form.Item>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="Purchase Date" name="purchase_date" style={{ flex: 1, marginBottom: 16 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Warranty Expiry" name="warranty_expiry" style={{ flex: 1, marginBottom: 16 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item label="Purchase Cost" name="purchase_cost">
            <InputNumber
              prefix="₹"
              style={{ width: '100%' }}
              min={0}
              precision={2}
              placeholder="0.00"
            />
          </Form.Item>

          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} placeholder="Optional notes…" />
          </Form.Item>

          {/* Additional custom fields */}
          {addCustomFieldsLoading && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Spin size="small" />
            </div>
          )}
          {!addCustomFieldsLoading && addCustomFields.length > 0 && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#555', marginTop: 8 }}>
                Additional Fields
              </Divider>
              {addCustomFields.map(field => (
                <Form.Item
                  key={field.id}
                  label={field.label || field.name}
                  name={`cf_${field.field_key}`}
                  valuePropName={field.field_type === 'checkbox' ? 'checked' : 'value'}
                  rules={
                    field.is_required
                      ? [{ required: true, message: `${field.label || field.name} is required.` }]
                      : []
                  }
                >
                  {renderCustomField(field)}
                </Form.Item>
              ))}
            </>
          )}
        </Form>
      </Modal>

      {/* Archive Modal */}
      <ArchiveModal
        open={archiveTarget !== null}
        assetTag={archiveTarget?.asset_tag ?? ''}
        loading={archiveLoading}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setArchiveTarget(null)}
      />

      {/* Unarchive Modal */}
      <UnarchiveModal
        open={unarchiveTarget !== null}
        asset={unarchiveTarget}
        loading={unarchiveLoading}
        onConfirm={handleUnarchiveConfirm}
        onCancel={() => setUnarchiveTarget(null)}
      />
    </div>
  )
}
