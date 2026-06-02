import { useEffect, useState, useCallback } from 'react'
import {
  Typography, Tag, Card, Button, Select, Avatar, Spin, message,
  Tooltip, Divider, Space, Input, Alert, Modal, InputNumber, DatePicker, Tabs,
} from 'antd'
import {
  ArrowLeftOutlined, UserOutlined, EditOutlined, CheckOutlined,
  CloseOutlined, InboxOutlined, ExclamationCircleFilled,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import client from '../../api/client'
import { useAuthStore } from '../../store/auth'
import ActivityFeed from '../../components/ActivityFeed'

dayjs.extend(relativeTime)

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Option } = Select

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChangeComment {
  id: string
  author: string
  author_email: string
  author_full_name: string
  body: string
  created_at: string
}

interface ChangeRequest {
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
  comments: ChangeComment[]
}

// ── Color maps ─────────────────────────────────────────────────────────────────

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

const STATUS_OPTIONS = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical']

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

// ── Archive reason modal ───────────────────────────────────────────────────────

interface ReasonModalProps {
  open: boolean
  title: string
  description: string
  okText: string
  okDanger?: boolean
  loading: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

function ReasonModal({
  open, title, description, okText, okDanger = false,
  loading, onConfirm, onCancel,
}: ReasonModalProps) {
  const [reason, setReason] = useState('')

  function handleOk() {
    if (reason.trim().length < 10) {
      message.warning('Reason must be at least 10 characters.')
      return
    }
    onConfirm(reason.trim())
  }

  return (
    <Modal
      title={title}
      open={open}
      onOk={handleOk}
      onCancel={() => { setReason(''); onCancel() }}
      okText={okText}
      okButtonProps={{ danger: okDanger, loading }}
      cancelButtonProps={{ disabled: loading }}
      destroyOnClose
      afterClose={() => setReason('')}
    >
      <Alert
        type={okDanger ? 'warning' : 'info'}
        showIcon
        message={description}
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 8 }}>
        <Text strong>Reason</Text>
        <Text type="secondary" style={{ marginLeft: 4, fontSize: 12 }}>(min 10 characters)</Text>
      </div>
      <TextArea
        rows={4}
        placeholder="Enter reason…"
        value={reason}
        onChange={e => setReason(e.target.value)}
        maxLength={500}
        showCount
      />
    </Modal>
  )
}

// ── Comment item ───────────────────────────────────────────────────────────────

function CommentItem({ comment }: { comment: ChangeComment }) {
  const name = comment.author_full_name || comment.author_email || 'Unknown'
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #f5f5f5' }}>
      <Avatar
        size={36}
        style={{ backgroundColor: '#1677ff', flexShrink: 0, fontWeight: 600, fontSize: 13 }}
      >
        {initials(name)}
      </Avatar>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Text strong style={{ fontSize: 13 }}>{name}</Text>
          <Tooltip title={dayjs(comment.created_at).format('DD MMM YYYY, HH:mm')}>
            <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(comment.created_at).fromNow()}</Text>
          </Tooltip>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: '#333' }}>
          {comment.body}
        </div>
      </div>
    </div>
  )
}

// ── Inline edit wrapper ────────────────────────────────────────────────────────

interface InlineEditFieldProps {
  label: string
  display: React.ReactNode
  editor: React.ReactNode
  editing: boolean
  saving: boolean
  canEdit: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
}

function InlineEditField({
  label, display, editor, editing, saving, canEdit,
  onEdit, onSave, onCancel,
}: InlineEditFieldProps) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
        {canEdit && !editing && (
          <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} style={{ padding: '0 4px', height: 20 }} />
        )}
        {editing && (
          <Space size={4}>
            <Button type="text" size="small" icon={<CheckOutlined />} loading={saving} onClick={onSave} style={{ padding: '0 4px', height: 20, color: '#52c41a' }} />
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={onCancel} style={{ padding: '0 4px', height: 20 }} />
          </Space>
        )}
      </div>
      {editing ? editor : display}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ChangeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  const isAgent = ['super_admin', 'it_manager', 'it_agent'].includes(user?.role_name ?? '')
  const isManager = ['super_admin', 'it_manager'].includes(user?.role_name ?? '')

  const [cr, setCr] = useState<ChangeRequest | null>(null)
  const [comments, setComments] = useState<ChangeComment[]>([])
  const [loadingCr, setLoadingCr] = useState(true)
  const [loadingComments, setLoadingComments] = useState(false)

  // Users for assignee
  const [users, setUsers] = useState<{ id: string; email: string; full_name: string }[]>([])

  // Right-column updating flags
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingPriority, setUpdatingPriority] = useState(false)
  const [updatingAssignee, setUpdatingAssignee] = useState(false)

  // Inline edit states
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)

  const [editingDueDate, setEditingDueDate] = useState(false)
  const [dueDateDraft, setDueDateDraft] = useState<dayjs.Dayjs | null>(null)
  const [savingDueDate, setSavingDueDate] = useState(false)

  const [editingPoints, setEditingPoints] = useState(false)
  const [pointsDraft, setPointsDraft] = useState<number | null>(null)
  const [savingPoints, setSavingPoints] = useState(false)

  const [editingHours, setEditingHours] = useState(false)
  const [estHoursDraft, setEstHoursDraft] = useState<number | null>(null)
  const [actHoursDraft, setActHoursDraft] = useState<number | null>(null)
  const [savingHours, setSavingHours] = useState(false)

  const [editingLabels, setEditingLabels] = useState(false)
  const [labelsDraft, setLabelsDraft] = useState<string[]>([])
  const [savingLabels, setSavingLabels] = useState(false)

  // Comment form
  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  // Archive / Unarchive
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [unarchiveOpen, setUnarchiveOpen] = useState(false)
  const [unarchiveLoading, setUnarchiveLoading] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCr = useCallback(async () => {
    setLoadingCr(true)
    try {
      const { data } = await client.get<ChangeRequest>(`/changes/${id}/`)
      setCr(data)
    } catch {
      message.error('Failed to load change request.')
    } finally {
      setLoadingCr(false)
    }
  }, [id])

  const fetchComments = useCallback(async () => {
    setLoadingComments(true)
    try {
      const { data } = await client.get<{ count: number; results: ChangeComment[] }>(`/changes/${id}/comments/`)
      setComments(data.results ?? [])
    } catch {
      message.error('Failed to load comments.')
    } finally {
      setLoadingComments(false)
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    fetchCr()
    fetchComments()
  }, [id, fetchCr, fetchComments])

  // Load users when agent views
  useEffect(() => {
    if (!isAgent) return
    client
      .get<{ id: string; email: string; full_name: string }[] | { results: { id: string; email: string; full_name: string }[] }>('/users/')
      .then(({ data }) =>
        setUsers(Array.isArray(data) ? data : (data as { results: { id: string; email: string; full_name: string }[] }).results ?? [])
      )
      .catch(() => { /* non-critical */ })
  }, [isAgent])

  // ── Right-column updates ────────────────────────────────────────────────────

  async function handleStatusChange(status: string) {
    setUpdatingStatus(true)
    try {
      const { data } = await client.post<ChangeRequest>(`/changes/${id}/status/`, { status })
      setCr(data)
      message.success('Status updated.')
    } catch {
      message.error('Failed to update status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handlePriorityChange(priority: string) {
    setUpdatingPriority(true)
    try {
      const { data } = await client.patch<ChangeRequest>(`/changes/${id}/`, { priority })
      setCr(data)
      message.success('Priority updated.')
    } catch {
      message.error('Failed to update priority.')
    } finally {
      setUpdatingPriority(false)
    }
  }

  async function handleAssigneeChange(userId: string | null) {
    setUpdatingAssignee(true)
    try {
      const { data } = await client.post<ChangeRequest>(`/changes/${id}/assign/`, { user_id: userId })
      setCr(data)
      message.success(userId ? 'Assignee updated.' : 'Change unassigned.')
    } catch {
      message.error('Failed to update assignee.')
    } finally {
      setUpdatingAssignee(false)
    }
  }

  // ── Description inline edit ─────────────────────────────────────────────────

  function startEditDesc() {
    setDescDraft(cr?.description ?? '')
    setEditingDesc(true)
  }

  async function saveDesc() {
    setSavingDesc(true)
    try {
      const { data } = await client.patch<ChangeRequest>(`/changes/${id}/`, { description: descDraft })
      setCr(data)
      setEditingDesc(false)
      message.success('Description updated.')
    } catch {
      message.error('Failed to update description.')
    } finally {
      setSavingDesc(false)
    }
  }

  // ── Due date inline edit ────────────────────────────────────────────────────

  function startEditDueDate() {
    setDueDateDraft(cr?.due_date ? dayjs(cr.due_date) : null)
    setEditingDueDate(true)
  }

  async function saveDueDate() {
    setSavingDueDate(true)
    try {
      const { data } = await client.patch<ChangeRequest>(`/changes/${id}/`, {
        due_date: dueDateDraft ? dueDateDraft.format('YYYY-MM-DD') : null,
      })
      setCr(data)
      setEditingDueDate(false)
      message.success('Due date updated.')
    } catch {
      message.error('Failed to update due date.')
    } finally {
      setSavingDueDate(false)
    }
  }

  // ── Story points inline edit ────────────────────────────────────────────────

  function startEditPoints() {
    setPointsDraft(cr?.story_points ?? null)
    setEditingPoints(true)
  }

  async function savePoints() {
    setSavingPoints(true)
    try {
      const { data } = await client.patch<ChangeRequest>(`/changes/${id}/`, { story_points: pointsDraft })
      setCr(data)
      setEditingPoints(false)
      message.success('Story points updated.')
    } catch {
      message.error('Failed to update story points.')
    } finally {
      setSavingPoints(false)
    }
  }

  // ── Hours inline edit ───────────────────────────────────────────────────────

  function startEditHours() {
    setEstHoursDraft(cr?.estimated_hours ?? null)
    setActHoursDraft(cr?.actual_hours ?? null)
    setEditingHours(true)
  }

  async function saveHours() {
    setSavingHours(true)
    try {
      const { data } = await client.patch<ChangeRequest>(`/changes/${id}/`, {
        estimated_hours: estHoursDraft,
        actual_hours: actHoursDraft,
      })
      setCr(data)
      setEditingHours(false)
      message.success('Hours updated.')
    } catch {
      message.error('Failed to update hours.')
    } finally {
      setSavingHours(false)
    }
  }

  // ── Labels inline edit ──────────────────────────────────────────────────────

  function startEditLabels() {
    setLabelsDraft(cr?.labels ? cr.labels.split(',').map(l => l.trim()).filter(Boolean) : [])
    setEditingLabels(true)
  }

  async function saveLabels() {
    setSavingLabels(true)
    try {
      const { data } = await client.patch<ChangeRequest>(`/changes/${id}/`, {
        labels: labelsDraft.join(','),
      })
      setCr(data)
      setEditingLabels(false)
      message.success('Labels updated.')
    } catch {
      message.error('Failed to update labels.')
    } finally {
      setSavingLabels(false)
    }
  }

  // ── Comment submit ──────────────────────────────────────────────────────────

  async function handleSubmitComment() {
    if (!commentBody.trim()) {
      message.warning('Comment cannot be empty.')
      return
    }
    setSubmittingComment(true)
    try {
      await client.post(`/changes/${id}/comments/`, { body: commentBody.trim() })
      setCommentBody('')
      await fetchComments()
      message.success('Comment added.')
    } catch {
      message.error('Failed to post comment.')
    } finally {
      setSubmittingComment(false)
    }
  }

  // ── Archive / Unarchive ─────────────────────────────────────────────────────

  async function handleArchiveConfirm(reason: string) {
    setArchiveLoading(true)
    try {
      await client.post(`/changes/${id}/archive/`, { reason })
      message.success('Change archived.')
      setArchiveOpen(false)
      navigate('/changes')
    } catch {
      message.error('Failed to archive change.')
    } finally {
      setArchiveLoading(false)
    }
  }

  async function handleUnarchiveConfirm(reason: string) {
    setUnarchiveLoading(true)
    try {
      await client.post(`/changes/${id}/unarchive/`, { reason })
      message.success('Change restored.')
      setUnarchiveOpen(false)
      fetchCr()
    } catch {
      message.error('Failed to restore change.')
    } finally {
      setUnarchiveLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingCr) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!cr) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
        <ExclamationCircleFilled style={{ fontSize: 32, color: '#faad14', marginBottom: 12 }} />
        <div>Change request not found.</div>
        <Button type="link" onClick={() => navigate('/changes')}>Back to changes</Button>
      </div>
    )
  }

  const labelList = cr.labels ? cr.labels.split(',').map(l => l.trim()).filter(Boolean) : []

  return (
    <div>
      {/* Back button */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/changes')}
        style={{ marginBottom: 16 }}
      >
        Back to Changes
      </Button>

      {/* Archived banner */}
      {cr.is_archived && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, borderColor: '#fa8c16' }}
          message={
            <Space direction="vertical" size={2}>
              <Text strong>This change request is archived.</Text>
              {cr.archive_reason && <Text>Reason: {cr.archive_reason}</Text>}
            </Space>
          }
          action={
            isManager ? (
              <Button size="small" onClick={() => setUnarchiveOpen(true)}>
                Unarchive
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <Tag
            color="blue"
            style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13 }}
          >
            {cr.ref_number}
          </Tag>
          <Tag color={TYPE_COLORS[cr.change_type] ?? 'default'}>
            {cr.change_type.charAt(0).toUpperCase() + cr.change_type.slice(1)}
          </Tag>
          <Tag color={PRIORITY_COLORS[cr.priority] ?? 'default'}>
            {cr.priority.charAt(0).toUpperCase() + cr.priority.slice(1)}
          </Tag>
          <Tag color={STATUS_COLORS[cr.status] ?? 'default'}>
            {humanStatus(cr.status)}
          </Tag>
          {cr.is_archived && (
            <Tag icon={<InboxOutlined />} color="orange">Archived</Tag>
          )}
        </div>
        <Title level={3} style={{ margin: 0 }}>{cr.title}</Title>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Description */}
          <Card
            title="Description"
            size="small"
            extra={
              isAgent && !editingDesc ? (
                <Button type="text" size="small" icon={<EditOutlined />} onClick={startEditDesc}>
                  Edit
                </Button>
              ) : null
            }
          >
            {editingDesc ? (
              <>
                <TextArea
                  rows={6}
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  autoFocus
                />
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" size="small" loading={savingDesc} onClick={saveDesc}>
                    Save
                  </Button>
                  <Button size="small" onClick={() => setEditingDesc(false)}>
                    Cancel
                  </Button>
                </Space>
              </>
            ) : cr.description ? (
              <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{cr.description}</Paragraph>
            ) : (
              <Text type="secondary">No description provided.</Text>
            )}
          </Card>

          {/* Comments + Activity tabs */}
          <Card size="small" bodyStyle={{ padding: 0 }}>
            <Tabs
              defaultActiveKey="comments"
              size="small"
              style={{ padding: '0 16px' }}
              items={[
                {
                  key: 'comments',
                  label: `Comments (${comments.length})`,
                  children: (
                    <div style={{ padding: '0 0 16px' }}>
                      {loadingComments ? (
                        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                      ) : comments.length === 0 ? (
                        <Text type="secondary">No comments yet.</Text>
                      ) : (
                        <div>
                          {comments.map(c => (
                            <CommentItem key={c.id} comment={c} />
                          ))}
                        </div>
                      )}

                      <Divider style={{ margin: '16px 0' }} />

                      <div>
                        <Text strong style={{ fontSize: 13 }}>Add Comment</Text>
                        <TextArea
                          rows={4}
                          placeholder="Write a comment…"
                          value={commentBody}
                          onChange={e => setCommentBody(e.target.value)}
                          style={{ marginTop: 8 }}
                        />
                        <Button
                          type="primary"
                          style={{ marginTop: 8 }}
                          loading={submittingComment}
                          onClick={handleSubmitComment}
                        >
                          Post Comment
                        </Button>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'activity',
                  label: 'Activity',
                  children: (
                    <div style={{ padding: '8px 0 16px' }}>
                      <ActivityFeed module="changes" recordId={cr.id} />
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </div>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <Card title="Details" size="small">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Status */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Status</Text>
              {isAgent ? (
                <Select
                  value={cr.status}
                  onChange={handleStatusChange}
                  loading={updatingStatus}
                  style={{ width: '100%' }}
                  size="small"
                >
                  {STATUS_OPTIONS.map(s => (
                    <Option key={s} value={s}>
                      <Tag color={STATUS_COLORS[s] ?? 'default'} style={{ marginRight: 0 }}>
                        {humanStatus(s)}
                      </Tag>
                    </Option>
                  ))}
                </Select>
              ) : (
                <Tag color={STATUS_COLORS[cr.status] ?? 'default'}>{humanStatus(cr.status)}</Tag>
              )}
            </div>

            {/* Priority */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Priority</Text>
              {isAgent ? (
                <Select
                  value={cr.priority}
                  onChange={handlePriorityChange}
                  loading={updatingPriority}
                  style={{ width: '100%' }}
                  size="small"
                >
                  {PRIORITY_OPTIONS.map(p => (
                    <Option key={p} value={p}>
                      <Tag color={PRIORITY_COLORS[p] ?? 'default'} style={{ marginRight: 0 }}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </Tag>
                    </Option>
                  ))}
                </Select>
              ) : (
                <Tag color={PRIORITY_COLORS[cr.priority] ?? 'default'}>
                  {cr.priority.charAt(0).toUpperCase() + cr.priority.slice(1)}
                </Tag>
              )}
            </div>

            {/* Assignee */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Assignee</Text>
              {isAgent ? (
                <Select
                  showSearch
                  allowClear
                  value={cr.assignee ?? null}
                  onChange={val => handleAssigneeChange(val ?? null)}
                  loading={updatingAssignee}
                  placeholder="Unassigned"
                  style={{ width: '100%' }}
                  size="small"
                  filterOption={(input, option) =>
                    String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {users.map(u => (
                    <Option key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </Option>
                  ))}
                </Select>
              ) : (
                <Space>
                  <Avatar
                    size={22}
                    icon={cr.assignee ? undefined : <UserOutlined />}
                    style={{ backgroundColor: cr.assignee ? '#1677ff' : '#d9d9d9', fontSize: 10, fontWeight: 600 }}
                  >
                    {cr.assignee ? initials(cr.assignee_full_name || cr.assignee_email || '?') : undefined}
                  </Avatar>
                  <Text style={{ fontSize: 13 }}>
                    {cr.assignee_full_name || cr.assignee_email || (
                      <span style={{ color: '#bbb' }}>Unassigned</span>
                    )}
                  </Text>
                </Space>
              )}
            </div>

            <Divider style={{ margin: '4px 0' }} />

            {/* Reporter */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Reporter</Text>
              <Text style={{ fontSize: 13 }}>{cr.reporter_full_name || cr.reporter_email || '—'}</Text>
              {cr.reporter_email && (
                <div><Text type="secondary" style={{ fontSize: 12 }}>{cr.reporter_email}</Text></div>
              )}
            </div>

            {/* Due Date */}
            <InlineEditField
              label="Due Date"
              canEdit={isAgent}
              editing={editingDueDate}
              saving={savingDueDate}
              onEdit={startEditDueDate}
              onSave={saveDueDate}
              onCancel={() => setEditingDueDate(false)}
              display={
                cr.due_date ? (
                  <Tooltip title={dayjs(cr.due_date).format('DD MMM YYYY')}>
                    <Text
                      style={{
                        fontSize: 13,
                        color: dayjs(cr.due_date).isBefore(dayjs(), 'day') ? '#ff4d4f' : undefined,
                      }}
                    >
                      {dayjs(cr.due_date).format('DD MMM YYYY')}
                    </Text>
                  </Tooltip>
                ) : (
                  <Text type="secondary" style={{ fontSize: 13 }}>—</Text>
                )
              }
              editor={
                <DatePicker
                  value={dueDateDraft}
                  onChange={d => setDueDateDraft(d)}
                  style={{ width: '100%' }}
                  size="small"
                  autoFocus
                />
              }
            />

            {/* Story Points */}
            <InlineEditField
              label="Story Points"
              canEdit={isAgent}
              editing={editingPoints}
              saving={savingPoints}
              onEdit={startEditPoints}
              onSave={savePoints}
              onCancel={() => setEditingPoints(false)}
              display={
                <Text style={{ fontSize: 13 }}>
                  {cr.story_points !== null ? cr.story_points : <span style={{ color: '#bbb' }}>—</span>}
                </Text>
              }
              editor={
                <InputNumber
                  value={pointsDraft}
                  onChange={v => setPointsDraft(v ?? null)}
                  min={1}
                  max={100}
                  style={{ width: '100%' }}
                  size="small"
                  autoFocus
                />
              }
            />

            {/* Estimated / Actual Hours */}
            <InlineEditField
              label="Hours (est / actual)"
              canEdit={isAgent}
              editing={editingHours}
              saving={savingHours}
              onEdit={startEditHours}
              onSave={saveHours}
              onCancel={() => setEditingHours(false)}
              display={
                <Text style={{ fontSize: 13 }}>
                  {cr.estimated_hours !== null ? `${cr.estimated_hours} hrs estimated` : '— estimated'}
                  {', '}
                  {cr.actual_hours !== null ? `${cr.actual_hours} hrs actual` : '— actual'}
                </Text>
              }
              editor={
                <Space direction="vertical" style={{ width: '100%' }}>
                  <InputNumber
                    value={estHoursDraft}
                    onChange={v => setEstHoursDraft(v ?? null)}
                    min={0}
                    placeholder="Estimated hrs"
                    style={{ width: '100%' }}
                    size="small"
                    addonBefore="Est"
                    autoFocus
                  />
                  <InputNumber
                    value={actHoursDraft}
                    onChange={v => setActHoursDraft(v ?? null)}
                    min={0}
                    placeholder="Actual hrs"
                    style={{ width: '100%' }}
                    size="small"
                    addonBefore="Act"
                  />
                </Space>
              }
            />

            {/* Labels */}
            <InlineEditField
              label="Labels"
              canEdit={isAgent}
              editing={editingLabels}
              saving={savingLabels}
              onEdit={startEditLabels}
              onSave={saveLabels}
              onCancel={() => setEditingLabels(false)}
              display={
                labelList.length > 0 ? (
                  <Space wrap size={4}>
                    {labelList.map(l => <Tag key={l}>{l}</Tag>)}
                  </Space>
                ) : (
                  <Text type="secondary" style={{ fontSize: 13 }}>—</Text>
                )
              }
              editor={
                <Select
                  mode="tags"
                  value={labelsDraft}
                  onChange={setLabelsDraft}
                  tokenSeparators={[',']}
                  style={{ width: '100%' }}
                  size="small"
                  autoFocus
                />
              }
            />

            {/* Created */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Created</Text>
              <Tooltip title={dayjs(cr.created_at).format('DD MMM YYYY, HH:mm')}>
                <Text style={{ fontSize: 13 }}>{dayjs(cr.created_at).fromNow()}</Text>
              </Tooltip>
            </div>

            {/* Archive button */}
            {isManager && !cr.is_archived && (
              <>
                <Divider style={{ margin: '4px 0' }} />
                <Button
                  danger
                  icon={<InboxOutlined />}
                  size="small"
                  onClick={() => setArchiveOpen(true)}
                  style={{ width: '100%' }}
                >
                  Archive Change
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Archive Modal */}
      <ReasonModal
        open={archiveOpen}
        title="Archive Change Request"
        description="Archived change requests are hidden from all active views."
        okText="Archive"
        okDanger
        loading={archiveLoading}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setArchiveOpen(false)}
      />

      {/* Unarchive Modal */}
      <ReasonModal
        open={unarchiveOpen}
        title="Restore Change from Archive"
        description="The change request will be restored and visible in the active list."
        okText="Restore"
        loading={unarchiveLoading}
        onConfirm={handleUnarchiveConfirm}
        onCancel={() => setUnarchiveOpen(false)}
      />
    </div>
  )
}
