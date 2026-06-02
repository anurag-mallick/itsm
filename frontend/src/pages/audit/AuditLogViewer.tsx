import { useEffect, useState, useCallback } from 'react'
import {
  Typography,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Space,
  Tooltip,
  Modal,
  Alert,
  DatePicker,
  Row,
  Col,
  message,
} from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import client from '../../api/client'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string
  user_email: string
  action: string
  action_display: string
  module: string
  record_id: string
  record_repr: string
  field_name: string
  old_value: unknown
  new_value: unknown
  ip_address: string
  timestamp: string
}

interface PaginatedResponse {
  count: number
  results: AuditLogEntry[]
}

interface Filters {
  action: string[]
  module: string
  user_email: string
  date_from: string
  date_to: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

const ACTION_COLORS: Record<string, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  login: 'cyan',
  logout: 'default',
}

const ACTION_OPTIONS = [
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
  { label: 'Login', value: 'login' },
  { label: 'Logout', value: 'logout' },
]

const MODULE_OPTIONS = [
  { label: 'Tickets', value: 'tickets' },
  { label: 'Accounts', value: 'accounts' },
  { label: 'Assets', value: 'assets' },
  { label: 'Software', value: 'software' },
  { label: 'Custom Fields', value: 'custom_fields' },
  { label: 'Audit', value: 'audit' },
]

const EMPTY_FILTERS: Filters = {
  action: [],
  module: '',
  user_email: '',
  date_from: '',
  date_to: '',
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  entry,
  onClose,
}: {
  entry: AuditLogEntry | null
  onClose: () => void
}) {
  if (!entry) return null

  const fmt = (val: unknown) =>
    val === null || val === undefined
      ? '(none)'
      : typeof val === 'object'
      ? JSON.stringify(val, null, 2)
      : String(val)

  return (
    <Modal
      open={!!entry}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      title={`Audit Detail — ${entry.action_display} on ${entry.module}`}
      width={760}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Row gutter={8}>
          <Col span={12}>
            <Text strong>Timestamp</Text>
            <br />
            <Text>{dayjs(entry.timestamp).format('DD MMM YYYY HH:mm:ss')}</Text>
          </Col>
          <Col span={12}>
            <Text strong>User</Text>
            <br />
            <Text>{entry.user_email}</Text>
          </Col>
        </Row>
        <Row gutter={8}>
          <Col span={12}>
            <Text strong>Record</Text>
            <br />
            <Text>{entry.record_repr || entry.record_id}</Text>
          </Col>
          <Col span={12}>
            <Text strong>IP Address</Text>
            <br />
            <Text>{entry.ip_address || '—'}</Text>
          </Col>
        </Row>
        {entry.field_name && (
          <Row>
            <Col span={24}>
              <Text strong>Field Changed</Text>
              <br />
              <Text>{entry.field_name}</Text>
            </Col>
          </Row>
        )}
        <Row gutter={8}>
          <Col span={12}>
            <Text strong>Old Value</Text>
            <pre
              style={{
                background: '#fafafa',
                border: '1px solid #f0f0f0',
                borderRadius: 4,
                padding: '8px 12px',
                marginTop: 4,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                minHeight: 60,
              }}
            >
              {fmt(entry.old_value)}
            </pre>
          </Col>
          <Col span={12}>
            <Text strong>New Value</Text>
            <pre
              style={{
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 4,
                padding: '8px 12px',
                marginTop: 4,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                minHeight: 60,
              }}
            >
              {fmt(entry.new_value)}
            </pre>
          </Col>
        </Row>
      </Space>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditLogViewer() {
  const [data, setData] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null)

  const fetchData = useCallback(
    async (currentPage: number, currentFilters: Filters) => {
      setLoading(true)
      setError(false)
      try {
        const params: Record<string, string> = {
          ordering: '-timestamp',
          page: String(currentPage),
          page_size: String(PAGE_SIZE),
        }
        if (currentFilters.action.length > 0) {
          params.action = currentFilters.action.join(',')
        }
        if (currentFilters.module) params.module = currentFilters.module
        if (currentFilters.user_email) params.user_email = currentFilters.user_email
        if (currentFilters.date_from) params.timestamp_after = currentFilters.date_from
        if (currentFilters.date_to) params.timestamp_before = currentFilters.date_to

        const { data: responseData } = await client.get<PaginatedResponse>('/audit/', { params })
        setData(responseData.results)
        setTotal(responseData.count)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchData(page, filters)
  }, [page, filters, fetchData])

  function handleFilterChange(partial: Partial<Filters>) {
    setPage(1)
    setFilters(prev => ({ ...prev, ...partial }))
  }

  function handleClearFilters() {
    setPage(1)
    setFilters(EMPTY_FILTERS)
  }

  function handleExportCSV() {
    const params = new URLSearchParams()
    if (filters.action.length > 0) {
      // Export endpoint accepts a single action value; send the first selected, or omit for all
      filters.action.forEach(a => params.append('action', a))
    }
    if (filters.module) params.set('module', filters.module)
    if (filters.user_email) params.set('user_email', filters.user_email)
    if (filters.date_from) {
      // Convert ISO timestamp to YYYY-MM-DD for the export endpoint
      params.set('from_date', dayjs(filters.date_from).format('YYYY-MM-DD'))
    }
    if (filters.date_to) {
      params.set('to_date', dayjs(filters.date_to).format('YYYY-MM-DD'))
    }

    const queryString = params.toString()
    const url = `/api/audit/export/${queryString ? `?${queryString}` : ''}`

    message.loading({ content: 'Preparing export...', key: 'audit-export', duration: 2 })
    window.location.href = url
    setTimeout(() => {
      message.success({ content: 'Download started', key: 'audit-export', duration: 3 })
    }, 1500)
  }

  const columns: ColumnsType<AuditLogEntry> = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (val: string) => dayjs(val).format('DD MMM YYYY HH:mm:ss'),
      sorter: false,
      defaultSortOrder: 'descend',
    },
    {
      title: 'User Email',
      dataIndex: 'user_email',
      key: 'user_email',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: string, record) => (
        <Tag color={ACTION_COLORS[action] ?? 'default'}>
          {record.action_display || action}
        </Tag>
      ),
    },
    {
      title: 'Module',
      dataIndex: 'module',
      key: 'module',
      width: 120,
      render: (mod: string) => <Tag>{mod}</Tag>,
    },
    {
      title: 'Record',
      dataIndex: 'record_repr',
      key: 'record_repr',
      ellipsis: true,
      render: (repr: string) => {
        const full = repr || '—'
        const truncated = full.length > 40 ? full.slice(0, 40) + '…' : full
        return (
          <Tooltip title={full.length > 40 ? full : undefined}>
            <span>{truncated}</span>
          </Tooltip>
        )
      },
    },
    {
      title: 'IP Address',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 140,
      render: (ip: string) => ip || '—',
    },
    {
      title: 'Details',
      key: 'details',
      width: 90,
      render: (_: unknown, record) => (
        <Button size="small" onClick={() => setSelectedEntry(record)}>
          View
        </Button>
      ),
    },
  ]

  const hasActiveFilters =
    filters.action.length > 0 ||
    !!filters.module ||
    !!filters.user_email ||
    !!filters.date_from ||
    !!filters.date_to

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
            Audit Log
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Read-only — entries cannot be modified
          </Text>
        </div>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleExportCSV}
        >
          Export CSV
        </Button>
      </div>

      {error && (
        <Alert
          type="error"
          message="Could not load audit log entries."
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => fetchData(page, filters)}>
              Retry
            </Button>
          }
        />
      )}

      {/* Filter Bar */}
      <Space wrap style={{ marginBottom: 16, marginTop: 16 }}>
        <Select
          mode="multiple"
          placeholder="Filter by Action"
          options={ACTION_OPTIONS}
          value={filters.action}
          onChange={val => handleFilterChange({ action: val })}
          style={{ minWidth: 200 }}
          allowClear
        />

        <Select
          placeholder="Filter by Module"
          options={MODULE_OPTIONS}
          value={filters.module || undefined}
          onChange={val => handleFilterChange({ module: val ?? '' })}
          style={{ minWidth: 180 }}
          allowClear
        />

        <Input
          placeholder="User email search"
          value={filters.user_email}
          onChange={e => handleFilterChange({ user_email: e.target.value })}
          style={{ width: 200 }}
          allowClear
        />

        <RangePicker
          onChange={dates => {
            handleFilterChange({
              date_from: dates?.[0] ? dates[0].toISOString() : '',
              date_to: dates?.[1] ? dates[1].endOf('day').toISOString() : '',
            })
          }}
          value={
            filters.date_from && filters.date_to
              ? [dayjs(filters.date_from), dayjs(filters.date_to)]
              : null
          }
        />

        {hasActiveFilters && (
          <Button onClick={handleClearFilters}>Clear Filters</Button>
        )}
      </Space>

      <Table<AuditLogEntry>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: (t, [s, e]) => `${s}–${e} of ${t} entries`,
          onChange: p => setPage(p),
          showSizeChanger: false,
        }}
        scroll={{ x: 900 }}
        size="small"
      />

      <DetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </>
  )
}
