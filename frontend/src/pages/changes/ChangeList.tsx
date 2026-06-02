import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Tag, Space, Input, Select, Typography, Badge, Tooltip,
  message, Segmented, Card, Avatar, Dropdown,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import {
  PlusOutlined, SearchOutlined, InboxOutlined, UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import client from '../../api/client'
import { useAuthStore } from '../../store/auth'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { Option } = Select

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChangeRequest {
  id: string
  ref_number: string
  title: string
  description: string
  change_type: 'task' | 'story' | 'bug' | 'feature' | 'improvement' | 'epic'
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
  reporter: string
  reporter_email: string | null
  reporter_full_name: string | null
  assignee: string | null
  assignee_email: string | null
  assignee_full_name: string | null
  due_date: string | null
  story_points: number | null
  labels: string
  custom_fields: Record<string, unknown>
  linked_ticket_ids: string[]
  is_archived: boolean
  archive_reason: string
  created_at: string
  estimated_hours: number | null
  actual_hours: number | null
}

interface KanbanColumn {
  backlog: ChangeRequest[]
  todo: ChangeRequest[]
  in_progress: ChangeRequest[]
  in_review: ChangeRequest[]
  done: ChangeRequest[]
  cancelled: ChangeRequest[]
}

interface PaginatedChanges {
  count: number
  results: ChangeRequest[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { label: 'Backlog', value: 'backlog' },
  { label: 'To Do', value: 'todo' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Done', value: 'done' },
  { label: 'Cancelled', value: 'cancelled' },
]

const TYPE_OPTIONS = [
  { label: 'Epic', value: 'epic' },
  { label: 'Feature', value: 'feature' },
  { label: 'Story', value: 'story' },
  { label: 'Task', value: 'task' },
  { label: 'Bug', value: 'bug' },
  { label: 'Improvement', value: 'improvement' },
]

const PRIORITY_OPTIONS = [
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

const TYPE_COLORS: Record<string, string> = {
  epic: 'purple',
  feature: 'green',
  story: 'blue',
  task: 'default',
  bug: 'red',
  improvement: 'orange',
}

const STATUS_COLORS: Record<string, string> = {
  backlog: 'default',
  todo: 'blue',
  in_progress: 'orange',
  in_review: 'gold',
  done: 'green',
  cancelled: 'red',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  critical: 'red',
}

const KANBAN_COLUMNS: { key: keyof KanbanColumn; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'done', label: 'Done' },
]

const STATUS_FLOW: Record<string, string> = {
  backlog: 'todo',
  todo: 'in_progress',
  in_progress: 'in_review',
  in_review: 'done',
}

const PAGE_SIZE = 25

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

function humanStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Kanban card ────────────────────────────────────────────────────────────────

interface KanbanCardProps {
  item: ChangeRequest
  onMoved: () => void
}

function KanbanCard({ item, onMoved }: KanbanCardProps) {
  const navigate = useNavigate()
  const [moving, setMoving] = useState(false)

  const nextStatus = STATUS_FLOW[item.status]
  const moveItems = nextStatus
    ? [
        {
          key: nextStatus,
          label: `Move to ${humanStatus(nextStatus)}`,
        },
      ]
    : []

  async function handleMove({ key }: { key: string }) {
    setMoving(true)
    try {
      await client.post(`/changes/${item.id}/status/`, { status: key })
      message.success(`Moved to ${humanStatus(key)}.`)
      onMoved()
    } catch {
      message.error('Failed to move item.')
    } finally {
      setMoving(false)
    }
  }

  return (
    <Card
      size="small"
      hoverable
      style={{ marginBottom: 8, cursor: 'pointer' }}
      onClick={() => navigate(`/changes/${item.id}`)}
      bodyStyle={{ padding: '10px 12px' }}
    >
      <div style={{ marginBottom: 4 }}>
        <Text
          type="secondary"
          style={{ fontFamily: 'monospace', fontSize: 11 }}
        >
          {item.ref_number}
        </Text>
      </div>
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8, lineHeight: 1.3 }}>
        {item.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <Space size={4}>
          <Tag color={TYPE_COLORS[item.change_type] ?? 'default'} style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
            {item.change_type.charAt(0).toUpperCase() + item.change_type.slice(1)}
          </Tag>
          <Tag color={PRIORITY_COLORS[item.priority] ?? 'default'} style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
            {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
          </Tag>
        </Space>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.assignee ? (
            <Tooltip title={item.assignee_full_name || item.assignee_email || '?'}>
              <Avatar size={22} style={{ backgroundColor: '#1677ff', fontSize: 10, fontWeight: 600 }}>
                {initials(item.assignee_full_name || item.assignee_email || '?')}
              </Avatar>
            </Tooltip>
          ) : (
            <Tooltip title="Unassigned">
              <Avatar size={22} icon={<UserOutlined />} style={{ backgroundColor: '#d9d9d9' }} />
            </Tooltip>
          )}
          {moveItems.length > 0 && (
            <Dropdown
              menu={{ items: moveItems, onClick: handleMove }}
              trigger={['click']}
              disabled={moving}
            >
              <Button
                size="small"
                type="text"
                style={{ fontSize: 11, padding: '0 4px', height: 20 }}
                onClick={e => e.stopPropagation()}
              >
                Move →
              </Button>
            </Dropdown>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Kanban board ───────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  onRefresh: () => void
  refreshKey: number
}

function KanbanBoard({ onRefresh, refreshKey }: KanbanBoardProps) {
  const [columns, setColumns] = useState<KanbanColumn | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchKanban = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<KanbanColumn>('/changes/kanban/')
      setColumns(data)
    } catch {
      message.error('Failed to load kanban board.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKanban()
  }, [fetchKanban, refreshKey])

  if (loading || !columns) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
        {loading ? 'Loading board…' : 'No data.'}
      </div>
    )
  }

  const visibleColumns = KANBAN_COLUMNS.filter(col => {
    if (col.key === 'cancelled') return (columns.cancelled ?? []).length > 0
    return true
  })

  // Include cancelled if it has items
  const allCols = columns.cancelled && columns.cancelled.length > 0
    ? [...KANBAN_COLUMNS, { key: 'cancelled' as keyof KanbanColumn, label: 'Cancelled' }]
    : visibleColumns

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${allCols.length}, minmax(220px, 1fr))`,
        gap: 12,
        overflowX: 'auto',
      }}
    >
      {allCols.map(col => {
        const items = columns[col.key] ?? []
        return (
          <div key={col.key} style={{ background: '#f5f5f5', borderRadius: 8, padding: '10px 10px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Text strong style={{ fontSize: 13 }}>{col.label}</Text>
              <Badge
                count={items.length}
                showZero
                style={{ backgroundColor: '#8c8c8c' }}
                overflowCount={999}
              />
            </div>
            {items.map(item => (
              <KanbanCard key={item.id} item={item} onMoved={() => { onRefresh(); fetchKanban() }} />
            ))}
            {items.length === 0 && (
              <div style={{ color: '#bbb', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                No items
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Archived table ─────────────────────────────────────────────────────────────

interface ArchivedTableProps {
  isManager: boolean
}

function ArchivedTable({ isManager }: ArchivedTableProps) {
  const navigate = useNavigate()
  const [items, setItems] = useState<ChangeRequest[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [restoring, setRestoring] = useState<string | null>(null)

  const fetchArchived = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<PaginatedChanges>('/changes/', {
        params: { page, page_size: PAGE_SIZE, is_archived: true },
      })
      setItems(data.results)
      setTotal(data.count)
    } catch {
      message.error('Failed to load archived changes.')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { fetchArchived() }, [fetchArchived])

  async function handleRestore(item: ChangeRequest) {
    const reason = window.prompt('Enter reason for restoring (min 10 characters):')
    if (!reason || reason.trim().length < 10) {
      message.warning('Reason must be at least 10 characters.')
      return
    }
    setRestoring(item.id)
    try {
      await client.post(`/changes/${item.id}/unarchive/`, { reason: reason.trim() })
      message.success(`${item.ref_number} restored.`)
      fetchArchived()
    } catch {
      message.error('Failed to restore change.')
    } finally {
      setRestoring(null)
    }
  }

  const columns: ColumnsType<ChangeRequest> = [
    {
      title: 'Ref #',
      dataIndex: 'ref_number',
      key: 'ref_number',
      width: 110,
      render: (val: string) => (
        <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 500 }}>{val}</Tag>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (val: string, record: ChangeRequest) => (
        <a onClick={e => { e.stopPropagation(); navigate(`/changes/${record.id}`) }} style={{ fontWeight: 500 }}>
          {val}
        </a>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'change_type',
      key: 'change_type',
      width: 110,
      render: (val: string) => (
        <Tag color={TYPE_COLORS[val] ?? 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (val: string) => (
        <Tag color={PRIORITY_COLORS[val] ?? 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Archive Reason',
      dataIndex: 'archive_reason',
      key: 'archive_reason',
      ellipsis: true,
      render: (val: string) => {
        if (!val) return '—'
        const short = val.length > 60 ? val.slice(0, 60) + '…' : val
        return <Tooltip title={val}><span>{short}</span></Tooltip>
      },
    },
    ...(isManager
      ? [{
          title: 'Actions',
          key: 'actions',
          width: 100,
          render: (_: unknown, record: ChangeRequest) => (
            <Button
              size="small"
              loading={restoring === record.id}
              onClick={e => { e.stopPropagation(); handleRestore(record) }}
            >
              Restore
            </Button>
          ),
        } as ColumnsType<ChangeRequest>[number]]
      : []),
  ]

  return (
    <Table<ChangeRequest>
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={loading}
      size="middle"
      scroll={{ x: 800 }}
      pagination={{
        current: page,
        pageSize: PAGE_SIZE,
        total,
        showSizeChanger: false,
        showTotal: (t: number) => `${t} archived change${t !== 1 ? 's' : ''}`,
        onChange: (p: number) => setPage(p),
      }}
      onRow={record => ({
        onClick: () => navigate(`/changes/${record.id}`),
        style: { cursor: 'pointer' },
      })}
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

type ViewMode = 'table' | 'kanban'
type ActiveTab = 'active' | 'archived'

export default function ChangeList() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const isAgent = ['it_agent', 'it_manager', 'super_admin'].includes(user?.role_name ?? '')
  const isManager = ['it_manager', 'super_admin'].includes(user?.role_name ?? '')

  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [activeTab, setActiveTab] = useState<ActiveTab>('active')
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0)

  // Table state
  const [items, setItems] = useState<ChangeRequest[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [searchRaw, setSearchRaw] = useState('')
  const [search, setSearch] = useState('')

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), 300)
    return () => clearTimeout(t)
  }, [searchRaw])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [statusFilter, typeFilter, priorityFilter, search])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page, page_size: PAGE_SIZE }
      if (statusFilter.length) params.status = statusFilter.join(',')
      if (typeFilter.length) params.change_type = typeFilter.join(',')
      if (priorityFilter.length) params.priority = priorityFilter.join(',')
      if (search) params.search = search
      const { data } = await client.get<PaginatedChanges>('/changes/', { params })
      setItems(data.results)
      setTotal(data.count)
    } catch {
      message.error('Failed to load changes.')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, typeFilter, priorityFilter, search])

  useEffect(() => {
    if (activeTab === 'active' && viewMode === 'table') {
      fetchItems()
    }
  }, [activeTab, viewMode, fetchItems])

  // ── Table columns ──────────────────────────────────────────────────────────

  const columns: ColumnsType<ChangeRequest> = [
    {
      title: 'Ref #',
      dataIndex: 'ref_number',
      key: 'ref_number',
      width: 110,
      render: (val: string) => (
        <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 500 }}>{val}</Tag>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (val: string, record: ChangeRequest) => (
        <a
          onClick={e => { e.stopPropagation(); navigate(`/changes/${record.id}`) }}
          style={{ fontWeight: 500 }}
        >
          {val}
        </a>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'change_type',
      key: 'change_type',
      width: 120,
      render: (val: string) => (
        <Tag color={TYPE_COLORS[val] ?? 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (val: string) => (
        <Tag color={PRIORITY_COLORS[val] ?? 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (val: string) => (
        <Tag color={STATUS_COLORS[val] ?? 'default'}>
          {humanStatus(val)}
        </Tag>
      ),
    },
    {
      title: 'Assignee',
      key: 'assignee',
      width: 160,
      ellipsis: true,
      render: (_: unknown, record: ChangeRequest) =>
        record.assignee ? (
          <Space size={6}>
            <Avatar size={20} style={{ backgroundColor: '#1677ff', fontSize: 10, fontWeight: 600 }}>
              {initials(record.assignee_full_name || record.assignee_email || '?')}
            </Avatar>
            <Text style={{ fontSize: 13 }}>{record.assignee_full_name || record.assignee_email}</Text>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>Unassigned</Text>
        ),
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'due_date',
      width: 120,
      render: (val: string | null) => {
        if (!val) return <Text type="secondary">—</Text>
        const isOverdue = dayjs(val).isBefore(dayjs(), 'day')
        return (
          <Tooltip title={dayjs(val).format('DD MMM YYYY')}>
            <Text style={{ color: isOverdue ? '#ff4d4f' : undefined, fontSize: 13 }}>
              {dayjs(val).format('DD MMM YYYY')}
            </Text>
          </Tooltip>
        )
      },
    },
    {
      title: 'SP',
      dataIndex: 'story_points',
      key: 'story_points',
      width: 60,
      align: 'center',
      render: (val: number | null) => val ?? <Text type="secondary">—</Text>,
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
  ]

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize: PAGE_SIZE,
    total,
    showSizeChanger: false,
    showTotal: (t: number) => `${t} change${t !== 1 ? 's' : ''}`,
    onChange: (p: number) => setPage(p),
  }

  const hasFilters = statusFilter.length > 0 || typeFilter.length > 0 || priorityFilter.length > 0 || !!search

  // ── Tab definitions ─────────────────────────────────────────────────────────

  const tabs = [
    { key: 'active', label: 'Active' },
    { key: 'archived', label: <span><InboxOutlined style={{ marginRight: 4 }} />Archived</span> },
  ]

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Change Management</Title>
        <Space>
          {activeTab === 'active' && (
            <Segmented
              options={[
                { label: 'Table', value: 'table' },
                { label: 'Kanban', value: 'kanban' },
              ]}
              value={viewMode}
              onChange={v => setViewMode(v as ViewMode)}
            />
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/changes/new')}
          >
            New Change
          </Button>
        </Space>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
        {tabs.map(t => (
          <div
            key={t.key}
            onClick={() => setActiveTab(t.key as ActiveTab)}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: activeTab === t.key ? 600 : 400,
              borderBottom: activeTab === t.key ? '2px solid #1677ff' : '2px solid transparent',
              color: activeTab === t.key ? '#1677ff' : 'inherit',
              userSelect: 'none',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* Active tab content */}
      {activeTab === 'active' && viewMode === 'table' && (
        <>
          <Space wrap style={{ marginBottom: 16 }}>
            <Input
              placeholder="Search changes…"
              prefix={<SearchOutlined />}
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
            <Select
              mode="multiple"
              placeholder="Filter by status"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ minWidth: 180 }}
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
              style={{ minWidth: 160 }}
              maxTagCount="responsive"
              allowClear
            >
              {TYPE_OPTIONS.map(o => (
                <Option key={o.value} value={o.value}>{o.label}</Option>
              ))}
            </Select>
            <Select
              mode="multiple"
              placeholder="Filter by priority"
              value={priorityFilter}
              onChange={setPriorityFilter}
              style={{ minWidth: 180 }}
              maxTagCount="responsive"
              allowClear
            >
              {PRIORITY_OPTIONS.map(o => (
                <Option key={o.value} value={o.value}>{o.label}</Option>
              ))}
            </Select>
            {hasFilters && (
              <Button
                size="small"
                onClick={() => {
                  setStatusFilter([])
                  setTypeFilter([])
                  setPriorityFilter([])
                  setSearchRaw('')
                }}
              >
                Clear filters
              </Button>
            )}
          </Space>

          <Table<ChangeRequest>
            rowKey="id"
            columns={columns}
            dataSource={items}
            loading={loading}
            pagination={pagination}
            size="middle"
            scroll={{ x: 1000 }}
            onRow={record => ({
              onClick: () => navigate(`/changes/${record.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        </>
      )}

      {activeTab === 'active' && viewMode === 'kanban' && (
        <KanbanBoard
          refreshKey={kanbanRefreshKey}
          onRefresh={() => setKanbanRefreshKey(k => k + 1)}
        />
      )}

      {activeTab === 'archived' && (
        <ArchivedTable isManager={isManager} />
      )}
    </div>
  )
}
