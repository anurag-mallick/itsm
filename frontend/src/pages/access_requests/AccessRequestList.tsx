import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Tag, Space, Select, Typography, Tooltip, message,
  Drawer, Form, Input, Radio, Alert, Tabs, Badge,
} from 'antd'
import {
  PlusOutlined,
  DesktopOutlined,
  CodeOutlined,
  EyeOutlined,
  CheckSquareOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import client from '../../api/client'
import { useAuthStore } from '../../store/auth'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccessRequest {
  id: string
  ref_number: string
  request_type: 'hardware' | 'software'
  type_display: string
  status: 'pending_manager' | 'manager_approved' | 'manager_rejected' |
          'pending_assignment' | 'assigned' | 'cancelled'
  status_display: string
  requested_by_name: string
  requested_by_email: string
  manager_email: string
  manager_name: string
  justification: string
  hardware_type: string
  hardware_specification: string
  software_name: string
  hardware_asset_tag: string | null
  software_license_name: string | null
  manager_notes: string
  assignment_notes: string
  created_at: string
  approved_at: string | null
  assigned_at: string | null
}

interface PaginatedAR {
  count: number
  results: AccessRequest[]
}

interface HardwareAsset {
  id: string
  asset_tag: string
  name: string
  location?: string
  site_name?: string
}

interface SoftwareLicense {
  id: string
  name: string
  seats_available: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending_manager: 'gold',
  manager_approved: 'blue',
  manager_rejected: 'red',
  pending_assignment: 'orange',
  assigned: 'green',
  cancelled: 'default',
}

const STATUS_OPTIONS = [
  { label: 'Pending Manager', value: 'pending_manager' },
  { label: 'Manager Approved', value: 'manager_approved' },
  { label: 'Manager Rejected', value: 'manager_rejected' },
  { label: 'Pending Assignment', value: 'pending_assignment' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'Cancelled', value: 'cancelled' },
]

const TYPE_OPTIONS = [
  { label: 'Hardware', value: 'hardware' },
  { label: 'Software', value: 'software' },
]

const HARDWARE_TYPE_OPTIONS = [
  'Laptop', 'Desktop', 'Server', 'Phone', 'Tablet', 'Other',
]

const PAGE_SIZE = 25

// ── AssignDrawer ───────────────────────────────────────────────────────────────

interface AssignDrawerProps {
  open: boolean
  request: AccessRequest | null
  onClose: () => void
  onAssigned: () => void
}

function AssignDrawer({ open, request, onClose, onAssigned }: AssignDrawerProps) {
  const [form] = Form.useForm()
  const [hardwareAssets, setHardwareAssets] = useState<HardwareAsset[]>([])
  const [softwareLicenses, setSoftwareLicenses] = useState<SoftwareLicense[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !request) return
    form.resetFields()
    setSubmitError(null)
    setHardwareAssets([])
    setSoftwareLicenses([])

    if (request.request_type === 'hardware') {
      setLoadingAssets(true)
      client.get<{ results: HardwareAsset[] }>('/assets/hardware/', {
        params: { status: 'active', is_archived: false, page_size: 100 },
      })
        .then(({ data }) => setHardwareAssets(data.results ?? []))
        .catch(() => message.warning('Could not load hardware assets.'))
        .finally(() => setLoadingAssets(false))
    } else {
      setLoadingAssets(true)
      client.get<{ results: SoftwareLicense[] }>('/software/licenses/', {
        params: { is_active: true, page_size: 100 },
      })
        .then(({ data }) => setSoftwareLicenses(data.results ?? []))
        .catch(() => message.warning('Could not load software licenses.'))
        .finally(() => setLoadingAssets(false))
    }
  }, [open, request, form])

  function handleClose() {
    form.resetFields()
    setSubmitError(null)
    onClose()
  }

  async function handleFinish(values: Record<string, unknown>) {
    if (!request) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload: Record<string, unknown> = {
        assignment_notes: values.assignment_notes ?? '',
      }
      if (request.request_type === 'hardware') {
        payload.hardware_asset_id = values.hardware_asset_id
      } else {
        payload.software_license_id = values.software_license_id
      }
      await client.post(`/access-requests/${request.id}/assign/`, payload)
      message.success('Assignment complete. Requestor has been notified.')
      handleClose()
      onAssigned()
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: Record<string, unknown> } })?.response?.data
      if (resp && typeof resp === 'object') {
        const detail = (resp as { detail?: string }).detail
        if (detail) {
          setSubmitError(detail)
        } else {
          const firstKey = Object.keys(resp)[0]
          const raw = (resp as Record<string, unknown>)[firstKey]
          const firstMsg = Array.isArray(raw) ? String(raw[0]) : String(raw)
          setSubmitError(`${firstKey}: ${firstMsg}`)
        }
      } else {
        setSubmitError('Failed to assign request. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const noHardwareAssets = !loadingAssets && request?.request_type === 'hardware' && hardwareAssets.length === 0
  const noLicenses = !loadingAssets && request?.request_type === 'software' && softwareLicenses.length === 0

  return (
    <Drawer
      title={`Assign Request — ${request?.ref_number ?? ''}`}
      placement="right"
      width={600}
      open={open}
      onClose={handleClose}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            Confirm Assignment
          </Button>
        </div>
      }
    >
      {request && (
        <div
          style={{
            background: '#f5f5f5',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 20,
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary">Requested by </Text>
            <Text strong>{request.requested_by_name || request.requested_by_email}</Text>
          </div>
          {request.request_type === 'hardware' ? (
            <div>
              <Text type="secondary">Needs: </Text>
              <Text>{request.hardware_type}{request.hardware_specification ? ` — ${request.hardware_specification}` : ''}</Text>
            </div>
          ) : (
            <div>
              <Text type="secondary">Software: </Text>
              <Text>{request.software_name}</Text>
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            <Text type="secondary">Justification: </Text>
            <Text>{request.justification}</Text>
          </div>
        </div>
      )}

      {submitError && (
        <Alert
          type="error"
          message={submitError}
          showIcon
          closable
          onClose={() => setSubmitError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {noHardwareAssets && (
        <Alert
          type="warning"
          showIcon
          message="No active hardware assets available. Add assets first."
          style={{ marginBottom: 16 }}
        />
      )}

      {noLicenses && (
        <Alert
          type="warning"
          showIcon
          message="No active software licenses available. Add licenses first."
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        {request?.request_type === 'hardware' ? (
          <Form.Item
            label="Hardware Asset"
            name="hardware_asset_id"
            rules={[{ required: true, message: 'Please select a hardware asset.' }]}
          >
            <Select
              showSearch
              loading={loadingAssets}
              placeholder="Select an active hardware asset"
              filterOption={(input, opt) =>
                String(opt?.children ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {hardwareAssets.map(a => {
                const location = a.location || a.site_name
                return (
                  <Option key={a.id} value={a.id}>
                    {a.asset_tag} — {a.name}{location ? ` (${location})` : ''}
                  </Option>
                )
              })}
            </Select>
          </Form.Item>
        ) : (
          <Form.Item
            label="Software License"
            name="software_license_id"
            rules={[{ required: true, message: 'Please select a software license.' }]}
          >
            <Select
              loading={loadingAssets}
              placeholder="Select a software license"
            >
              {softwareLicenses.map(l => (
                <Option
                  key={l.id}
                  value={l.id}
                  disabled={l.seats_available <= 0}
                >
                  {l.name} — {l.seats_available} seat{l.seats_available !== 1 ? 's' : ''} available
                  {l.seats_available <= 0 ? ' (No seats available)' : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>
        )}

        <Form.Item label="Assignment Notes" name="assignment_notes">
          <TextArea
            rows={3}
            placeholder="Optional notes about this assignment"
            maxLength={1000}
            showCount
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

// ── CreateRequestDrawer ────────────────────────────────────────────────────────

interface CreateRequestDrawerProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function CreateRequestDrawer({ open, onClose, onCreated }: CreateRequestDrawerProps) {
  const [form] = Form.useForm()
  const [requestType, setRequestType] = useState<'hardware' | 'software'>('hardware')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    form.resetFields()
    setRequestType('hardware')
    setSubmitError(null)
  }, [open, form])

  function handleClose() {
    form.resetFields()
    setSubmitError(null)
    onClose()
  }

  async function handleFinish(values: Record<string, unknown>) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload: Record<string, unknown> = {
        request_type: values.request_type,
        justification: (values.justification as string).trim(),
        manager_email: (values.manager_email as string).trim(),
        manager_name: ((values.manager_name as string | undefined) ?? '').trim(),
        hardware_type: values.hardware_type ?? '',
        hardware_specification: ((values.hardware_specification as string | undefined) ?? '').trim(),
        software_name: ((values.software_name as string | undefined) ?? '').trim(),
      }
      await client.post('/access-requests/', payload)
      message.success('Access request submitted. Your manager will receive an approval email.')
      handleClose()
      onCreated()
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: Record<string, string[]> } })?.response?.data
      if (resp && typeof resp === 'object') {
        const firstKey = Object.keys(resp)[0]
        const firstMsg = Array.isArray(resp[firstKey]) ? resp[firstKey][0] : String(resp[firstKey])
        setSubmitError(`${firstKey}: ${firstMsg}`)
      } else {
        setSubmitError('Failed to submit request. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer
      title="New Access Request"
      placement="right"
      width={600}
      open={open}
      onClose={handleClose}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            Submit Request
          </Button>
        </div>
      }
    >
      {submitError && (
        <Alert
          type="error"
          message={submitError}
          showIcon
          closable
          onClose={() => setSubmitError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{ request_type: 'hardware' }}
        requiredMark
        scrollToFirstError
      >
        {/* Request Type */}
        <Form.Item
          label="Request Type"
          name="request_type"
          rules={[{ required: true }]}
        >
          <Radio.Group
            onChange={e => {
              setRequestType(e.target.value)
              form.resetFields(['hardware_type', 'hardware_specification', 'software_name'])
            }}
          >
            <Space direction="horizontal" size={12}>
              <Radio.Button
                value="hardware"
                style={{
                  height: 'auto',
                  padding: '12px 20px',
                  textAlign: 'center',
                  lineHeight: 1.4,
                }}
              >
                <div>
                  <DesktopOutlined style={{ fontSize: 22, display: 'block', marginBottom: 4 }} />
                  <div style={{ fontWeight: 600 }}>Hardware Assignment</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Laptop, desktop, phone, etc.</div>
                </div>
              </Radio.Button>
              <Radio.Button
                value="software"
                style={{
                  height: 'auto',
                  padding: '12px 20px',
                  textAlign: 'center',
                  lineHeight: 1.4,
                }}
              >
                <div>
                  <CodeOutlined style={{ fontSize: 22, display: 'block', marginBottom: 4 }} />
                  <div style={{ fontWeight: 600 }}>Software Access</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Application or license</div>
                </div>
              </Radio.Button>
            </Space>
          </Radio.Group>
        </Form.Item>

        {/* Manager */}
        <Form.Item
          label="Manager Email"
          name="manager_email"
          rules={[
            { required: true, message: 'Manager email is required.' },
            { type: 'email', message: 'Please enter a valid email address.' },
          ]}
        >
          <Input placeholder="manager@company.com" />
        </Form.Item>

        <Form.Item label="Manager Name" name="manager_name">
          <Input placeholder="Manager's full name (optional)" />
        </Form.Item>

        {/* Hardware fields */}
        {requestType === 'hardware' && (
          <>
            <Form.Item
              label="Asset Type"
              name="hardware_type"
              rules={[{ required: true, message: 'Please select an asset type.' }]}
            >
              <Select placeholder="Select hardware type">
                {HARDWARE_TYPE_OPTIONS.map(t => (
                  <Option key={t} value={t}>{t}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="Specification"
              name="hardware_specification"
              tooltip="Describe the specs or model you require"
            >
              <TextArea
                rows={3}
                placeholder="What specifications do you need? (e.g. 16GB RAM, i7 processor)"
                maxLength={500}
                showCount
              />
            </Form.Item>
          </>
        )}

        {/* Software fields */}
        {requestType === 'software' && (
          <Form.Item
            label="Software Name"
            name="software_name"
            rules={[{ required: true, message: 'Please specify the software.' }]}
          >
            <Input placeholder="What software do you need? (e.g. Adobe Photoshop, Jira)" />
          </Form.Item>
        )}

        {/* Justification */}
        <Form.Item
          label="Business Justification"
          name="justification"
          rules={[
            { required: true, message: 'Justification is required.' },
            { min: 20, message: 'Justification must be at least 20 characters.' },
          ]}
          tooltip="Business justification for this request"
        >
          <TextArea
            rows={4}
            placeholder="Explain why you need this resource and how it relates to your work"
            maxLength={2000}
            showCount
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AccessRequestList() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const role = user?.role_name ?? ''
  const isAgent = ['it_agent', 'it_manager', 'super_admin'].includes(role)

  // My Requests state
  const [myRequests, setMyRequests] = useState<AccessRequest[]>([])
  const [myTotal, setMyTotal] = useState(0)
  const [myLoading, setMyLoading] = useState(false)
  const [myPage, setMyPage] = useState(1)

  // All Requests state (agent/manager only)
  const [allRequests, setAllRequests] = useState<AccessRequest[]>([])
  const [allTotal, setAllTotal] = useState(0)
  const [allLoading, setAllLoading] = useState(false)
  const [allPage, setAllPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  // Pending assignment count — for the badge and alert
  const [pendingCount, setPendingCount] = useState(0)

  // Drawers
  const [createOpen, setCreateOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<AccessRequest | null>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState<'mine' | 'all'>('mine')

  const fetchMyRequests = useCallback(async () => {
    setMyLoading(true)
    try {
      const { data } = await client.get<PaginatedAR>('/access-requests/', {
        params: { page: myPage, page_size: PAGE_SIZE, my_requests: true },
      })
      setMyRequests(data.results)
      setMyTotal(data.count)
    } catch {
      message.error('Failed to load your requests.')
    } finally {
      setMyLoading(false)
    }
  }, [myPage])

  const fetchAllRequests = useCallback(async () => {
    setAllLoading(true)
    try {
      const params: Record<string, string | number> = { page: allPage, page_size: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.request_type = typeFilter
      const { data } = await client.get<PaginatedAR>('/access-requests/', { params })
      setAllRequests(data.results)
      setAllTotal(data.count)
    } catch {
      message.error('Failed to load requests.')
    } finally {
      setAllLoading(false)
    }
  }, [allPage, statusFilter, typeFilter])

  useEffect(() => { fetchMyRequests() }, [fetchMyRequests])

  useEffect(() => {
    if (isAgent && activeTab === 'all') fetchAllRequests()
  }, [isAgent, activeTab, fetchAllRequests])

  // Load pending count for badge — always fetch for agents on mount
  useEffect(() => {
    if (!isAgent) return
    client.get<PaginatedAR>('/access-requests/', { params: { status: 'pending_assignment', page_size: 1 } })
      .then(({ data }) => setPendingCount(data.count))
      .catch(() => {})
  }, [isAgent])

  // Reset page when filters change
  useEffect(() => { setAllPage(1) }, [statusFilter, typeFilter])

  // ── Column definitions ─────────────────────────────────────────────────────

  function buildColumns(showAssign: boolean): ColumnsType<AccessRequest> {
    return [
      {
        title: 'Ref #',
        dataIndex: 'ref_number',
        key: 'ref_number',
        width: 120,
        render: (val: string) => (
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{val}</span>
        ),
      },
      {
        title: 'Type',
        dataIndex: 'request_type',
        key: 'request_type',
        width: 120,
        render: (val: string, record: AccessRequest) => (
          <Tag color={val === 'hardware' ? 'geekblue' : 'purple'} icon={val === 'hardware' ? <DesktopOutlined /> : <CodeOutlined />}>
            {record.type_display}
          </Tag>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 170,
        render: (val: string, record: AccessRequest) => (
          <Tag color={STATUS_COLORS[val] ?? 'default'}>{record.status_display}</Tag>
        ),
      },
      {
        title: 'What is Needed',
        key: 'what',
        ellipsis: true,
        render: (_: unknown, record: AccessRequest) =>
          record.request_type === 'hardware'
            ? record.hardware_type || '—'
            : record.software_name || '—',
      },
      {
        title: 'Requested By',
        key: 'requested_by',
        width: 180,
        ellipsis: true,
        render: (_: unknown, record: AccessRequest) =>
          record.requested_by_name || record.requested_by_email || '—',
      },
      {
        title: 'Manager',
        key: 'manager',
        width: 180,
        ellipsis: true,
        render: (_: unknown, record: AccessRequest) =>
          record.manager_name || record.manager_email || '—',
      },
      {
        title: 'Created',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 130,
        render: (val: string) => (
          <Tooltip title={dayjs(val).format('DD MMM YYYY, HH:mm')}>
            {dayjs(val).fromNow()}
          </Tooltip>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: showAssign ? 160 : 90,
        render: (_: unknown, record: AccessRequest) => (
          <Space size={4}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={e => { e.stopPropagation(); navigate(`/access-requests/${record.id}`) }}
            >
              View
            </Button>
            {showAssign && record.status === 'pending_assignment' && (
              <Button
                size="small"
                type="primary"
                icon={<CheckSquareOutlined />}
                onClick={e => { e.stopPropagation(); setAssignTarget(record) }}
              >
                Assign
              </Button>
            )}
          </Space>
        ),
      },
    ]
  }

  const myPagination: TablePaginationConfig = {
    current: myPage,
    pageSize: PAGE_SIZE,
    total: myTotal,
    showSizeChanger: false,
    showTotal: (t: number) => `${t} request${t !== 1 ? 's' : ''}`,
    onChange: (p: number) => setMyPage(p),
  }

  const allPagination: TablePaginationConfig = {
    current: allPage,
    pageSize: PAGE_SIZE,
    total: allTotal,
    showSizeChanger: false,
    showTotal: (t: number) => `${t} request${t !== 1 ? 's' : ''}`,
    onChange: (p: number) => setAllPage(p),
  }

  const tabItems = [
    {
      key: 'mine',
      label: 'My Requests',
      children: (
        <Table<AccessRequest>
          rowKey="id"
          columns={buildColumns(false)}
          dataSource={myRequests}
          loading={myLoading}
          pagination={myPagination}
          onRow={record => ({
            onClick: () => navigate(`/access-requests/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          size="middle"
          scroll={{ x: 800 }}
        />
      ),
    },
    ...(isAgent
      ? [
          {
            key: 'all',
            label: (
              <span>
                All Requests
                {pendingCount > 0 && (
                  <Badge count={pendingCount} size="small"
                    style={{ marginLeft: 8, backgroundColor: '#fa8c16' }} />
                )}
              </span>
            ),
            children: (
              <>
                {/* ── Pending assignment alert for IT agents ── */}
                {pendingCount > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<ToolOutlined />}
                    style={{ marginBottom: 16 }}
                    message={
                      <Text strong>
                        {pendingCount} request{pendingCount !== 1 ? 's' : ''} pending IT assignment
                      </Text>
                    }
                    description={
                      <span>
                        These requests have been approved by their managers and are waiting for you to
                        assign a hardware asset or software license. Use the{' '}
                        <Tag color="blue" style={{ margin: 0 }}>Assign</Tag> button on each row,
                        or open the request to see full details.
                      </span>
                    }
                    action={
                      <Button size="small" type="primary"
                        onClick={() => setStatusFilter('pending_assignment')}>
                        Show only pending
                      </Button>
                    }
                  />
                )}
                <Space wrap style={{ marginBottom: 16 }}>
                  <Select
                    placeholder="Filter by status"
                    value={statusFilter || undefined}
                    onChange={(v: string | undefined) => setStatusFilter(v ?? '')}
                    style={{ width: 200 }}
                    allowClear
                  >
                    {STATUS_OPTIONS.map(o => (
                      <Option key={o.value} value={o.value}>{o.label}</Option>
                    ))}
                  </Select>
                  <Select
                    placeholder="Filter by type"
                    value={typeFilter || undefined}
                    onChange={(v: string | undefined) => setTypeFilter(v ?? '')}
                    style={{ width: 160 }}
                    allowClear
                  >
                    {TYPE_OPTIONS.map(o => (
                      <Option key={o.value} value={o.value}>{o.label}</Option>
                    ))}
                  </Select>
                  {(statusFilter || typeFilter) && (
                    <Button
                      size="small"
                      onClick={() => { setStatusFilter(''); setTypeFilter('') }}
                    >
                      Clear filters
                    </Button>
                  )}
                </Space>
                <Table<AccessRequest>
                  rowKey="id"
                  columns={buildColumns(true)}
                  dataSource={allRequests}
                  loading={allLoading}
                  pagination={allPagination}
                  onRow={record => ({
                    onClick: () => navigate(`/access-requests/${record.id}`),
                    style: { cursor: 'pointer' },
                  })}
                  size="middle"
                  scroll={{ x: 1000 }}
                />
              </>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Access Requests</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          New Request
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as 'mine' | 'all')}
        items={tabItems}
      />

      {/* Create drawer */}
      <CreateRequestDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchMyRequests}
      />

      {/* Assign drawer */}
      <AssignDrawer
        open={assignTarget !== null}
        request={assignTarget}
        onClose={() => setAssignTarget(null)}
        onAssigned={() => {
          setAssignTarget(null)
          fetchAllRequests()
          // Refresh pending count badge
          client.get<PaginatedAR>('/access-requests/', { params: { status: 'pending_assignment', page_size: 1 } })
            .then(({ data }) => setPendingCount(data.count)).catch(() => {})
          fetchMyRequests()
        }}
      />
    </div>
  )
}
