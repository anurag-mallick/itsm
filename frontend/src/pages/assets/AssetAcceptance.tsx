import { useEffect, useState } from 'react'
import {
  Button, Card, Descriptions, Popconfirm, Result, Spin,
  Typography, Input, Space,
} from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, DesktopOutlined } from '@ant-design/icons'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AcceptanceDetail {
  id: string
  asset_tag: string
  name: string
  asset_type: string
  status: string
  acceptance_status: string
  already_actioned: boolean
  assigned_to_name: string | null
  assigned_to_email: string | null
}

type PageState = 'loading' | 'error' | 'actioned' | 'pending' | 'done'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? window.location.origin + '/api'
  : 'http://localhost:8000/api'
)

function buildUrl(assetId: string, suffix = '') {
  return `${API_BASE}/assets/hardware/${assetId}/accept${suffix}/`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssetAcceptance() {
  const { assetId } = useParams<{ assetId: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [pageState, setPageState] = useState<PageState>('loading')
  const [detail, setDetail] = useState<AcceptanceDetail | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [notes, setNotes] = useState('')
  const [actionLoading, setActionLoading] = useState<'accept' | 'reject' | null>(null)
  const [doneMessage, setDoneMessage] = useState('')
  const [doneAccepted, setDoneAccepted] = useState(false)

  // Fetch asset details on mount
  useEffect(() => {
    if (!assetId || !token) {
      setErrorMsg('This acceptance link is incomplete. Please use the link from your email.')
      setPageState('error')
      return
    }

    axios
      .get<AcceptanceDetail>(buildUrl(assetId), { params: { token } })
      .then(({ data }) => {
        setDetail(data)
        if (data.already_actioned) {
          setPageState('actioned')
        } else {
          setPageState('pending')
        }
      })
      .catch(err => {
        const msg =
          err?.response?.data?.detail ??
          'This link is invalid or has expired. Please contact the IT Service Desk.'
        setErrorMsg(msg)
        setPageState('error')
      })
  }, [assetId, token])

  const handleAction = async (action: 'accept' | 'reject') => {
    if (!assetId) return
    setActionLoading(action)
    try {
      const { data } = await axios.post<{ detail: string; acceptance_status: string }>(
        buildUrl(assetId, '/action'),
        { action, notes },
        { params: { token } },
      )
      setDoneMessage(data.detail)
      setDoneAccepted(action === 'accept')
      setPageState('done')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      const msg = axiosErr?.response?.data?.detail ?? 'An error occurred. Please try again.'
      setErrorMsg(msg)
      setPageState('error')
    } finally {
      setActionLoading(null)
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const returnLink = (
    <Link to="/login">
      <Button type="link" style={{ padding: 0 }}>Return to Login</Button>
    </Link>
  )

  if (pageState === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" tip="Loading assignment details…" />
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 24 }}>
        <Result
          status="error"
          title="Invalid Acceptance Link"
          subTitle={errorMsg}
          extra={returnLink}
        />
      </div>
    )
  }

  if (pageState === 'actioned' && detail) {
    const isAccepted = detail.acceptance_status === 'accepted'
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 24 }}>
        <Result
          status={isAccepted ? 'success' : 'warning'}
          title={`Assignment Already ${isAccepted ? 'Accepted' : 'Rejected'}`}
          subTitle={`This asset assignment (${detail.asset_tag}) has already been ${detail.acceptance_status}. No further action is required.`}
          extra={returnLink}
        />
      </div>
    )
  }

  if (pageState === 'done') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: 24 }}>
        <Result
          status={doneAccepted ? 'success' : 'info'}
          title={doneAccepted ? 'Assignment Accepted' : 'Assignment Rejected'}
          subTitle={doneMessage}
          extra={returnLink}
        />
      </div>
    )
  }

  // pageState === 'pending'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        minHeight: '100vh',
        background: '#f5f5f5',
        padding: '48px 16px',
      }}
    >
      <Card
        style={{ maxWidth: 600, width: '100%', borderRadius: 8 }}
        styles={{ body: { padding: 32 } }}
      >
        {/* Header */}
        <Space align="center" style={{ marginBottom: 24 }}>
          <DesktopOutlined style={{ fontSize: 28, color: '#1677ff' }} />
          <Title level={3} style={{ margin: 0 }}>
            Asset Assignment
          </Title>
        </Space>

        <Paragraph style={{ marginBottom: 24, color: '#595959' }}>
          The IT team has assigned the following hardware asset to you. Please review the
          details and accept or reject this assignment within 5 business days.
        </Paragraph>

        {/* Asset details */}
        <Descriptions
          column={1}
          size="small"
          bordered
          style={{ marginBottom: 24 }}
        >
          <Descriptions.Item label="Asset Tag">
            <Text strong style={{ fontFamily: 'monospace' }}>
              {detail?.asset_tag}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Name">{detail?.name}</Descriptions.Item>
          <Descriptions.Item label="Type">{detail?.asset_type}</Descriptions.Item>
          {detail?.assigned_to_name && (
            <Descriptions.Item label="Assigned To">
              {detail.assigned_to_name}
              {detail.assigned_to_email && (
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  ({detail.assigned_to_email})
                </Text>
              )}
            </Descriptions.Item>
          )}
        </Descriptions>

        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
          By accepting, you confirm receipt of this asset and agree to use it in accordance
          with company policy.
        </Paragraph>

        <Paragraph
          type="secondary"
          style={{
            fontSize: 12,
            marginBottom: 20,
            padding: '6px 10px',
            background: '#f6ffed',
            border: '1px solid #b7eb8f',
            borderRadius: 4,
          }}
        >
          A copy of this notice will be recorded for audit compliance.
        </Paragraph>

        {/* Optional notes */}
        <div style={{ marginBottom: 24 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Notes{' '}
            <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
              (optional)
            </Text>
          </Text>
          <TextArea
            rows={3}
            placeholder="Enter any comments about the assignment…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={1000}
            showCount
          />
        </div>

        {/* Action buttons */}
        <Space size={12}>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={actionLoading === 'accept'}
            disabled={actionLoading === 'reject'}
            onClick={() => handleAction('accept')}
          >
            Accept Assignment
          </Button>

          <Popconfirm
            title="Reject this assignment?"
            description="Are you sure you want to reject this assignment? The IT team will be notified."
            okText="Yes, Reject"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => handleAction('reject')}
            disabled={actionLoading !== null}
          >
            <Button
              danger
              icon={<CloseCircleOutlined />}
              loading={actionLoading === 'reject'}
              disabled={actionLoading === 'accept'}
            >
              Reject
            </Button>
          </Popconfirm>
        </Space>
      </Card>
    </div>
  )
}
