import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Tag, Space, Typography, Badge, Modal, Form,
  DatePicker, InputNumber, Input, Select, message, Tabs, Drawer,
  Progress, Divider, List, Tooltip, Popconfirm, Timeline, Empty,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, AppstoreAddOutlined,
  CheckCircleOutlined, CloseCircleOutlined, CalendarOutlined,
  LaptopOutlined, BellOutlined, FileAddOutlined, SwapOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import client from '../../api/client'
import { useAuthStore } from '../../store/auth'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { Option } = Select

// ── Types ─────────────────────────────────────────────────────────────────────

interface Installation {
  id: string
  hardware_asset: { id: string; asset_tag: string; name: string }
  installed_on: string | null
  installed_by: { full_name: string } | null
  notes: string
}

interface SoftwareLicense {
  id: string
  name: string
  vendor: string
  version: string
  license_type: string
  seat_count: number
  seats_used: number
  is_compliant: boolean
  days_until_expiry: number | null
  purchase_date: string | null
  expiry_date: string | null
  purchase_cost: string | null
  notes: string
  custom_fields: Record<string, unknown>
  is_active: boolean
  installations: Installation[]
}

interface ComplianceRecord {
  id: string
  name: string
  vendor: string
  seat_count: number
  seats_used: number
  is_compliant: boolean
  overage: number
}

interface PaginatedLicenses {
  count: number
  results: SoftwareLicense[]
}

interface HardwareOption {
  id: string
  asset_tag: string
  name: string
}

interface LicenseEvent {
  id: string
  event_type: string
  event_type_display: string
  description: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  actor_email: string
  created_at: string
}

interface AssignedUser {
  user_id: string | null
  user_name: string
  user_email: string
  asset_tag: string
  asset_name: string
  installed_on: string | null
}

interface SeatRequest {
  id: string
  license: string
  license_name: string
  requested_by_name: string
  seats_requested: number
  justification: string
  status: string
  status_display: string
  review_notes: string
  created_at: string
  updated_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LICENSE_TYPE_LABELS: Record<string, string> = {
  perpetual: 'Perpetual',
  subscription: 'Subscription',
  oem: 'OEM',
  freeware: 'Freeware',
  open_source: 'Open Source',
}

const LICENSE_TYPE_OPTIONS = Object.entries(LICENSE_TYPE_LABELS).map(([value, label]) => ({ value, label }))

const PAGE_SIZE = 25

// ── Helpers ───────────────────────────────────────────────────────────────────

function expiryColor(days: number | null): string {
  if (days === null) return '#595959'
  if (days < 0) return '#ff4d4f'
  if (days <= 30) return '#fa8c16'
  return '#52c41a'
}

function expiryLabel(days: number | null, expiry_date: string | null): string {
  if (!expiry_date) return 'No Expiry'
  if (days === null) return dayjs(expiry_date).format('DD MMM YYYY')
  if (days < 0) return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  return `${dayjs(expiry_date).format('DD MMM YYYY')} (${days}d)`
}

function eventDot(eventType: string, oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null) {
  switch (eventType) {
    case 'license_created':
      return <FileAddOutlined style={{ color: '#1677ff' }} />
    case 'seat_count_changed': {
      const oldSeats = (oldValue?.seat_count as number) ?? 0
      const newSeats = (newValue?.seat_count as number) ?? 0
      return newSeats >= oldSeats
        ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
        : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    }
    case 'expiry_renewed':
      return <CalendarOutlined style={{ color: '#52c41a' }} />
    case 'expiry_changed':
      return <CalendarOutlined style={{ color: '#fa8c16' }} />
    case 'installation_added':
      return <LaptopOutlined style={{ color: '#1677ff' }} />
    case 'installation_removed':
      return <LaptopOutlined style={{ color: '#ff4d4f' }} />
    case 'seat_requested':
      return <BellOutlined style={{ color: '#faad14' }} />
    case 'status_changed':
      return <SwapOutlined style={{ color: '#722ed1' }} />
    default:
      return undefined
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SoftwareList() {
  const user = useAuthStore(s => s.user)
  const isAgent = ['it_agent', 'it_manager', 'super_admin'].includes(user?.role_name ?? '')
  const isManager = ['it_manager', 'super_admin'].includes(user?.role_name ?? '')

  // List state
  const [licenses, setLicenses] = useState<SoftwareLicense[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  // Compliance state
  const [compliance, setCompliance] = useState<ComplianceRecord[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)

  // Seat requests state
  const [seatRequests, setSeatRequests] = useState<SeatRequest[]>([])
  const [seatRequestsLoading, setSeatRequestsLoading] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState('all')

  // Add License modal
  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addForm] = Form.useForm()

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedLicense, setSelectedLicense] = useState<SoftwareLicense | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [drawerTab, setDrawerTab] = useState('details')

  // Timeline
  const [timeline, setTimeline] = useState<LicenseEvent[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  // Assigned users
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([])
  const [assignedUsersLoading, setAssignedUsersLoading] = useState(false)

  // Installation form (inside drawer)
  const [installForm] = Form.useForm()
  const [installLoading, setInstallLoading] = useState(false)
  const [hwSearch, setHwSearch] = useState('')
  const [hwOptions, setHwOptions] = useState<HardwareOption[]>([])
  const [hwSearchLoading, setHwSearchLoading] = useState(false)
  const [removeLoadingId, setRemoveLoadingId] = useState<string>('')

  // Request Seats modal
  const [seatReqOpen, setSeatReqOpen] = useState(false)
  const [seatReqLoading, setSeatReqLoading] = useState(false)
  const [seatReqForm] = Form.useForm()

  // Approve/Reject modal
  const [approveModal, setApproveModal] = useState<{ open: boolean; record: SeatRequest | null; approve: boolean }>({
    open: false,
    record: null,
    approve: true,
  })
  const [approveLoading, setApproveLoading] = useState(false)
  const [approveForm] = Form.useForm()

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchLicenses = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<PaginatedLicenses>('/software/licenses/', {
        params: { page, page_size: PAGE_SIZE },
      })
      setLicenses(data.results)
      setTotal(data.count)
    } catch {
      message.error('Failed to load software licenses.')
    } finally {
      setLoading(false)
    }
  }, [page])

  const fetchCompliance = useCallback(async () => {
    setComplianceLoading(true)
    try {
      const { data } = await client.get<ComplianceRecord[]>('/software/licenses/compliance/')
      setCompliance(Array.isArray(data) ? data : [])
    } catch {
      message.error('Failed to load compliance data.')
    } finally {
      setComplianceLoading(false)
    }
  }, [])

  const fetchSeatRequests = useCallback(async () => {
    setSeatRequestsLoading(true)
    try {
      const { data } = await client.get<SeatRequest[] | { results: SeatRequest[] }>('/software/seat-requests/')
      const results = Array.isArray(data) ? data : (data as { results: SeatRequest[] }).results
      setSeatRequests(results)
    } catch {
      message.error('Failed to load seat requests.')
    } finally {
      setSeatRequestsLoading(false)
    }
  }, [])

  const fetchTimeline = useCallback(async (licenseId: string) => {
    setTimelineLoading(true)
    try {
      const { data } = await client.get<LicenseEvent[] | { results: LicenseEvent[] }>(
        `/software/licenses/${licenseId}/timeline/`,
      )
      const results = Array.isArray(data) ? data : (data as { results: LicenseEvent[] }).results
      setTimeline(results)
    } catch {
      message.error('Failed to load timeline.')
    } finally {
      setTimelineLoading(false)
    }
  }, [])

  const fetchAssignedUsers = useCallback(async (licenseId: string) => {
    setAssignedUsersLoading(true)
    try {
      const { data } = await client.get<AssignedUser[]>(`/software/licenses/${licenseId}/assigned-users/`)
      setAssignedUsers(Array.isArray(data) ? data : [])
    } catch {
      message.error('Failed to load assigned users.')
    } finally {
      setAssignedUsersLoading(false)
    }
  }, [])

  useEffect(() => { fetchLicenses() }, [fetchLicenses])

  useEffect(() => {
    if (activeTab === 'compliance') fetchCompliance()
    if (activeTab === 'seat_requests') fetchSeatRequests()
  }, [activeTab, fetchCompliance, fetchSeatRequests])

  // Load tab-specific data when drawer tab changes
  useEffect(() => {
    if (!selectedLicense) return
    if (drawerTab === 'timeline') fetchTimeline(selectedLicense.id)
    if (drawerTab === 'assigned_users') fetchAssignedUsers(selectedLicense.id)
  }, [drawerTab, selectedLicense, fetchTimeline, fetchAssignedUsers])

  // Hardware asset search for install form
  useEffect(() => {
    if (!hwSearch.trim()) { setHwOptions([]); return }
    const t = setTimeout(async () => {
      setHwSearchLoading(true)
      try {
        const { data } = await client.get<{ results: HardwareOption[] } | HardwareOption[]>(
          '/assets/hardware/',
          { params: { search: hwSearch, page_size: 20 } },
        )
        const results = Array.isArray(data) ? data : (data as { results: HardwareOption[] }).results
        setHwOptions(results)
      } catch {
        setHwOptions([])
      } finally {
        setHwSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [hwSearch])

  // ── Drawer open ────────────────────────────────────────────────────────────

  const openDrawer = async (record: SoftwareLicense) => {
    setDrawerOpen(true)
    setDrawerTab('details')
    setTimeline([])
    setAssignedUsers([])
    setDetailLoading(true)
    try {
      const { data } = await client.get<SoftwareLicense>(`/software/licenses/${record.id}/`)
      setSelectedLicense(data)
    } catch {
      message.error('Failed to load license details.')
      setSelectedLicense(record)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setSelectedLicense(null)
    setTimeline([])
    setAssignedUsers([])
    installForm.resetFields()
    setHwSearch('')
    setDrawerTab('details')
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAddLicense = async (values: Record<string, unknown>) => {
    setAddLoading(true)
    try {
      const payload: Record<string, unknown> = { ...values }
      if (values.purchase_date) payload.purchase_date = dayjs(values.purchase_date as string).format('YYYY-MM-DD')
      if (values.expiry_date) payload.expiry_date = dayjs(values.expiry_date as string).format('YYYY-MM-DD')
      else payload.expiry_date = null
      await client.post('/software/licenses/', payload)
      message.success('License created successfully.')
      setAddOpen(false)
      addForm.resetFields()
      fetchLicenses()
    } catch {
      message.error('Failed to create license.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleAddInstallation = async (values: Record<string, unknown>) => {
    if (!selectedLicense) return
    setInstallLoading(true)
    try {
      const payload: Record<string, unknown> = {
        hardware_asset: values.hardware_asset_id,
        notes: values.notes ?? '',
      }
      if (values.installed_on) payload.installed_on = dayjs(values.installed_on as string).format('YYYY-MM-DD')
      await client.post(`/software/licenses/${selectedLicense.id}/installations/`, payload)
      message.success('Installation recorded.')
      installForm.resetFields()
      setHwSearch('')
      const { data } = await client.get<SoftwareLicense>(`/software/licenses/${selectedLicense.id}/`)
      setSelectedLicense(data)
      fetchLicenses()
      // Refresh timeline if visible
      if (drawerTab === 'timeline') fetchTimeline(selectedLicense.id)
    } catch {
      message.error('Failed to add installation.')
    } finally {
      setInstallLoading(false)
    }
  }

  const handleRemoveInstallation = async (installId: string) => {
    setRemoveLoadingId(installId)
    try {
      await client.delete(`/software/installations/${installId}/`)
      message.success('Installation removed.')
      if (selectedLicense) {
        const { data } = await client.get<SoftwareLicense>(`/software/licenses/${selectedLicense.id}/`)
        setSelectedLicense(data)
        fetchLicenses()
        if (drawerTab === 'timeline') fetchTimeline(selectedLicense.id)
      }
    } catch {
      message.error('Failed to remove installation.')
    } finally {
      setRemoveLoadingId('')
    }
  }

  const handleRequestSeats = async (values: { seats_requested: number; justification: string }) => {
    if (!selectedLicense) return
    setSeatReqLoading(true)
    try {
      await client.post('/software/seat-requests/', {
        license: selectedLicense.id,
        seats_requested: values.seats_requested,
        justification: values.justification,
      })
      message.success('Seat request submitted successfully.')
      setSeatReqOpen(false)
      seatReqForm.resetFields()
      // Refresh timeline to show the seat_requested event
      fetchTimeline(selectedLicense.id)
    } catch {
      message.error('Failed to submit seat request.')
    } finally {
      setSeatReqLoading(false)
    }
  }

  const handleApproveReject = async (values: { notes: string }) => {
    if (!approveModal.record) return
    setApproveLoading(true)
    try {
      await client.post(`/software/seat-requests/${approveModal.record.id}/approve/`, {
        approve: approveModal.approve,
        notes: values.notes ?? '',
      })
      message.success(approveModal.approve ? 'Request approved.' : 'Request rejected.')
      setApproveModal({ open: false, record: null, approve: true })
      approveForm.resetFields()
      fetchSeatRequests()
      fetchLicenses()
    } catch {
      message.error('Failed to process request.')
    } finally {
      setApproveLoading(false)
    }
  }

  // ── Table columns ──────────────────────────────────────────────────────────

  const allColumns: ColumnsType<SoftwareLicense> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (val: string) => <Text strong>{val}</Text>,
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 140,
      ellipsis: true,
      render: (val: string) => val || <Text type="secondary">—</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'license_type',
      key: 'license_type',
      width: 120,
      render: (val: string) => <Tag>{LICENSE_TYPE_LABELS[val] ?? val}</Tag>,
    },
    {
      title: 'Seats',
      key: 'seats',
      width: 180,
      render: (_: unknown, record: SoftwareLicense) => {
        const pct = record.seat_count > 0 ? Math.min((record.seats_used / record.seat_count) * 100, 100) : 0
        const over = record.seats_used > record.seat_count
        return (
          <div style={{ minWidth: 140 }}>
            <div style={{ marginBottom: 2, fontSize: 12 }}>
              <span style={{ color: over ? '#ff4d4f' : undefined, fontWeight: over ? 600 : undefined }}>
                {record.seats_used}
              </span>
              <Text type="secondary"> / {record.seat_count}</Text>
              {over && <Tag color="red" style={{ marginLeft: 6, fontSize: 11 }}>Over</Tag>}
            </div>
            <Progress
              percent={Math.round(pct)}
              size="small"
              showInfo={false}
              strokeColor={over ? '#ff4d4f' : pct > 80 ? '#fa8c16' : '#52c41a'}
            />
          </div>
        )
      },
    },
    {
      title: 'Expiry',
      key: 'expiry',
      width: 200,
      render: (_: unknown, record: SoftwareLicense) => (
        <span style={{ color: expiryColor(record.days_until_expiry), fontWeight: 500 }}>
          {expiryLabel(record.days_until_expiry, record.expiry_date)}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (val: boolean) => (
        <Badge status={val ? 'success' : 'default'} text={val ? 'Active' : 'Inactive'} />
      ),
    },
  ]

  const complianceColumns: ColumnsType<ComplianceRecord> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (val: string) => <Text strong>{val}</Text>,
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 140,
      ellipsis: true,
    },
    {
      title: 'Licensed',
      dataIndex: 'seat_count',
      key: 'seat_count',
      width: 100,
      align: 'right' as const,
    },
    {
      title: 'Used',
      dataIndex: 'seats_used',
      key: 'seats_used',
      width: 100,
      align: 'right' as const,
      render: (val: number, record: ComplianceRecord) => (
        <span style={{ color: val > record.seat_count ? '#ff4d4f' : undefined, fontWeight: val > record.seat_count ? 600 : undefined }}>
          {val}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_compliant',
      key: 'is_compliant',
      width: 140,
      render: (val: boolean) => (
        <Tag color={val ? 'green' : 'red'}>{val ? 'Compliant' : 'Non-Compliant'}</Tag>
      ),
    },
    {
      title: 'Overage',
      dataIndex: 'overage',
      key: 'overage',
      width: 100,
      align: 'right' as const,
      render: (val: number) => (
        val > 0
          ? <Text type="danger">+{val}</Text>
          : <Text type="secondary">—</Text>
      ),
    },
  ]

  const seatRequestColumns: ColumnsType<SeatRequest> = [
    {
      title: 'License',
      dataIndex: 'license_name',
      key: 'license_name',
      ellipsis: true,
      render: (val: string) => <Text strong>{val}</Text>,
    },
    {
      title: 'Requested By',
      dataIndex: 'requested_by_name',
      key: 'requested_by_name',
      width: 160,
    },
    {
      title: 'Seats',
      dataIndex: 'seats_requested',
      key: 'seats_requested',
      width: 80,
      align: 'center' as const,
      render: (val: number) => <Tag color="blue">+{val}</Tag>,
    },
    {
      title: 'Justification',
      dataIndex: 'justification',
      key: 'justification',
      ellipsis: true,
      render: (val: string) => (
        <Tooltip title={val}>
          <Text style={{ maxWidth: 220, display: 'inline-block' }} ellipsis>{val}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (_: string, record: SeatRequest) => {
        const colors: Record<string, string> = { pending: 'gold', approved: 'green', rejected: 'red' }
        return <Tag color={colors[record.status] ?? 'default'}>{record.status_display}</Tag>
      },
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 130,
      render: (val: string) => (
        <Tooltip title={dayjs(val).format('DD MMM YYYY HH:mm')}>
          {dayjs(val).fromNow()}
        </Tooltip>
      ),
    },
    ...(isManager
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 160,
            render: (_: unknown, record: SeatRequest) => {
              if (record.status !== 'pending') return <Text type="secondary">—</Text>
              return (
                <Space size={8}>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => setApproveModal({ open: true, record, approve: true })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={() => setApproveModal({ open: true, record, approve: false })}
                  >
                    Reject
                  </Button>
                </Space>
              )
            },
          },
        ]
      : []),
  ]

  const assignedUsersColumns: ColumnsType<AssignedUser> = [
    {
      title: 'User',
      dataIndex: 'user_name',
      key: 'user_name',
      render: (val: string) => <Text>{val}</Text>,
    },
    {
      title: 'Email',
      dataIndex: 'user_email',
      key: 'user_email',
      ellipsis: true,
      render: (val: string) => val || <Text type="secondary">—</Text>,
    },
    {
      title: 'Asset Tag',
      dataIndex: 'asset_tag',
      key: 'asset_tag',
      width: 120,
      render: (val: string) => <Tag style={{ fontFamily: 'monospace', fontSize: 11 }}>{val}</Tag>,
    },
    {
      title: 'Asset Name',
      dataIndex: 'asset_name',
      key: 'asset_name',
      ellipsis: true,
    },
    {
      title: 'Installed On',
      dataIndex: 'installed_on',
      key: 'installed_on',
      width: 120,
      render: (val: string | null) =>
        val ? dayjs(val).format('DD MMM YYYY') : <Text type="secondary">—</Text>,
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Software Licenses</Title>
        {isAgent && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Add License
          </Button>
        )}
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'all',
            label: 'All Licenses',
            children: (
              <Table<SoftwareLicense>
                rowKey="id"
                columns={allColumns}
                dataSource={licenses}
                loading={loading}
                pagination={{
                  current: page,
                  pageSize: PAGE_SIZE,
                  total,
                  showSizeChanger: false,
                  showTotal: (t: number) => `${t} license${t !== 1 ? 's' : ''}`,
                  onChange: (p: number) => setPage(p),
                }}
                onRow={record => ({
                  onClick: () => openDrawer(record),
                  style: { cursor: 'pointer' },
                })}
                size="middle"
                scroll={{ x: 900 }}
              />
            ),
          },
          {
            key: 'compliance',
            label: 'Compliance',
            children: (
              <Table<ComplianceRecord>
                rowKey="id"
                columns={complianceColumns}
                dataSource={compliance}
                loading={complianceLoading}
                pagination={false}
                size="middle"
                scroll={{ x: 700 }}
              />
            ),
          },
          {
            key: 'seat_requests',
            label: 'Seat Requests',
            children: (
              <Table<SeatRequest>
                rowKey="id"
                columns={seatRequestColumns}
                dataSource={seatRequests}
                loading={seatRequestsLoading}
                pagination={false}
                size="middle"
                scroll={{ x: 900 }}
              />
            ),
          },
        ]}
      />

      {/* ── Add License Modal ──────────────────────────────────────────────── */}
      <Modal
        title="Add Software License"
        open={addOpen}
        onCancel={() => { setAddOpen(false); addForm.resetFields() }}
        onOk={() => addForm.submit()}
        okText="Create License"
        confirmLoading={addLoading}
        width={620}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddLicense} style={{ marginTop: 8 }}>
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'License name is required.' }]}
          >
            <Input placeholder="e.g. Microsoft Office 365" />
          </Form.Item>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="Vendor" name="vendor" style={{ flex: 1, marginBottom: 16 }}>
              <Input placeholder="e.g. Microsoft" />
            </Form.Item>
            <Form.Item label="Version" name="version" style={{ flex: 1, marginBottom: 16 }}>
              <Input placeholder="e.g. 2024" />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="License Type" name="license_type" style={{ flex: 1, marginBottom: 16 }}>
              <Select placeholder="Select type" style={{ width: '100%' }}>
                {LICENSE_TYPE_OPTIONS.map(o => (
                  <Option key={o.value} value={o.value}>{o.label}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Seat Count" name="seat_count" style={{ flex: 1, marginBottom: 16 }}>
              <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 50" />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="Purchase Date" name="purchase_date" style={{ flex: 1, marginBottom: 16 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Expiry Date" name="expiry_date" style={{ flex: 1, marginBottom: 16 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item label="Purchase Cost" name="purchase_cost">
            <InputNumber prefix="₹" style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" />
          </Form.Item>

          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} placeholder="Optional notes…" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── License Detail Drawer ──────────────────────────────────────────── */}
      <Drawer
        title={
          selectedLicense ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
              <span>{selectedLicense.name}</span>
              {isAgent && (
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setSeatReqOpen(true)}
                >
                  Request Seats
                </Button>
              )}
            </div>
          ) : 'License Details'
        }
        open={drawerOpen}
        onClose={closeDrawer}
        width={620}
        destroyOnClose
      >
        {detailLoading && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Text type="secondary">Loading…</Text>
          </div>
        )}

        {!detailLoading && selectedLicense && (
          <Tabs
            activeKey={drawerTab}
            onChange={setDrawerTab}
            size="small"
            items={[
              // ── Details tab ───────────────────────────────────────────────
              {
                key: 'details',
                label: 'Details',
                children: (
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space wrap style={{ marginBottom: 8 }}>
                      <Tag>{LICENSE_TYPE_LABELS[selectedLicense.license_type] ?? selectedLicense.license_type}</Tag>
                      <Badge
                        status={selectedLicense.is_active ? 'success' : 'default'}
                        text={selectedLicense.is_active ? 'Active' : 'Inactive'}
                      />
                      <Tag color={selectedLicense.is_compliant ? 'green' : 'red'}>
                        {selectedLicense.is_compliant ? 'Compliant' : 'Non-Compliant'}
                      </Tag>
                    </Space>

                    <div>
                      <Text type="secondary">Vendor: </Text>
                      <Text>{selectedLicense.vendor || '—'}</Text>
                      {selectedLicense.version && (
                        <><Text type="secondary"> · Version: </Text><Text>{selectedLicense.version}</Text></>
                      )}
                    </div>

                    <div style={{ margin: '8px 0' }}>
                      <div style={{ marginBottom: 4 }}>
                        <Text type="secondary">Seat usage: </Text>
                        <Text
                          style={{
                            color: selectedLicense.seats_used > selectedLicense.seat_count ? '#ff4d4f' : undefined,
                            fontWeight: selectedLicense.seats_used > selectedLicense.seat_count ? 600 : undefined,
                          }}
                        >
                          {selectedLicense.seats_used}
                        </Text>
                        <Text type="secondary"> / {selectedLicense.seat_count}</Text>
                      </div>
                      <Progress
                        percent={
                          selectedLicense.seat_count > 0
                            ? Math.min(Math.round((selectedLicense.seats_used / selectedLicense.seat_count) * 100), 100)
                            : 0
                        }
                        size="small"
                        strokeColor={
                          selectedLicense.seats_used > selectedLicense.seat_count
                            ? '#ff4d4f'
                            : selectedLicense.seats_used / selectedLicense.seat_count > 0.8
                            ? '#fa8c16'
                            : '#52c41a'
                        }
                      />
                    </div>

                    <div>
                      <Text type="secondary">Expiry: </Text>
                      <span style={{ color: expiryColor(selectedLicense.days_until_expiry), fontWeight: 500 }}>
                        {expiryLabel(selectedLicense.days_until_expiry, selectedLicense.expiry_date)}
                      </span>
                    </div>

                    {selectedLicense.purchase_date && (
                      <div>
                        <Text type="secondary">Purchase date: </Text>
                        <Text>{dayjs(selectedLicense.purchase_date).format('DD MMM YYYY')}</Text>
                      </div>
                    )}

                    {selectedLicense.purchase_cost && (
                      <div>
                        <Text type="secondary">Cost: </Text>
                        <Text>
                          ₹{parseFloat(selectedLicense.purchase_cost).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </Text>
                      </div>
                    )}

                    {selectedLicense.notes && (
                      <div>
                        <Text type="secondary">Notes: </Text>
                        <Text>{selectedLicense.notes}</Text>
                      </div>
                    )}
                  </Space>
                ),
              },

              // ── Timeline tab ──────────────────────────────────────────────
              {
                key: 'timeline',
                label: 'Timeline',
                children: timelineLoading ? (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <Text type="secondary">Loading timeline…</Text>
                  </div>
                ) : timeline.length === 0 ? (
                  <Empty description="No events recorded." style={{ padding: 32 }} />
                ) : (
                  <Timeline
                    style={{ marginTop: 16 }}
                    items={timeline.map(evt => ({
                      key: evt.id,
                      dot: eventDot(evt.event_type, evt.old_value, evt.new_value),
                      children: (
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>{evt.event_type_display}</div>
                          <div style={{ color: '#595959', fontSize: 13, marginBottom: 2 }}>{evt.description}</div>
                          <Space size={12} style={{ fontSize: 12 }}>
                            {evt.actor_email && (
                              <Text type="secondary">by {evt.actor_email}</Text>
                            )}
                            <Tooltip title={dayjs(evt.created_at).format('DD MMM YYYY HH:mm:ss')}>
                              <Text type="secondary">{dayjs(evt.created_at).fromNow()}</Text>
                            </Tooltip>
                          </Space>
                        </div>
                      ),
                    }))}
                  />
                ),
              },

              // ── Assigned Users tab ────────────────────────────────────────
              {
                key: 'assigned_users',
                label: 'Assigned Users',
                children: assignedUsersLoading ? (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <Text type="secondary">Loading…</Text>
                  </div>
                ) : assignedUsers.length === 0 ? (
                  <Empty description="No assigned users." style={{ padding: 32 }} />
                ) : (
                  <Table<AssignedUser>
                    rowKey={r => `${r.asset_tag}-${r.user_id ?? 'unassigned'}`}
                    columns={assignedUsersColumns}
                    dataSource={assignedUsers}
                    pagination={false}
                    size="small"
                    scroll={{ x: 500 }}
                  />
                ),
              },

              // ── Installations tab ─────────────────────────────────────────
              {
                key: 'installations',
                label: `Installations (${selectedLicense.installations?.length ?? 0})`,
                children: (
                  <>
                    {selectedLicense.installations && selectedLicense.installations.length > 0 ? (
                      <List
                        size="small"
                        dataSource={selectedLicense.installations}
                        renderItem={(inst: Installation) => (
                          <List.Item
                            actions={
                              isAgent
                                ? [
                                    <Popconfirm
                                      key="remove"
                                      title="Remove this installation?"
                                      okText="Remove"
                                      okType="danger"
                                      onConfirm={() => handleRemoveInstallation(inst.id)}
                                    >
                                      <Button
                                        size="small"
                                        danger
                                        icon={<DeleteOutlined />}
                                        loading={removeLoadingId === inst.id}
                                      >
                                        Remove
                                      </Button>
                                    </Popconfirm>,
                                  ]
                                : []
                            }
                          >
                            <List.Item.Meta
                              title={
                                <Space size={6}>
                                  <Tag style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                    {inst.hardware_asset.asset_tag}
                                  </Tag>
                                  <span>{inst.hardware_asset.name}</span>
                                </Space>
                              }
                              description={
                                <Space size={8} wrap style={{ fontSize: 12 }}>
                                  {inst.installed_on && (
                                    <Tooltip title={dayjs(inst.installed_on).format('DD MMM YYYY')}>
                                      <Text type="secondary">
                                        Installed {dayjs(inst.installed_on).fromNow()}
                                      </Text>
                                    </Tooltip>
                                  )}
                                  {inst.installed_by && (
                                    <Text type="secondary">by {inst.installed_by.full_name}</Text>
                                  )}
                                  {inst.notes && <Text type="secondary">{inst.notes}</Text>}
                                </Space>
                              }
                            />
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                        No installations recorded.
                      </Text>
                    )}

                    {isAgent && (
                      <>
                        <Divider orientation="left" style={{ fontSize: 13 }}>
                          <Space size={4}>
                            <AppstoreAddOutlined />
                            Add Installation
                          </Space>
                        </Divider>

                        <Form
                          form={installForm}
                          layout="vertical"
                          onFinish={handleAddInstallation}
                          size="small"
                        >
                          <Form.Item
                            label="Hardware Asset"
                            name="hardware_asset_id"
                            rules={[{ required: true, message: 'Select a hardware asset.' }]}
                          >
                            <Select
                              showSearch
                              placeholder="Search hardware assets…"
                              filterOption={false}
                              onSearch={setHwSearch}
                              loading={hwSearchLoading}
                              notFoundContent={
                                hwSearch
                                  ? hwSearchLoading
                                    ? 'Searching…'
                                    : 'No assets found.'
                                  : 'Type to search.'
                              }
                            >
                              {hwOptions.map(hw => (
                                <Option key={hw.id} value={hw.id}>
                                  <Space size={6}>
                                    <Tag style={{ fontFamily: 'monospace', fontSize: 11 }}>{hw.asset_tag}</Tag>
                                    {hw.name}
                                  </Space>
                                </Option>
                              ))}
                            </Select>
                          </Form.Item>

                          <Form.Item label="Installed On" name="installed_on" style={{ marginBottom: 16 }}>
                            <DatePicker style={{ width: '100%' }} />
                          </Form.Item>

                          <Form.Item label="Notes" name="notes">
                            <Input.TextArea rows={2} placeholder="Optional notes…" />
                          </Form.Item>

                          <Form.Item>
                            <Button
                              type="primary"
                              htmlType="submit"
                              loading={installLoading}
                              icon={<PlusOutlined />}
                            >
                              Add Installation
                            </Button>
                          </Form.Item>
                        </Form>
                      </>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
      </Drawer>

      {/* ── Request Seats Modal ────────────────────────────────────────────── */}
      <Modal
        title={`Request Additional Seats — ${selectedLicense?.name ?? ''}`}
        open={seatReqOpen}
        onCancel={() => { setSeatReqOpen(false); seatReqForm.resetFields() }}
        onOk={() => seatReqForm.submit()}
        okText="Submit Request"
        confirmLoading={seatReqLoading}
        destroyOnClose
      >
        <Form
          form={seatReqForm}
          layout="vertical"
          onFinish={handleRequestSeats}
          style={{ marginTop: 8 }}
        >
          <Form.Item
            label="Seats Requested"
            name="seats_requested"
            rules={[{ required: true, message: 'Enter the number of seats required.' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 5" />
          </Form.Item>

          <Form.Item
            label="Justification"
            name="justification"
            rules={[{ required: true, message: 'Justification is required.' }]}
          >
            <Input.TextArea rows={4} placeholder="Explain why additional seats are required…" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Approve / Reject Modal ─────────────────────────────────────────── */}
      <Modal
        title={approveModal.approve ? 'Approve Seat Request' : 'Reject Seat Request'}
        open={approveModal.open}
        onCancel={() => { setApproveModal({ open: false, record: null, approve: true }); approveForm.resetFields() }}
        onOk={() => approveForm.submit()}
        okText={approveModal.approve ? 'Approve' : 'Reject'}
        okButtonProps={{ danger: !approveModal.approve }}
        confirmLoading={approveLoading}
        destroyOnClose
      >
        {approveModal.record && (
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">License: </Text>
            <Text strong>{approveModal.record.license_name}</Text>
            <br />
            <Text type="secondary">Seats requested: </Text>
            <Text strong>{approveModal.record.seats_requested}</Text>
            <br />
            <Text type="secondary">Justification: </Text>
            <Text>{approveModal.record.justification}</Text>
          </div>
        )}
        <Form form={approveForm} layout="vertical" onFinish={handleApproveReject}>
          <Form.Item label="Review Notes" name="notes">
            <Input.TextArea rows={3} placeholder="Optional notes for the requester…" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
