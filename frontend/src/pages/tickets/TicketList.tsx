import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Tag, Space, Input, Select, Typography, Badge, Tooltip,
  message, Modal, Alert, Tabs, Drawer, Form, Spin,
  InputNumber, DatePicker, Checkbox,
} from 'antd'
import {
  PlusOutlined, SearchOutlined, ExclamationCircleFilled, InboxOutlined,
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

// ── Types ────────────────────────────────────────────────────────────────────

interface TicketCategory {
  id: number
  name: string
}

export interface Ticket {
  id: string
  ticket_number: string
  subject: string
  status: 'open' | 'in_progress' | 'pending_info' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  source: 'portal' | 'email' | 'teams'
  category: TicketCategory | null
  requestor: string | null
  requestor_email: string | null
  requestor_name: string | null
  assignee: string | null
  assignee_email: string | null
  assignee_name: string | null
  sla_due_at: string | null
  sla_breached: boolean
  created_at: string
  updated_at: string
  is_archived: boolean
  archived_at: string | null
  archived_by_email: string | null
  archive_reason: string
}

interface PaginatedTickets {
  count: number
  results: Ticket[]
}

interface Category {
  id: number
  name: string
}

interface CreatedTicket {
  id: string
  ticket_number: string
  status: string
  subject: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Pending Info', value: 'pending_info' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
]

const PRIORITY_OPTIONS = [
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

const STATUS_COLORS: Record<string, string> = {
  open: 'blue',
  in_progress: 'orange',
  pending_info: 'gold',
  resolved: 'green',
  closed: 'default',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'blue',
  low: 'default',
}

const PAGE_SIZE = 25


// ── ArchiveModal ──────────────────────────────────────────────────────────────

interface ArchiveModalProps {
  open: boolean
  ticketNumber: string
  loading: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

function ArchiveModal({ open, ticketNumber, loading, onConfirm, onCancel }: ArchiveModalProps) {
  const [reason, setReason] = useState('')
  const reasonTrimmed = reason.trim()

  function handleOk() {
    if (reasonTrimmed.length < 10) {
      message.warning('Reason must be at least 10 characters.')
      return
    }
    onConfirm(reasonTrimmed)
  }

  function handleCancel() {
    setReason('')
    onCancel()
  }

  return (
    <Modal
      title={`Archive Ticket ${ticketNumber}`}
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
        message="This ticket will be hidden from all active views. You can restore it from the Archived tab."
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 8 }}>
        <Text strong>Reason for archiving</Text>
        <Text type="secondary" style={{ marginLeft: 4, fontSize: 12 }}>(min 10 characters)</Text>
      </div>
      <TextArea
        rows={4}
        placeholder="Enter reason for archiving this ticket…"
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
  ticket: Ticket | null
  loading: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

function UnarchiveModal({ open, ticket, loading, onConfirm, onCancel }: UnarchiveModalProps) {
  const [reason, setReason] = useState('')
  const reasonTrimmed = reason.trim()

  function handleOk() {
    if (reasonTrimmed.length < 10) {
      message.warning('Reason must be at least 10 characters.')
      return
    }
    onConfirm(reasonTrimmed)
  }

  function handleCancel() {
    setReason('')
    onCancel()
  }

  return (
    <Modal
      title="Restore Ticket from Archive"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="Restore"
      okButtonProps={{ loading }}
      cancelButtonProps={{ disabled: loading }}
      destroyOnClose
      afterClose={() => setReason('')}
    >
      {ticket && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <div>
              <div>
                <Text strong>Archived at: </Text>
                <Text>
                  {ticket.archived_at
                    ? dayjs(ticket.archived_at).format('DD MMM YYYY, HH:mm')
                    : '—'}
                </Text>
              </div>
              {ticket.archive_reason && (
                <div style={{ marginTop: 4 }}>
                  <Text strong>Archive reason: </Text>
                  <Text>{ticket.archive_reason}</Text>
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
        placeholder="Enter reason for restoring this ticket…"
        value={reason}
        onChange={e => setReason(e.target.value)}
        maxLength={500}
        showCount
      />
    </Modal>
  )
}

// ── CreateTicketDrawer ────────────────────────────────────────────────────────

// ── API response types ────────────────────────────────────────────────────────
interface Paginated<T> { count: number; results: T[] }

// Custom field as returned by GET /api/custom-fields/
interface FieldSchema {
  id: number
  name: string          // slug — used as payload key, e.g. "serial_number"
  label: string         // display label, e.g. "Serial Number"
  field_type: 'text' | 'textarea' | 'number' | 'date' | 'datetime' |
              'dropdown' | 'multi_select' | 'checkbox' | 'url' | 'email'
  options: string[]     // string[] for dropdown/multi_select
  placeholder: string
  help_text: string
  is_required: boolean
  is_active: boolean
}

// ── Custom field form item renderer ──────────────────────────────────────────

function FieldInput({ field }: { field: FieldSchema }) {
  switch (field.field_type) {
    case 'textarea':
      return <TextArea rows={3} placeholder={field.placeholder || field.label} />
    case 'number':
      return <InputNumber style={{ width: '100%' }} placeholder={field.placeholder} />
    case 'date':
      return <DatePicker style={{ width: '100%' }} />
    case 'datetime':
      return <DatePicker showTime style={{ width: '100%' }} />
    case 'dropdown':
      return (
        <Select placeholder={field.placeholder || `Select ${field.label}`} allowClear>
          {field.options.map(opt => <Option key={opt} value={opt}>{opt}</Option>)}
        </Select>
      )
    case 'multi_select':
      return (
        <Select mode="multiple" placeholder={field.placeholder || `Select ${field.label}`} allowClear>
          {field.options.map(opt => <Option key={opt} value={opt}>{opt}</Option>)}
        </Select>
      )
    case 'checkbox':
      return <Checkbox />
    case 'url':
      return <Input type="url" placeholder={field.placeholder || 'https://'} />
    case 'email':
      return <Input type="email" placeholder={field.placeholder || 'user@example.com'} />
    default:
      return <Input placeholder={field.placeholder || field.label} />
  }
}

// ── CreateTicketDrawer ────────────────────────────────────────────────────────

interface CreateTicketDrawerProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function CreateTicketDrawer({ open, onClose, onCreated }: CreateTicketDrawerProps) {
  const [form] = Form.useForm()
  const [categories, setCategories] = useState<Category[]>([])
  const [customFields, setCustomFields] = useState<FieldSchema[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [loadingCustomFields, setLoadingCustomFields] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)

  // ── Load categories once when drawer opens ────────────────────────────────
  useEffect(() => {
    if (!open) return
    setLoadingCategories(true)
    client.get<Paginated<Category>>('/categories/')
      .then(({ data }) => {
        // API returns paginated response {count, results:[]}
        const list = Array.isArray(data) ? data : (data.results ?? [])
        setCategories(list)
      })
      .catch(() => message.warning('Could not load categories. You can still submit without one.'))
      .finally(() => setLoadingCategories(false))
  }, [open])

  // ── Load custom fields when category changes ──────────────────────────────
  useEffect(() => {
    if (!open) return
    setLoadingCustomFields(true)
    setCustomFields([])
    // Clear previous custom field values from the form
    form.resetFields(['__cf__'])   // placeholder — actual reset below
    const params: Record<string, string | number> = { module: 'tickets', is_active: 1 }
    if (selectedCategoryId !== null) params.category_id = selectedCategoryId
    client.get<Paginated<FieldSchema>>('/custom-fields/', { params })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : (data.results ?? [])
        setCustomFields(list)
      })
      .catch(() => { /* silently ignore — custom fields are optional */ })
      .finally(() => setLoadingCustomFields(false))
  }, [selectedCategoryId, open, form])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleCategoryChange(val: number | undefined) {
    setSelectedCategoryId(val ?? null)
    // Reset all custom field form values
    const resetValues: Record<string, undefined> = {}
    customFields.forEach(f => { resetValues[`cf__${f.name}`] = undefined })
    form.setFieldsValue(resetValues)
  }

  function handleClose() {
    form.resetFields()
    setSelectedCategoryId(null)
    setCustomFields([])
    setSubmitError(null)
    onClose()
  }

  async function handleFinish(values: Record<string, unknown>) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Build custom_fields dict: { fieldName: value }
      const custom_fields: Record<string, unknown> = {}
      customFields.forEach(f => {
        const val = values[`cf__${f.name}`]
        if (val !== undefined && val !== null && val !== '') {
          custom_fields[f.name] = val
        }
      })

      const payload = {
        subject:      (values.subject as string).trim(),
        description:  ((values.description as string | undefined) ?? '').trim(),
        priority:     (values.priority as string) ?? 'medium',
        category:     (values.category as number | undefined) ?? null,
        custom_fields,
      }

      const { data } = await client.post<CreatedTicket>('/tickets/', payload)

      if (!data?.id) {
        setSubmitError('Ticket created but the server did not return an ID. Check the ticket list.')
        return
      }

      message.success(`Ticket ${data.ticket_number} created successfully.`)
      handleClose()
      onCreated()

    } catch (err: unknown) {
      // Show the first validation error from the API if available
      const resp = (err as { response?: { data?: Record<string, string[]> } })?.response?.data
      if (resp && typeof resp === 'object') {
        const firstKey = Object.keys(resp)[0]
        const firstMsg = Array.isArray(resp[firstKey]) ? resp[firstKey][0] : String(resp[firstKey])
        setSubmitError(`${firstKey}: ${firstMsg}`)
      } else {
        setSubmitError('Failed to create ticket. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Drawer
      title="New Ticket"
      placement="right"
      width={580}
      open={open}
      onClose={handleClose}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button type="primary" loading={submitting} onClick={() => form.submit()}>
            Submit Ticket
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
        initialValues={{ priority: 'medium' }}
        requiredMark
        scrollToFirstError
      >
        {/* Subject */}
        <Form.Item
          label="Subject"
          name="subject"
          rules={[
            { required: true, message: 'Subject is required.' },
            { min: 5, message: 'Must be at least 5 characters.' },
          ]}
        >
          <Input
            placeholder="Brief summary of the issue"
            maxLength={500}
            showCount
            autoFocus
          />
        </Form.Item>

        {/* Category */}
        <Form.Item label="Category" name="category">
          <Select
            placeholder="Select a category (optional)"
            loading={loadingCategories}
            allowClear
            onChange={(val) => handleCategoryChange(val as number | undefined)}
            showSearch
            filterOption={(input, opt) =>
              String(opt?.children ?? '').toLowerCase().includes(input.toLowerCase())
            }
          >
            {categories.map(c => (
              <Option key={c.id} value={c.id}>{c.name}</Option>
            ))}
          </Select>
        </Form.Item>

        {/* Priority */}
        <Form.Item label="Priority" name="priority" rules={[{ required: true }]}>
          <Select>
            <Option value="low">Low</Option>
            <Option value="medium">Medium</Option>
            <Option value="high">High</Option>
            <Option value="critical">Critical</Option>
          </Select>
        </Form.Item>

        {/* Description */}
        <Form.Item label="Description" name="description">
          <TextArea
            rows={5}
            placeholder="Describe the issue in detail…"
            maxLength={5000}
            showCount
          />
        </Form.Item>

        {/* Dynamic custom fields */}
        {loadingCustomFields && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Spin size="small" tip="Loading fields…" />
          </div>
        )}

        {!loadingCustomFields && customFields.length > 0 && (
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, color: '#333' }}>
              Additional Fields
            </div>
            {customFields.map(field => (
              <Form.Item
                key={field.id}
                label={field.label}
                name={`cf__${field.name}`}
                tooltip={field.help_text || undefined}
                valuePropName={field.field_type === 'checkbox' ? 'checked' : 'value'}
                rules={
                  field.is_required
                    ? [{ required: true, message: `${field.label} is required.` }]
                    : undefined
                }
              >
                <FieldInput field={field} />
              </Form.Item>
            ))}
          </div>
        )}
      </Form>
    </Drawer>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TicketList() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const isRequestor = user?.role_name === 'requestor'
  const isAgent = ['it_agent', 'it_manager', 'super_admin'].includes(user?.role_name ?? '')

  // Active tab
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')

  // Active tickets state
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  // Archived tickets state
  const [archivedTickets, setArchivedTickets] = useState<Ticket[]>([])
  const [archivedTotal, setArchivedTotal] = useState(0)
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [archivedPage, setArchivedPage] = useState(1)

  // Filters (active tab)
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [searchRaw, setSearchRaw] = useState('')
  const [search, setSearch] = useState('')

  // Archive modal
  const [archiveTarget, setArchiveTarget] = useState<Ticket | null>(null)
  const [archiveLoading, setArchiveLoading] = useState(false)

  // Unarchive modal
  const [unarchiveTarget, setUnarchiveTarget] = useState<Ticket | null>(null)
  const [unarchiveLoading, setUnarchiveLoading] = useState(false)

  // Create ticket drawer
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchRaw), 300)
    return () => clearTimeout(timer)
  }, [searchRaw])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [statusFilter, priorityFilter, search])

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
      }
      if (statusFilter.length) params.status = statusFilter.join(',')
      if (priorityFilter.length) params.priority = priorityFilter.join(',')
      if (search) params.search = search

      const { data } = await client.get<PaginatedTickets>('/tickets/', { params })
      setTickets(data.results)
      setTotal(data.count)
    } catch {
      message.error('Failed to load tickets.')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, priorityFilter, search])

  const fetchArchivedTickets = useCallback(async () => {
    setArchivedLoading(true)
    try {
      const { data } = await client.get<PaginatedTickets>('/tickets/archived/', {
        params: { page: archivedPage, page_size: PAGE_SIZE },
      })
      setArchivedTickets(data.results)
      setArchivedTotal(data.count)
    } catch {
      message.error('Failed to load archived tickets.')
    } finally {
      setArchivedLoading(false)
    }
  }, [archivedPage])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  useEffect(() => {
    if (activeTab === 'archived') {
      fetchArchivedTickets()
    }
  }, [activeTab, fetchArchivedTickets])

  // ── Archive handlers ─────────────────────────────────────────────────────────

  async function handleArchiveConfirm(reason: string) {
    if (!archiveTarget) return
    setArchiveLoading(true)
    try {
      await client.post(`/tickets/${archiveTarget.id}/archive/`, { reason })
      message.success(`Ticket ${archiveTarget.ticket_number} archived.`)
      setArchiveTarget(null)
      fetchTickets()
      fetchArchivedTickets()
    } catch {
      message.error('Failed to archive ticket.')
    } finally {
      setArchiveLoading(false)
    }
  }

  async function handleUnarchiveConfirm(reason: string) {
    if (!unarchiveTarget) return
    setUnarchiveLoading(true)
    try {
      await client.post(`/tickets/${unarchiveTarget.id}/unarchive/`, { reason })
      message.success(`Ticket ${unarchiveTarget.ticket_number} restored.`)
      setUnarchiveTarget(null)
      fetchArchivedTickets()
    } catch {
      message.error('Failed to restore ticket.')
    } finally {
      setUnarchiveLoading(false)
    }
  }

  // ── Active tab columns ────────────────────────────────────────────────────────

  const activeColumns: ColumnsType<Ticket> = [
    {
      title: 'Ticket #',
      dataIndex: 'ticket_number',
      key: 'ticket_number',
      width: 130,
      render: (val: string) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{val}</span>
      ),
    },
    {
      title: 'Subject',
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
      render: (val: string, record: Ticket) => (
        <a
          onClick={e => { e.stopPropagation(); navigate(`/tickets/${record.id}`) }}
          style={{ fontWeight: 500 }}
        >
          {val}
        </a>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (val: string) => (
        <Tag color={STATUS_COLORS[val] ?? 'default'}>
          {val.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </Tag>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 110,
      render: (val: string) => (
        <Tag color={PRIORITY_COLORS[val] ?? 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Category',
      key: 'category',
      width: 140,
      render: (_: unknown, record: Ticket) => record.category?.name ?? '—',
    },
    {
      title: 'Requestor',
      key: 'requestor',
      width: 160,
      ellipsis: true,
      render: (_: unknown, record: Ticket) => record.requestor_name || record.requestor_email || '—',
    },
    ...(!isRequestor
      ? [{
          title: 'Assignee',
          key: 'assignee',
          width: 160,
          ellipsis: true,
          render: (_: unknown, record: Ticket) =>
            record.assignee_name || record.assignee_email
              ? record.assignee_name || record.assignee_email
              : <span style={{ color: '#bbb' }}>Unassigned</span>,
        } as ColumnsType<Ticket>[number]]
      : []),
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
      title: 'SLA',
      key: 'sla',
      width: 90,
      render: (_: unknown, record: Ticket) => {
        if (!record.sla_due_at) return <span style={{ color: '#bbb' }}>—</span>
        if (record.sla_breached) {
          return (
            <Tooltip title={`Due: ${dayjs(record.sla_due_at).format('DD MMM YYYY, HH:mm')}`}>
              <Badge status="error" text={<span style={{ color: '#ff4d4f', fontSize: 12 }}>Breached</span>} />
            </Tooltip>
          )
        }
        return (
          <Tooltip title={`Due: ${dayjs(record.sla_due_at).format('DD MMM YYYY, HH:mm')}`}>
            <Badge status="success" text={<span style={{ fontSize: 12 }}>{dayjs(record.sla_due_at).fromNow()}</span>} />
          </Tooltip>
        )
      },
    },
    ...(isAgent
      ? [{
          title: 'Actions',
          key: 'actions',
          width: 100,
          render: (_: unknown, record: Ticket) => (
            <Button
              size="small"
              icon={<InboxOutlined />}
              danger
              onClick={e => { e.stopPropagation(); setArchiveTarget(record) }}
            >
              Archive
            </Button>
          ),
        } as ColumnsType<Ticket>[number]]
      : []),
  ]

  // ── Archived tab columns ──────────────────────────────────────────────────────

  const archivedColumns: ColumnsType<Ticket> = [
    {
      title: 'Ticket #',
      dataIndex: 'ticket_number',
      key: 'ticket_number',
      width: 130,
      render: (val: string) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{val}</span>
      ),
    },
    {
      title: 'Subject',
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
      render: (val: string, record: Ticket) => (
        <a
          onClick={e => { e.stopPropagation(); navigate(`/tickets/${record.id}`) }}
          style={{ fontWeight: 500 }}
        >
          {val}
        </a>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (val: string) => (
        <Tag color={STATUS_COLORS[val] ?? 'default'}>
          {val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </Tag>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 110,
      render: (val: string) => (
        <Tag color={PRIORITY_COLORS[val] ?? 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Requestor',
      key: 'requestor',
      width: 160,
      ellipsis: true,
      render: (_: unknown, record: Ticket) => record.requestor_name || record.requestor_email || '—',
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
      render: (_: unknown, record: Ticket) => (
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
    showTotal: (t: number) => `${t} ticket${t !== 1 ? 's' : ''}`,
    onChange: (p: number) => setPage(p),
  }

  const archivedPagination: TablePaginationConfig = {
    current: archivedPage,
    pageSize: PAGE_SIZE,
    total: archivedTotal,
    showSizeChanger: false,
    showTotal: (t: number) => `${t} archived ticket${t !== 1 ? 's' : ''}`,
    onChange: (p: number) => setArchivedPage(p),
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Tickets</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setDrawerOpen(true)}
        >
          New Ticket
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key as 'active' | 'archived')}
        items={[
          {
            key: 'active',
            label: 'Active Tickets',
            children: (
              <>
                {/* Filter bar */}
                <Space wrap style={{ marginBottom: 16 }}>
                  <Input
                    placeholder="Search tickets…"
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
                    placeholder="Filter by priority"
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    style={{ minWidth: 200 }}
                    maxTagCount="responsive"
                    allowClear
                  >
                    {PRIORITY_OPTIONS.map(o => (
                      <Option key={o.value} value={o.value}>{o.label}</Option>
                    ))}
                  </Select>
                  {(statusFilter.length > 0 || priorityFilter.length > 0 || search) && (
                    <Button
                      size="small"
                      onClick={() => { setStatusFilter([]); setPriorityFilter([]); setSearchRaw('') }}
                    >
                      Clear filters
                    </Button>
                  )}
                </Space>

                <Table<Ticket>
                  rowKey="id"
                  columns={activeColumns}
                  dataSource={tickets}
                  loading={loading}
                  pagination={activePagination}
                  onRow={record => ({
                    onClick: () => navigate(`/tickets/${record.id}`),
                    style: { cursor: 'pointer' },
                  })}
                  size="middle"
                  scroll={{ x: 900 }}
                />
              </>
            ),
          },
          {
            key: 'archived',
            label: (
              <span>
                <InboxOutlined style={{ marginRight: 6 }} />
                Archived
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
              <Table<Ticket>
                rowKey="id"
                columns={archivedColumns}
                dataSource={archivedTickets}
                loading={archivedLoading}
                pagination={archivedPagination}
                onRow={record => ({
                  onClick: () => navigate(`/tickets/${record.id}`),
                  style: { cursor: 'pointer' },
                })}
                size="middle"
                scroll={{ x: 1000 }}
              />
            ),
          },
        ]}
      />

      {/* Create Ticket Drawer */}
      <CreateTicketDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={fetchTickets}
      />

      {/* Archive Modal */}
      <ArchiveModal
        open={archiveTarget !== null}
        ticketNumber={archiveTarget?.ticket_number ?? ''}
        loading={archiveLoading}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setArchiveTarget(null)}
      />

      {/* Unarchive Modal */}
      <UnarchiveModal
        open={unarchiveTarget !== null}
        ticket={unarchiveTarget}
        loading={unarchiveLoading}
        onConfirm={handleUnarchiveConfirm}
        onCancel={() => setUnarchiveTarget(null)}
      />
    </div>
  )
}

export { ExclamationCircleFilled }
