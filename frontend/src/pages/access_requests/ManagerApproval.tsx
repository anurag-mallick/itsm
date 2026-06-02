import { useEffect, useState } from 'react'
import {
  Typography, Card, Button, Result, Spin, Alert, Descriptions,
  Input,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { useParams, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import axios from 'axios'

dayjs.extend(relativeTime)

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManagerReview {
  id: string
  ref_number: string
  request_type: string
  type_display: string
  status: string
  already_reviewed: boolean
  requester_name: string
  requester_email: string
  justification: string
  hardware_type: string
  hardware_specification: string
  software_name: string
  manager_name: string
  created_at: string
}

type DecisionState = 'idle' | 'approved' | 'rejected' | 'error'

// ── Component ──────────────────────────────────────────────────────────────────

export default function ManagerApproval() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [reviewData, setReviewData] = useState<ManagerReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [decision, setDecision] = useState<DecisionState>('idle')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setFetchError(null)

    // Use raw axios (no auth header) — this is a public endpoint
    axios.get(`/api/access-requests/review/${id}/`, { params: { token } })
      .then(({ data }) => setReviewData(data as ManagerReview))
      .catch(err => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 404) {
          setFetchError('This review link is invalid or has expired.')
        } else if (status === 400) {
          setFetchError('The token provided is invalid. Please use the original link from your email.')
        } else {
          setFetchError('Unable to load this request. Please try again or contact IT support.')
        }
      })
      .finally(() => setLoading(false))
  }, [id, token])

  async function handleDecision(action: 'approve' | 'reject') {
    if (!id) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await axios.post(
        `/api/access-requests/review/${id}/`,
        { action, notes: notes.trim() },
        { params: { token } },
      )
      setDecision(action === 'approve' ? 'approved' : 'rejected')
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: Record<string, string[]> } })?.response?.data
      if (resp && typeof resp === 'object') {
        const firstKey = Object.keys(resp)[0]
        const firstMsg = Array.isArray(resp[firstKey]) ? resp[firstKey][0] : String(resp[firstKey])
        setSubmitError(`${firstKey}: ${firstMsg}`)
      } else {
        setSubmitError('Failed to submit your decision. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f5',
        }}
      >
        <Spin size="large" tip="Loading request..." />
      </div>
    )
  }

  // ── Fetch error ────────────────────────────────────────────────────────────

  if (fetchError) {
    return (
      <PageShell>
        <Result
          status="error"
          title="Unable to Load Request"
          subTitle={fetchError}
        />
      </PageShell>
    )
  }

  if (!reviewData) return null

  // ── Already reviewed ───────────────────────────────────────────────────────

  if (reviewData.already_reviewed) {
    return (
      <PageShell>
        <Result
          status="success"
          icon={<CheckCircleOutlined />}
          title="Already Reviewed"
          subTitle={`This request (${reviewData.ref_number}) has already been reviewed. No further action is needed.`}
          extra={
            <div style={{ color: '#666', fontSize: 14 }}>
              Current status: <strong>{reviewData.status}</strong>
            </div>
          }
        />
      </PageShell>
    )
  }

  // ── Decision result ────────────────────────────────────────────────────────

  if (decision === 'approved') {
    return (
      <PageShell>
        <Result
          status="success"
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          title="Request Approved"
          subTitle={`You have approved request ${reviewData.ref_number}. The IT team will now assign the resource to ${reviewData.requester_name}.`}
        />
      </PageShell>
    )
  }

  if (decision === 'rejected') {
    return (
      <PageShell>
        <Result
          status="error"
          icon={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
          title="Request Rejected"
          subTitle={`You have rejected request ${reviewData.ref_number}. ${reviewData.requester_name} will be notified.`}
        />
      </PageShell>
    )
  }

  // ── Normal review flow ─────────────────────────────────────────────────────

  const whatNeeded =
    reviewData.request_type === 'hardware'
      ? [reviewData.hardware_type, reviewData.hardware_specification].filter(Boolean).join(' — ')
      : reviewData.software_name

  return (
    <PageShell>
      {/* Page heading */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>
          Access Request Review
        </Title>
        <Text
          style={{
            fontFamily: 'monospace',
            fontSize: 15,
            fontWeight: 600,
            color: '#1677ff',
            display: 'block',
            marginTop: 4,
          }}
        >
          {reviewData.ref_number}
        </Text>
        {reviewData.manager_name && (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            You are reviewing this request as the designated manager
            {reviewData.manager_name ? ` — ${reviewData.manager_name}` : ''}.
          </Paragraph>
        )}
      </div>

      {/* Request summary */}
      <Card title="Request Summary" style={{ marginBottom: 20 }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Requestor">
            <div>
              <div style={{ fontWeight: 500 }}>{reviewData.requester_name || '—'}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{reviewData.requester_email}</Text>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label="Request Type">
            {reviewData.type_display}
          </Descriptions.Item>
          <Descriptions.Item label={reviewData.request_type === 'hardware' ? 'Hardware Needed' : 'Software Needed'}>
            {whatNeeded || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Justification">
            <Text>{reviewData.justification}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Submitted">
            {dayjs(reviewData.created_at).format('DD MMM YYYY, HH:mm')}
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              ({dayjs(reviewData.created_at).fromNow()})
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Decision form */}
      <Card title="Your Decision">
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

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: 6 }}>
            Notes <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(optional)</Text>
          </label>
          <TextArea
            rows={4}
            placeholder="Add notes for the requestor (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={1000}
            showCount
            disabled={submitting}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            loading={submitting}
            onClick={() => handleDecision('approve')}
            style={{
              flex: 1,
              background: '#52c41a',
              borderColor: '#52c41a',
              fontWeight: 600,
            }}
          >
            Approve Request
          </Button>
          <Button
            danger
            size="large"
            icon={<CloseCircleOutlined />}
            loading={submitting}
            onClick={() => handleDecision('reject')}
            style={{ flex: 1, fontWeight: 600 }}
          >
            Reject Request
          </Button>
        </div>
      </Card>
    </PageShell>
  )
}

// ── PageShell ──────────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f5f5',
        padding: '48px 16px',
      }}
    >
      {/* Branding bar */}
      <div
        style={{
          maxWidth: 680,
          margin: '0 auto 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text strong style={{ fontSize: 15, color: '#1677ff' }}>IT Service Desk</Text>
        <Text type="secondary" style={{ fontSize: 13 }}>— Bluspring Enterprises</Text>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {children}
      </div>

      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          If you have questions, contact the IT team directly.
        </Text>
      </div>
    </div>
  )
}
