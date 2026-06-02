import { useEffect, useState } from 'react'
import { Timeline, Spin, Typography, Tooltip } from 'antd'
import {
  PlusCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  LoginOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import client from '../api/client'

dayjs.extend(relativeTime)

const { Text, Link } = Typography

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string | number
  user_email: string
  action: 'create' | 'update' | 'delete' | 'login' | 'logout'
  module: string
  record_id: string
  record_repr: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  ip_address: string | null
  timestamp: string
}

interface ActivityFeedProps {
  module: string
  recordId: string
  maxHeight?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(value: string | null | undefined, max = 50): string {
  if (!value) return ''
  const str = String(value)
  return str.length > max ? str.slice(0, max) + '…' : str
}

function actionIcon(action: AuditEntry['action']) {
  switch (action) {
    case 'create':
      return <PlusCircleOutlined style={{ color: '#52c41a' }} />
    case 'update':
      return <EditOutlined style={{ color: '#1677ff' }} />
    case 'delete':
      return <DeleteOutlined style={{ color: '#ff4d4f' }} />
    case 'login':
      return <LoginOutlined style={{ color: '#13c2c2' }} />
    case 'logout':
      return <LogoutOutlined />
    default:
      return <EditOutlined />
  }
}

function actionColor(action: AuditEntry['action']): string {
  switch (action) {
    case 'create':
      return 'green'
    case 'update':
      return 'blue'
    case 'delete':
      return 'red'
    case 'login':
      return 'cyan'
    default:
      return 'gray'
  }
}

function actionSummary(entry: AuditEntry): React.ReactNode {
  switch (entry.action) {
    case 'create':
      return <span>Created this record</span>
    case 'delete':
      return <span>Archived / deleted this record</span>
    case 'update':
      if (entry.field_name) {
        const oldStr = truncate(entry.old_value)
        const newStr = truncate(entry.new_value)
        return (
          <span>
            Changed <Text strong>{entry.field_name}</Text>
            {(oldStr || newStr) && (
              <Text type="secondary" style={{ marginLeft: 4, fontSize: 12 }}>
                {oldStr || '—'} → {newStr || '—'}
              </Text>
            )}
          </span>
        )
      }
      return <span>Updated record</span>
    case 'login':
      return <span>Logged in</span>
    case 'logout':
      return <span>Logged out</span>
    default:
      return <span>Performed action: {entry.action}</span>
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_VISIBLE = 5

export default function ActivityFeed({ module, recordId, maxHeight = 480 }: ActivityFeedProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!recordId) return
    setLoading(true)
    setError(null)

    client
      .get<{ results?: AuditEntry[] } | AuditEntry[]>('/audit/', {
        params: {
          module,
          record_id: recordId,
          ordering: '-timestamp',
          page_size: 200,
        },
      })
      .then(({ data }) => {
        const list = Array.isArray(data)
          ? data
          : (data as { results?: AuditEntry[] }).results ?? []
        setEntries(list)
      })
      .catch(() => setError('Failed to load activity.'))
      .finally(() => setLoading(false))
  }, [module, recordId])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <Spin />
      </div>
    )
  }

  if (error) {
    return (
      <Text type="secondary" style={{ fontSize: 13 }}>
        {error}
      </Text>
    )
  }

  if (entries.length === 0) {
    return (
      <Text type="secondary" style={{ fontSize: 13 }}>
        No activity recorded yet.
      </Text>
    )
  }

  const visible = showAll ? entries : entries.slice(0, DEFAULT_VISIBLE)

  return (
    <div style={{ maxHeight: showAll ? maxHeight : undefined, overflowY: showAll ? 'auto' : undefined }}>
      <Timeline
        items={visible.map(entry => ({
          color: actionColor(entry.action),
          dot: actionIcon(entry.action),
          children: (
            <div style={{ paddingBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <Text strong style={{ fontSize: 13 }}>
                  {entry.user_email}
                </Text>
                <Text style={{ fontSize: 13 }}>{actionSummary(entry)}</Text>
              </div>
              <Tooltip title={dayjs(entry.timestamp).format('DD MMM YYYY, HH:mm:ss')}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(entry.timestamp).fromNow()}
                </Text>
              </Tooltip>
            </div>
          ),
        }))}
      />

      {entries.length > DEFAULT_VISIBLE && (
        <div style={{ marginTop: 4 }}>
          {showAll ? (
            <Link onClick={() => setShowAll(false)} style={{ fontSize: 12 }}>
              Show less
            </Link>
          ) : (
            <Link onClick={() => setShowAll(true)} style={{ fontSize: 12 }}>
              Show all {entries.length} entries
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
