import { useEffect, useState, useRef } from 'react'
import {
  Typography, Tag, Card, Button, Select, Avatar, Spin, message,
  Tooltip, Divider, Space, Badge, Input, Switch, Alert, Modal, Tabs,
} from 'antd'
import {
  ArrowLeftOutlined, UserOutlined, MailOutlined,
  TeamOutlined, GlobalOutlined, ExclamationCircleFilled, InboxOutlined,
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

// ── Types ────────────────────────────────────────────────────────────────────

interface TicketCategory {
  id: number
  name: string
}

interface Ticket {
  id: string
  ticket_number: string
  subject: string
  description: string
  status: string
  priority: string
  source: string
  category: TicketCategory | null
  requestor: string | null
  requestor_email: string | null
  requestor_name: string | null
  assignee: string | null
  assignee_email: string | null
  assignee_name: string | null
  sla_due_at: string | null
  sla_breached: boolean
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
  is_archived: boolean
  archived_at: string | null
  archived_by_email: string | null
  archive_reason: string
  attachments: Attachment[]
}

interface Attachment {
  id: string
  file: string            // absolute URL e.g. http://localhost:8000/media/...
  original_filename: string
  file_size: number
  uploaded_by_email: string | null
  created_at: string
}

interface Comment {
  id: string
  author: string
  author_email: string
  author_name: string
  body: string
  comment_type: 'reply' | 'note'
  source: string
  created_at: string
  attachments?: Attachment[]
}

interface CannedResponse {
  id: number
  name: string
  body: string
}

interface AgentUser {
  id: string
  email: string
  full_name: string
}

// ── Color maps ────────────────────────────────────────────────────────────────

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

const STATUS_OPTIONS = ['open', 'in_progress', 'pending_info', 'resolved', 'closed']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical']

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

function labelFromKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function SourceBadge({ source }: { source: string }) {
  const icons: Record<string, React.ReactNode> = {
    email: <MailOutlined />,
    teams: <TeamOutlined />,
    portal: <GlobalOutlined />,
  }
  return (
    <Tag icon={icons[source] ?? <GlobalOutlined />} color="default">
      {source.charAt(0).toUpperCase() + source.slice(1)}
    </Tag>
  )
}

// ── Sub-component: Comment item ───────────────────────────────────────────────

function CommentItem({ comment, canSeeNotes }: { comment: Comment; canSeeNotes: boolean }) {
  if (comment.comment_type === 'note' && !canSeeNotes) return null

  const isNote = comment.comment_type === 'note'
  const name = comment.author_name || comment.author_email || 'Unknown'

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 0',
        borderBottom: '1px solid #f5f5f5',
      }}
    >
      <Avatar
        size={36}
        style={{
          backgroundColor: isNote ? '#8c8c8c' : '#1677ff',
          flexShrink: 0,
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {initials(name)}
      </Avatar>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Text strong style={{ fontSize: 13 }}>{name}</Text>
          {isNote && (
            <Tag color="default" style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
              Internal Note
            </Tag>
          )}
          <Tooltip title={dayjs(comment.created_at).format('DD MMM YYYY, HH:mm')}>
            <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(comment.created_at).fromNow()}</Text>
          </Tooltip>
        </div>
        <div
          style={{
            background: isNote ? '#fafafa' : undefined,
            border: isNote ? '1px dashed #d9d9d9' : undefined,
            borderRadius: 6,
            padding: isNote ? '8px 12px' : undefined,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 13,
            color: '#333',
          }}
        >
          {comment.body}
        </div>
      </div>
    </div>
  )
}

// ── Archive reason modal (inline) ─────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  const isAgent = ['super_admin', 'it_manager', 'it_agent'].includes(user?.role_name ?? '')
  const isManager = ['super_admin', 'it_manager'].includes(user?.role_name ?? '')
  const canSeeNotes = isAgent

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingTicket, setLoadingTicket] = useState(true)
  const [loadingComments, setLoadingComments] = useState(false)

  // Reply form
  const [replyBody, setReplyBody] = useState('')
  const [isNote, setIsNote] = useState(false)
  const [submittingReply, setSubmittingReply] = useState(false)

  // Canned responses
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([])
  const [cannedLoading, setCannedLoading] = useState(false)

  // Agent user list (for assignee)
  const [agentUsers, setAgentUsers] = useState<AgentUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Inline update states
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingPriority, setUpdatingPriority] = useState(false)
  const [updatingAssignee, setUpdatingAssignee] = useState(false)

  // Archive / unarchive modals
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [unarchiveOpen, setUnarchiveOpen] = useState(false)
  const [unarchiveLoading, setUnarchiveLoading] = useState(false)

  const replyRef = useRef<HTMLTextAreaElement>(null)

  // ── Fetch ticket ────────────────────────────────────────────────────────────

  async function fetchTicket() {
    setLoadingTicket(true)
    try {
      const { data } = await client.get<Ticket>(`/tickets/${id}/`)
      setTicket(data)
    } catch {
      message.error('Failed to load ticket.')
    } finally {
      setLoadingTicket(false)
    }
  }

  async function fetchComments() {
    setLoadingComments(true)
    try {
      const { data } = await client.get<Comment[]>(`/tickets/${id}/comments/`)
      setComments(Array.isArray(data) ? data : (data as { results: Comment[] }).results ?? [])
    } catch {
      message.error('Failed to load comments.')
    } finally {
      setLoadingComments(false)
    }
  }

  useEffect(() => {
    if (!id) return
    fetchTicket()
    fetchComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Load agent users when ticket is ready and user is an agent
  useEffect(() => {
    if (!isAgent || !ticket) return
    setLoadingUsers(true)
    client.get<AgentUser[]>('/users/')
      .then(({ data }) => setAgentUsers(Array.isArray(data) ? data : (data as { results: AgentUser[] }).results ?? []))
      .catch(() => { /* non-critical */ })
      .finally(() => setLoadingUsers(false))
  }, [isAgent, ticket])

  // Load canned responses when ticket category is known
  useEffect(() => {
    if (!ticket?.category?.id) return
    setCannedLoading(true)
    client.get<CannedResponse[]>('/canned-responses/', {
      params: { category_id: ticket.category.id },
    })
      .then(({ data }) => setCannedResponses(Array.isArray(data) ? data : (data as { results: CannedResponse[] }).results ?? []))
      .catch(() => { /* non-critical */ })
      .finally(() => setCannedLoading(false))
  }, [ticket?.category?.id])

  // ── Inline updates ──────────────────────────────────────────────────────────

  async function handleStatusChange(status: string) {
    setUpdatingStatus(true)
    try {
      const { data } = await client.post<Ticket>(`/tickets/${id}/status/`, { status })
      setTicket(data)
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
      const { data } = await client.patch<Ticket>(`/tickets/${id}/`, { priority })
      setTicket(data)
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
      const { data } = await client.post<Ticket>(`/tickets/${id}/assign/`, { user_id: userId })
      setTicket(data)
      message.success(userId ? 'Assignee updated.' : 'Ticket unassigned.')
    } catch {
      message.error('Failed to update assignee.')
    } finally {
      setUpdatingAssignee(false)
    }
  }

  // ── Submit reply ────────────────────────────────────────────────────────────

  async function handleSubmitReply() {
    if (!replyBody.trim()) {
      message.warning('Reply cannot be empty.')
      return
    }
    setSubmittingReply(true)
    try {
      await client.post(`/tickets/${id}/comments/`, {
        body: replyBody.trim(),
        comment_type: isNote ? 'note' : 'reply',
      })
      setReplyBody('')
      setIsNote(false)
      await fetchComments()
      message.success(isNote ? 'Note added.' : 'Reply sent.')
    } catch {
      message.error('Failed to post reply.')
    } finally {
      setSubmittingReply(false)
    }
  }

  function handleCannedSelect(responseId: number) {
    const cr = cannedResponses.find(r => r.id === responseId)
    if (cr) setReplyBody(cr.body)
  }

  // ── Archive / Unarchive ─────────────────────────────────────────────────────

  async function handleArchiveConfirm(reason: string) {
    setArchiveLoading(true)
    try {
      await client.post(`/tickets/${id}/archive/`, { reason })
      message.success('Ticket archived.')
      setArchiveOpen(false)
      navigate('/tickets')
    } catch {
      message.error('Failed to archive ticket.')
    } finally {
      setArchiveLoading(false)
    }
  }

  async function handleUnarchiveConfirm(reason: string) {
    setUnarchiveLoading(true)
    try {
      await client.post(`/tickets/${id}/unarchive/`, { reason })
      message.success('Ticket restored.')
      setUnarchiveOpen(false)
      fetchTicket()
    } catch {
      message.error('Failed to restore ticket.')
    } finally {
      setUnarchiveLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingTicket) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
        <ExclamationCircleFilled style={{ fontSize: 32, color: '#faad14', marginBottom: 12 }} />
        <div>Ticket not found.</div>
        <Button type="link" onClick={() => navigate('/tickets')}>Back to tickets</Button>
      </div>
    )
  }

  const customFieldEntries = Object.entries(ticket.custom_fields ?? {}).filter(([, v]) => v !== null && v !== '')

  return (
    <div>
      {/* Back button */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/tickets')}
        style={{ marginBottom: 16 }}
      >
        Back to Tickets
      </Button>

      {/* Archived banner */}
      {ticket.is_archived && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, borderColor: '#fa8c16' }}
          message={
            <Space direction="vertical" size={2}>
              <Text strong>This ticket is archived.</Text>
              <Text>
                Archived by: <strong>{ticket.archived_by_email ?? '—'}</strong>
                {ticket.archived_at && (
                  <> on <strong>{dayjs(ticket.archived_at).format('DD MMM YYYY, HH:mm')}</strong></>
                )}
              </Text>
              {ticket.archive_reason && (
                <Text>Reason: {ticket.archive_reason}</Text>
              )}
            </Space>
          }
          action={
            isManager ? (
              <Button
                size="small"
                onClick={() => setUnarchiveOpen(true)}
              >
                Unarchive
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Ticket header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 13 }}>
            {ticket.ticket_number}
          </Text>
          <Tag color={STATUS_COLORS[ticket.status] ?? 'default'}>
            {ticket.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </Tag>
          <Tag color={PRIORITY_COLORS[ticket.priority] ?? 'default'}>
            {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
          </Tag>
          <SourceBadge source={ticket.source} />
          {ticket.sla_breached && (
            <Tag icon={<ExclamationCircleFilled />} color="red">SLA Breached</Tag>
          )}
          {ticket.is_archived && (
            <Tag icon={<InboxOutlined />} color="orange">Archived</Tag>
          )}
        </div>
        <Title level={3} style={{ margin: 0 }}>{ticket.subject}</Title>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Description */}
          <Card title="Description" size="small">
            {ticket.description ? (
              <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{ticket.description}</Paragraph>
            ) : (
              <Text type="secondary">No description provided.</Text>
            )}
          </Card>

          {/* Attachments — images and files from email or uploads */}
          {ticket.attachments && ticket.attachments.length > 0 && (
            <Card
              title={`Attachments (${ticket.attachments.length})`}
              size="small"
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {ticket.attachments.map(att => {
                  const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(att.original_filename)
                  const sizeKB = Math.round((att.file_size || 0) / 1024)
                  return (
                    <div key={att.id} style={{ textAlign: 'center', maxWidth: 140 }}>
                      {isImage ? (
                        <a href={att.file} target="_blank" rel="noreferrer">
                          <img
                            src={att.file}
                            alt={att.original_filename}
                            style={{
                              width: 120, height: 90, objectFit: 'cover',
                              borderRadius: 6, border: '1px solid #f0f0f0',
                              display: 'block', cursor: 'pointer',
                            }}
                            onError={e => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        </a>
                      ) : (
                        <a
                          href={att.file}
                          download={att.original_filename}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            padding: '12px 8px', border: '1px solid #f0f0f0',
                            borderRadius: 6, textDecoration: 'none', color: '#595959',
                            width: 120, cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: 28 }}>📎</span>
                          <span style={{ fontSize: 11, marginTop: 4, textAlign: 'center',
                            wordBreak: 'break-all', lineHeight: 1.3 }}>
                            {att.original_filename.length > 20
                              ? att.original_filename.slice(0, 18) + '…'
                              : att.original_filename}
                          </span>
                        </a>
                      )}
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                        {sizeKB > 0 ? `${sizeKB} KB` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Comments + Activity tabs */}
          <Card size="small" bodyStyle={{ padding: 0 }}>
            <Tabs
              defaultActiveKey="comments"
              size="small"
              style={{ padding: '0 16px' }}
              items={[
                {
                  key: 'comments',
                  label: `Comments (${comments.filter(c => canSeeNotes || c.comment_type !== 'note').length})`,
                  children: (
                    <div style={{ padding: '0 0 16px' }}>
                      {loadingComments ? (
                        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                      ) : comments.length === 0 ? (
                        <Text type="secondary">No comments yet.</Text>
                      ) : (
                        <div>
                          {comments.map(c => (
                            <CommentItem key={c.id} comment={c} canSeeNotes={canSeeNotes} />
                          ))}
                        </div>
                      )}

                      <Divider style={{ margin: '16px 0' }} />

                      {/* Reply form */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                          <Text strong style={{ fontSize: 13 }}>
                            {isAgent ? (isNote ? 'Add Internal Note' : 'Public Reply') : 'Add Reply'}
                          </Text>
                          <Space>
                            {/* Canned response picker */}
                            {isAgent && cannedResponses.length > 0 && (
                              <Select
                                placeholder="Use canned response"
                                style={{ width: 200 }}
                                loading={cannedLoading}
                                onChange={handleCannedSelect}
                                value={null}
                                size="small"
                              >
                                {cannedResponses.map(cr => (
                                  <Option key={cr.id} value={cr.id}>{cr.name}</Option>
                                ))}
                              </Select>
                            )}
                            {/* Note / Reply toggle for agents */}
                            {isAgent && (
                              <Space size={6}>
                                <Text style={{ fontSize: 12, color: '#555' }}>Internal note</Text>
                                <Switch
                                  size="small"
                                  checked={isNote}
                                  onChange={setIsNote}
                                />
                              </Space>
                            )}
                          </Space>
                        </div>

                        <TextArea
                          ref={replyRef}
                          rows={4}
                          placeholder={isNote ? 'Add an internal note (only visible to agents)…' : 'Write a reply…'}
                          value={replyBody}
                          onChange={e => setReplyBody(e.target.value)}
                          style={{
                            background: isNote ? '#fafafa' : undefined,
                            border: isNote ? '1px dashed #d9d9d9' : undefined,
                          }}
                        />
                        <Button
                          type="primary"
                          style={{ marginTop: 8 }}
                          loading={submittingReply}
                          onClick={handleSubmitReply}
                          ghost={isNote}
                        >
                          {isNote ? 'Add Note' : 'Send Reply'}
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
                      <ActivityFeed module="tickets" recordId={ticket.id} />
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
                  value={ticket.status}
                  onChange={handleStatusChange}
                  loading={updatingStatus}
                  style={{ width: '100%' }}
                  size="small"
                >
                  {STATUS_OPTIONS.map(s => (
                    <Option key={s} value={s}>
                      <Tag color={STATUS_COLORS[s] ?? 'default'} style={{ marginRight: 0 }}>
                        {s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </Tag>
                    </Option>
                  ))}
                </Select>
              ) : (
                <Tag color={STATUS_COLORS[ticket.status] ?? 'default'}>
                  {ticket.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </Tag>
              )}
            </div>

            {/* Priority */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Priority</Text>
              {isAgent ? (
                <Select
                  value={ticket.priority}
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
                <Tag color={PRIORITY_COLORS[ticket.priority] ?? 'default'}>
                  {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
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
                  value={ticket.assignee ?? null}
                  onChange={val => handleAssigneeChange(val ?? null)}
                  loading={loadingUsers || updatingAssignee}
                  placeholder="Unassigned"
                  style={{ width: '100%' }}
                  size="small"
                  filterOption={(input, option) =>
                    String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {agentUsers.map(u => (
                    <Option key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </Option>
                  ))}
                </Select>
              ) : (
                <Space>
                  <UserOutlined style={{ color: '#aaa' }} />
                  <Text>{ticket.assignee_name || ticket.assignee_email || <span style={{ color: '#bbb' }}>Unassigned</span>}</Text>
                </Space>
              )}
            </div>

            <Divider style={{ margin: '4px 0' }} />

            {/* Requestor */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Requestor</Text>
              <Text style={{ fontSize: 13 }}>{ticket.requestor_name || ticket.requestor_email || '—'}</Text>
              {ticket.requestor_email && (
                <div><Text type="secondary" style={{ fontSize: 12 }}>{ticket.requestor_email}</Text></div>
              )}
            </div>

            {/* Category */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Category</Text>
              <Text style={{ fontSize: 13 }}>{ticket.category?.name ?? '—'}</Text>
            </div>

            {/* Source */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Source</Text>
              <SourceBadge source={ticket.source} />
            </div>

            {/* Created */}
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Created</Text>
              <Tooltip title={dayjs(ticket.created_at).format('DD MMM YYYY, HH:mm')}>
                <Text style={{ fontSize: 13 }}>{dayjs(ticket.created_at).fromNow()}</Text>
              </Tooltip>
            </div>

            {/* SLA */}
            {ticket.sla_due_at && (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>SLA Due</Text>
                <Tooltip title={dayjs(ticket.sla_due_at).format('DD MMM YYYY, HH:mm')}>
                  {ticket.sla_breached ? (
                    <Badge
                      status="error"
                      text={
                        <Text style={{ color: '#ff4d4f', fontSize: 13 }}>
                          Breached ({dayjs(ticket.sla_due_at).fromNow()})
                        </Text>
                      }
                    />
                  ) : (
                    <Badge
                      status="success"
                      text={<Text style={{ fontSize: 13 }}>{dayjs(ticket.sla_due_at).fromNow()}</Text>}
                    />
                  )}
                </Tooltip>
              </div>
            )}

            {/* Archive action */}
            {isAgent && !ticket.is_archived && (
              <>
                <Divider style={{ margin: '4px 0' }} />
                <Button
                  danger
                  icon={<InboxOutlined />}
                  size="small"
                  onClick={() => setArchiveOpen(true)}
                  style={{ width: '100%' }}
                >
                  Archive Ticket
                </Button>
              </>
            )}

            {/* Custom fields */}
            {customFieldEntries.length > 0 && (
              <>
                <Divider style={{ margin: '4px 0' }} />
                {customFieldEntries.map(([key, val]) => (
                  <div key={key}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
                      {labelFromKey(key)}
                    </Text>
                    <Text style={{ fontSize: 13 }}>
                      {Array.isArray(val) ? val.join(', ') : String(val)}
                    </Text>
                  </div>
                ))}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Archive Modal */}
      <ReasonModal
        open={archiveOpen}
        title="Archive Ticket"
        description="Archived tickets are hidden from all active views."
        okText="Archive"
        okDanger
        loading={archiveLoading}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setArchiveOpen(false)}
      />

      {/* Unarchive Modal */}
      <ReasonModal
        open={unarchiveOpen}
        title="Restore Ticket from Archive"
        description="The ticket will be restored and visible in the active tickets list."
        okText="Restore"
        loading={unarchiveLoading}
        onConfirm={handleUnarchiveConfirm}
        onCancel={() => setUnarchiveOpen(false)}
      />
    </div>
  )
}
