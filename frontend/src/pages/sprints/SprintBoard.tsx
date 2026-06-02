import { useCallback, useEffect, useState } from 'react'
import {
  Typography, Tag, Badge, Progress, Space, Card, Avatar, Tooltip,
  Button, message, Popconfirm, Dropdown, Collapse,
} from 'antd'
import {
  UserOutlined, CloseOutlined, PlusOutlined, CaretRightOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import client from '../../api/client'
import { useAuthStore } from '../../store/auth'
import type { ChangeRequest } from '../changes/ChangeList'

const { Title, Text, Paragraph } = Typography

// ── Types ──────────────────────────────────────────────────────────────────────

interface Sprint {
  id: string
  name: string
  goal: string
  status: 'planning' | 'active' | 'completed'
  status_display: string
  start_date: string | null
  end_date: string | null
  days_remaining: number | null
  done_count: number
  total_count: number
  created_by_name: string
  created_at: string
}

interface SprintChanges {
  backlog: ChangeRequest[]
  todo: ChangeRequest[]
  in_progress: ChangeRequest[]
  in_review: ChangeRequest[]
  done: ChangeRequest[]
  cancelled: ChangeRequest[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_BADGE_COLORS: Record<Sprint['status'], string> = {
  planning: 'blue',
  active: 'green',
  completed: 'default',
}

const TYPE_COLORS: Record<string, string> = {
  epic: 'purple',
  feature: 'green',
  story: 'blue',
  task: 'default',
  bug: 'red',
  improvement: 'orange',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  critical: 'red',
}

const BOARD_COLUMNS: { key: keyof SprintChanges; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'done', label: 'Done' },
]

const ALL_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']

function humanStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

// ── Sprint Kanban Card ─────────────────────────────────────────────────────────

interface SprintKanbanCardProps {
  item: ChangeRequest
  sprintId: string
  onRefresh: () => void
}

function SprintKanbanCard({ item, sprintId, onRefresh }: SprintKanbanCardProps) {
  const navigate = useNavigate()
  const [moving, setMoving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const moveItems = ALL_STATUSES
    .filter(s => s !== item.status)
    .map(s => ({ key: s, label: humanStatus(s) }))

  async function handleMove({ key }: { key: string }) {
    setMoving(true)
    try {
      await client.post(`/changes/${item.id}/status/`, { status: key })
      message.success(`Moved to ${humanStatus(key)}.`)
      onRefresh()
    } catch {
      message.error('Failed to move item.')
    } finally {
      setMoving(false)
    }
  }

  async function handleRemove(e?: React.MouseEvent) {
    e?.stopPropagation()
    setRemoving(true)
    try {
      await client.post(`/changes/${item.id}/sprint/`, { sprint_id: null })
      message.success(`${item.ref_number} removed from sprint.`)
      onRefresh()
    } catch {
      message.error('Failed to remove from sprint.')
    } finally {
      setRemoving(false)
    }
  }

  void sprintId // used by parent context

  return (
    <Card
      size="small"
      hoverable
      style={{ marginBottom: 8 }}
      bodyStyle={{ padding: '10px 12px' }}
      onClick={() => navigate(`/changes/${item.id}`)}
    >
      {/* Ref + Remove button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 11 }}>
          {item.ref_number}
        </Text>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined style={{ fontSize: 10 }} />}
          loading={removing}
          style={{ padding: '0 4px', height: 18 }}
          onClick={handleRemove}
          title="Remove from sprint"
        />
      </div>

      {/* Title */}
      <div
        style={{
          fontWeight: 500,
          fontSize: 13,
          marginBottom: 8,
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {item.title}
      </div>

      {/* Tags + Assignee + Move */}
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
              Move
            </Button>
          </Dropdown>
        </div>
      </div>
    </Card>
  )
}

// ── Backlog Item ───────────────────────────────────────────────────────────────

interface BacklogItemProps {
  item: ChangeRequest
  sprintId: string
  onAdded: () => void
}

function BacklogItem({ item, sprintId, onAdded }: BacklogItemProps) {
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)

  async function handleAdd(e: React.MouseEvent) {
    e.stopPropagation()
    setAdding(true)
    try {
      await client.post(`/changes/${item.id}/sprint/`, { sprint_id: sprintId })
      message.success(`${item.ref_number} added to sprint.`)
      onAdded()
    } catch {
      message.error('Failed to add to sprint.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card
      size="small"
      hoverable
      style={{ marginBottom: 8 }}
      bodyStyle={{ padding: '10px 12px' }}
      onClick={() => navigate(`/changes/${item.id}`)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 11, display: 'block', marginBottom: 2 }}>
            {item.ref_number}
          </Text>
          <div
            style={{
              fontWeight: 500,
              fontSize: 13,
              marginBottom: 6,
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.title}
          </div>
          <Space size={4}>
            <Tag color={TYPE_COLORS[item.change_type] ?? 'default'} style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
              {item.change_type.charAt(0).toUpperCase() + item.change_type.slice(1)}
            </Tag>
            <Tag color={PRIORITY_COLORS[item.priority] ?? 'default'} style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
              {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
            </Tag>
          </Space>
        </div>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          loading={adding}
          onClick={handleAdd}
          style={{ flexShrink: 0 }}
        >
          Add to Sprint
        </Button>
      </div>
    </Card>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SprintBoard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const isManager = ['it_manager', 'super_admin'].includes(user?.role_name ?? '')

  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [sprintLoading, setSprintLoading] = useState(false)
  const [columns, setColumns] = useState<SprintChanges | null>(null)
  const [boardLoading, setBoardLoading] = useState(false)
  const [backlog, setBacklog] = useState<ChangeRequest[]>([])
  const [backlogLoading, setBacklogLoading] = useState(false)
  const [completing, setCompleting] = useState(false)

  const fetchSprint = useCallback(async () => {
    if (!id) return
    setSprintLoading(true)
    try {
      const { data } = await client.get<Sprint>(`/sprints/${id}/`)
      setSprint(data)
    } catch {
      message.error('Failed to load sprint.')
    } finally {
      setSprintLoading(false)
    }
  }, [id])

  const fetchBoard = useCallback(async () => {
    if (!id) return
    setBoardLoading(true)
    try {
      const { data } = await client.get<SprintChanges>(`/sprints/${id}/changes/`)
      setColumns(data)
    } catch {
      message.error('Failed to load sprint board.')
    } finally {
      setBoardLoading(false)
    }
  }, [id])

  const fetchBacklog = useCallback(async () => {
    setBacklogLoading(true)
    try {
      const { data } = await client.get<{ results: ChangeRequest[] }>('/changes/', {
        params: { status: 'backlog' },
      })
      setBacklog(data.results ?? (data as unknown as ChangeRequest[]))
    } catch {
      message.error('Failed to load backlog.')
    } finally {
      setBacklogLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSprint()
    fetchBoard()
    fetchBacklog()
  }, [fetchSprint, fetchBoard, fetchBacklog])

  async function handleComplete() {
    if (!sprint) return
    setCompleting(true)
    try {
      await client.post(`/sprints/${sprint.id}/complete/`)
      message.success(`${sprint.name} completed. Unfinished items moved to backlog.`)
      fetchSprint()
      fetchBoard()
      fetchBacklog()
    } catch {
      message.error('Failed to complete sprint.')
    } finally {
      setCompleting(false)
    }
  }

  const progressPercent = sprint && sprint.total_count > 0
    ? Math.round((sprint.done_count / sprint.total_count) * 100)
    : 0

  const dateRange = sprint
    ? sprint.start_date && sprint.end_date
      ? `${dayjs(sprint.start_date).format('DD MMM YYYY')} → ${dayjs(sprint.end_date).format('DD MMM YYYY')}`
      : 'No dates set'
    : ''

  if (sprintLoading || !sprint) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
        {sprintLoading ? 'Loading sprint…' : 'Sprint not found.'}
      </div>
    )
  }

  const visibleColumns = sprint.status === 'completed'
    ? [...BOARD_COLUMNS, { key: 'cancelled' as keyof SprintChanges, label: 'Cancelled' }]
    : BOARD_COLUMNS

  return (
    <div>
      {/* Sprint header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Title level={4} style={{ margin: 0 }}>{sprint.name}</Title>
            <Tag color={STATUS_BADGE_COLORS[sprint.status]} style={{ margin: 0 }}>
              {sprint.status_display}
            </Tag>
            {sprint.status === 'active' && sprint.days_remaining !== null && (
              <Badge
                count={
                  sprint.days_remaining <= 0
                    ? 'Overdue'
                    : `${sprint.days_remaining}d left`
                }
                style={{
                  backgroundColor: sprint.days_remaining <= 3 ? '#ff4d4f' : '#fa8c16',
                }}
              />
            )}
          </div>
          {isManager && sprint.status === 'active' && (
            <Popconfirm
              title="Complete this sprint?"
              description="All unfinished items will be moved to the backlog."
              onConfirm={handleComplete}
              okText="Complete"
              okButtonProps={{ danger: true }}
            >
              <Button danger loading={completing}>
                Complete Sprint
              </Button>
            </Popconfirm>
          )}
        </div>

        {/* Date range and progress */}
        <Space size={16} wrap style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>{dateRange}</Text>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {sprint.done_count} / {sprint.total_count} tasks done ({progressPercent}%)
          </Text>
        </Space>
        <Progress
          percent={progressPercent}
          showInfo={false}
          strokeColor="#52c41a"
          style={{ maxWidth: 500 }}
        />

        {/* Goal */}
        {sprint.goal && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              background: '#f6f6f6',
              borderRadius: 4,
              borderLeft: '3px solid #1677ff',
              maxWidth: 700,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
              {sprint.goal}
            </Text>
          </div>
        )}
      </div>

      {/* Sprint Board */}
      <Title level={5} style={{ marginBottom: 12 }}>Sprint Board</Title>
      {boardLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Loading board…</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(200px, 1fr))`,
            gap: 12,
            overflowX: 'auto',
            marginBottom: 32,
          }}
        >
          {visibleColumns.map(col => {
            const items = columns ? (columns[col.key] ?? []) : []
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
                  <SprintKanbanCard
                    key={item.id}
                    item={item}
                    sprintId={sprint.id}
                    onRefresh={() => { fetchBoard(); fetchSprint() }}
                  />
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
      )}

      {/* Sprint Backlog (collapsible) */}
      <Collapse
        size="small"
        expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
        items={[
          {
            key: 'backlog',
            label: (
              <Space>
                <Text strong>Sprint Backlog</Text>
                <Tag>{backlog.length} unassigned items</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Items not yet assigned to a sprint
                </Text>
              </Space>
            ),
            children: backlogLoading ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>Loading backlog…</div>
            ) : backlog.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>
                No unassigned backlog items.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 8,
                  maxHeight: 480,
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {backlog.map(item => (
                  <BacklogItem
                    key={item.id}
                    item={item}
                    sprintId={sprint.id}
                    onAdded={() => {
                      fetchBoard()
                      fetchSprint()
                      fetchBacklog()
                    }}
                  />
                ))}
              </div>
            ),
          },
        ]}
      />

      {/* Back navigation */}
      <div style={{ marginTop: 24 }}>
        <Button type="link" onClick={() => navigate('/sprints')} style={{ padding: 0 }}>
          ← Back to Sprints
        </Button>
      </div>
    </div>
  )
}
