import { useCallback, useEffect, useState } from 'react'
import {
  Typography, Button, Card, Progress, Tag, Badge, Space, Modal, Form,
  Input, DatePicker, message, Segmented, Tooltip, Popconfirm,
} from 'antd'
import { PlusOutlined, CalendarOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import client from '../../api/client'
import { useAuthStore } from '../../store/auth'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

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

type SprintStatusFilter = 'all' | 'planning' | 'active' | 'completed'

interface CreateSprintForm {
  name: string
  goal?: string
  start_date?: dayjs.Dayjs
  end_date?: dayjs.Dayjs
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_BADGE_COLORS: Record<Sprint['status'], string> = {
  planning: 'blue',
  active: 'green',
  completed: 'default',
}

const STATUS_TABS: { label: string; value: SprintStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Planning', value: 'planning' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
]

// ── Sprint Card ────────────────────────────────────────────────────────────────

interface SprintCardProps {
  sprint: Sprint
  isManager: boolean
  onRefresh: () => void
}

function SprintCard({ sprint, isManager, onRefresh }: SprintCardProps) {
  const navigate = useNavigate()
  const [acting, setActing] = useState(false)

  const progressPercent =
    sprint.total_count > 0
      ? Math.round((sprint.done_count / sprint.total_count) * 100)
      : 0

  const dateRange =
    sprint.start_date && sprint.end_date
      ? `${dayjs(sprint.start_date).format('DD MMM YYYY')} → ${dayjs(sprint.end_date).format('DD MMM YYYY')}`
      : 'No dates set'

  async function handleStart() {
    setActing(true)
    try {
      await client.post(`/sprints/${sprint.id}/start/`)
      message.success(`${sprint.name} is now active.`)
      onRefresh()
    } catch {
      message.error('Failed to start sprint.')
    } finally {
      setActing(false)
    }
  }

  async function handleComplete() {
    setActing(true)
    try {
      await client.post(`/sprints/${sprint.id}/complete/`)
      message.success(`${sprint.name} completed. Unfinished items moved to backlog.`)
      onRefresh()
    } catch {
      message.error('Failed to complete sprint.')
    } finally {
      setActing(false)
    }
  }

  const daysRemainingBadge =
    sprint.status === 'active' && sprint.days_remaining !== null ? (
      <Tag color={sprint.days_remaining <= 3 ? 'red' : 'orange'} style={{ fontSize: 11 }}>
        {sprint.days_remaining <= 0 ? 'Overdue' : `${sprint.days_remaining}d left`}
      </Tag>
    ) : null

  const footerActions = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {sprint.status === 'planning' && (
        <>
          {isManager && (
            <Button
              type="primary"
              size="small"
              loading={acting}
              onClick={handleStart}
            >
              Start Sprint
            </Button>
          )}
        </>
      )}
      {sprint.status === 'active' && (
        <>
          <Button
            type="primary"
            size="small"
            onClick={() => navigate(`/sprints/${sprint.id}`)}
          >
            View Board
          </Button>
          {isManager && (
            <Popconfirm
              title="Complete this sprint?"
              description="All unfinished items will be moved to the backlog."
              onConfirm={handleComplete}
              okText="Complete"
              okButtonProps={{ danger: true }}
            >
              <Button danger size="small" loading={acting}>
                Complete Sprint
              </Button>
            </Popconfirm>
          )}
        </>
      )}
      {sprint.status === 'completed' && (
        <Button size="small" onClick={() => navigate(`/sprints/${sprint.id}`)}>
          View
        </Button>
      )}
    </div>
  )

  return (
    <Card
      size="small"
      style={{ marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <Text strong style={{ fontSize: 14, lineHeight: 1.4 }}>{sprint.name}</Text>
        <Badge
          status={sprint.status === 'active' ? 'processing' : sprint.status === 'planning' ? 'default' : 'default'}
          text={
            <Tag color={STATUS_BADGE_COLORS[sprint.status]} style={{ margin: 0, fontSize: 11 }}>
              {sprint.status_display}
            </Tag>
          }
          style={{ whiteSpace: 'nowrap' }}
        />
      </div>

      {/* Goal */}
      <Paragraph
        ellipsis={{ rows: 2 }}
        type="secondary"
        style={{ fontSize: 12, marginBottom: 10, flex: 1 }}
      >
        {sprint.goal || 'No goal defined.'}
      </Paragraph>

      {/* Date range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <CalendarOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>{dateRange}</Text>
        {daysRemainingBadge}
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>Progress</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {sprint.done_count} / {sprint.total_count} tasks
          </Text>
        </div>
        <Tooltip title={`${progressPercent}% complete`}>
          <Progress
            percent={progressPercent}
            showInfo={false}
            strokeColor="#52c41a"
            size="small"
          />
        </Tooltip>
      </div>

      {/* Footer */}
      {footerActions}
    </Card>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SprintList() {
  const user = useAuthStore(s => s.user)
  const isManager = ['it_manager', 'super_admin'].includes(user?.role_name ?? '')

  const [sprints, setSprints] = useState<Sprint[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<SprintStatusFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm<CreateSprintForm>()

  const fetchSprints = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (statusFilter !== 'all') params.status = statusFilter
      const { data } = await client.get<Sprint[]>('/sprints/', { params })
      setSprints(data)
    } catch {
      message.error('Failed to load sprints.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchSprints()
  }, [fetchSprints])

  async function handleCreate(values: CreateSprintForm) {
    setCreating(true)
    try {
      await client.post('/sprints/', {
        name: values.name,
        goal: values.goal ?? '',
        start_date: values.start_date ? values.start_date.format('YYYY-MM-DD') : null,
        end_date: values.end_date ? values.end_date.format('YYYY-MM-DD') : null,
      })
      message.success('Sprint created.')
      form.resetFields()
      setModalOpen(false)
      fetchSprints()
    } catch {
      message.error('Failed to create sprint.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Sprints</Title>
        {isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Create Sprint
          </Button>
        )}
      </div>

      {/* Status tabs */}
      <div style={{ marginBottom: 20 }}>
        <Segmented
          options={STATUS_TABS.map(t => ({ label: t.label, value: t.value }))}
          value={statusFilter}
          onChange={v => setStatusFilter(v as SprintStatusFilter)}
        />
      </div>

      {/* Sprint grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Loading sprints…</div>
      ) : sprints.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
          No sprints found.
          {isManager && (
            <div style={{ marginTop: 12 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                Create your first sprint
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {sprints.map(sprint => (
            <SprintCard
              key={sprint.id}
              sprint={sprint}
              isManager={isManager}
              onRefresh={fetchSprints}
            />
          ))}
        </div>
      )}

      {/* Create Sprint Modal */}
      <Modal
        title="Create Sprint"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        okText="Create"
        confirmLoading={creating}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Sprint Name"
            rules={[{ required: true, message: 'Sprint name is required.' }]}
          >
            <Input placeholder="e.g. Sprint 12" />
          </Form.Item>
          <Form.Item name="goal" label="Goal">
            <TextArea rows={3} placeholder="What should this sprint achieve?" />
          </Form.Item>
          <Space style={{ width: '100%' }} direction="vertical" size={0}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item name="start_date" label="Start Date" style={{ flex: 1, marginBottom: 8 }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="end_date" label="End Date" style={{ flex: 1, marginBottom: 8 }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
