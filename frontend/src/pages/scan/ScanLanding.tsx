import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Spin,
  Tag,
  Typography,
  Space,
} from 'antd'
import {
  CheckCircleOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import client from '../../api/client'

const { Title, Text, Paragraph } = Typography

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanAsset {
  id: string
  asset_tag: string
  name: string
  asset_type: string
  status: string
  location: string
  site: { id: string; name: string; city: string } | null
  assigned_to: { full_name: string; email: string } | null
  warranty_status: string
  warranty_expiry: string | null
}

interface ReportIssueResponse {
  ticket_id: string
  ticket_number: string
}

interface RequestAssignmentResponse {
  ticket_id: string
  ticket_number: string
}

interface ConfirmAuditResponse {
  audit_log_id: string
  confirmed_at: string
}

type ActionSuccess =
  | { type: 'ticket'; ticket_number: string }
  | { type: 'audit'; confirmed_at: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'green',
  procurement: 'blue',
  under_repair: 'orange',
  retired: 'default',
  disposed: 'red',
}

const WARRANTY_BADGE: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  valid: 'success',
  expiring_soon: 'warning',
  expired: 'error',
  unknown: 'default',
}

const WARRANTY_LABELS: Record<string, string> = {
  valid: 'Valid',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
  unknown: 'Unknown',
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ActionModalProps {
  open: boolean
  title: string
  submitting: boolean
  success: ActionSuccess | null
  onCancel: () => void
  onSubmit: (notes: string) => void
  children: React.ReactNode
}

function ActionModal({
  open,
  title,
  submitting,
  success,
  onCancel,
  onSubmit,
  children,
}: ActionModalProps) {
  const [form] = Form.useForm<{ notes: string }>()

  const handleOk = async () => {
    const values = await form.validateFields()
    onSubmit(values.notes ?? '')
  }

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={success ? onCancel : handleOk}
      okText={success ? 'Close' : 'Submit'}
      cancelButtonProps={success ? { style: { display: 'none' } } : undefined}
      confirmLoading={submitting}
      destroyOnClose
      afterClose={() => form.resetFields()}
    >
      {success ? null : children}
      {success && success.type === 'ticket' && (
        <Alert
          type="success"
          message={`Ticket ${success.ticket_number} has been created. Our IT team will contact you shortly.`}
          showIcon
        />
      )}
      {success && success.type === 'audit' && (
        <Alert
          type="success"
          message={`Audit confirmed at ${dayjs(success.confirmed_at).format('DD MMM YYYY, HH:mm')}`}
          showIcon
        />
      )}
      {/* Hidden form — rendered outside visible children so Form instance is always mounted */}
      <Form form={form} style={success ? { display: 'none' } : undefined}>
        {children}
      </Form>
    </Modal>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ScanLanding() {
  const { token } = useParams<{ token: string }>()

  const [asset, setAsset] = useState<ScanAsset | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Report Issue modal
  const [reportOpen, setReportOpen] = useState(false)
  const [reportNotes, setReportNotes] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportSuccess, setReportSuccess] = useState<ActionSuccess | null>(null)

  // Request Assignment modal
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignNotes, setAssignNotes] = useState('I would like to be assigned this asset.')
  const [assignSubmitting, setAssignSubmitting] = useState(false)
  const [assignSuccess, setAssignSuccess] = useState<ActionSuccess | null>(null)

  // Confirm Audit modal
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditNotes, setAuditNotes] = useState('')
  const [auditSubmitting, setAuditSubmitting] = useState(false)
  const [auditSuccess, setAuditSuccess] = useState<ActionSuccess | null>(null)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    client
      .get<ScanAsset>(`/scan/${token}/`)
      .then(({ data }) => setAsset(data))
      .catch((err: { response?: { status?: number } }) => {
        if (err?.response?.status === 404) {
          setNotFound(true)
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleReportSubmit = async (notes: string) => {
    setReportSubmitting(true)
    try {
      const { data } = await client.post<ReportIssueResponse>(
        `/scan/${token}/action/`,
        { action: 'report_issue', notes },
      )
      setReportSuccess({ type: 'ticket', ticket_number: data.ticket_number })
    } finally {
      setReportSubmitting(false)
    }
  }

  const handleAssignSubmit = async (notes: string) => {
    setAssignSubmitting(true)
    try {
      const { data } = await client.post<RequestAssignmentResponse>(
        `/scan/${token}/action/`,
        { action: 'request_assignment', notes },
      )
      setAssignSuccess({ type: 'ticket', ticket_number: data.ticket_number })
    } finally {
      setAssignSubmitting(false)
    }
  }

  const handleAuditSubmit = async (notes: string) => {
    setAuditSubmitting(true)
    try {
      const { data } = await client.post<ConfirmAuditResponse>(
        `/scan/${token}/action/`,
        { action: 'confirm_audit', notes },
      )
      setAuditSuccess({ type: 'audit', confirmed_at: data.confirmed_at })
    } finally {
      setAuditSubmitting(false)
    }
  }

  // ── Render: Loading ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 16,
        }}
      >
        <Spin size="large" />
        <Text type="secondary">Loading asset information...</Text>
      </div>
    )
  }

  // ── Render: Not Found ──────────────────────────────────────────────────────

  if (notFound || !asset) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 16px' }}>
        <Card>
          <Alert
            type="error"
            message="Asset Not Found"
            description="Asset not found. This QR code may be invalid or the asset has been removed."
            showIcon
          />
        </Card>
      </div>
    )
  }

  // ── Render: Main ───────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
      {/* Asset Info Card */}
      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        {/* Asset Tag Badge */}
        <div style={{ marginBottom: 12 }}>
          <span
            style={{
              display: 'inline-block',
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 20,
              color: '#1677ff',
              background: '#e6f4ff',
              border: '1px solid #91caff',
              borderRadius: 6,
              padding: '4px 14px',
              letterSpacing: 1,
            }}
          >
            {asset.asset_tag}
          </span>
        </div>

        {/* Asset Name */}
        <Title level={2} style={{ margin: '0 0 12px' }}>
          {asset.name}
        </Title>

        {/* Type + Status tags */}
        <Space wrap style={{ marginBottom: 16 }}>
          <Tag style={{ fontSize: 13 }}>
            {asset.asset_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </Tag>
          <Tag color={STATUS_COLORS[asset.status] ?? 'default'} style={{ fontSize: 13 }}>
            {formatStatus(asset.status)}
          </Tag>
        </Space>

        {/* Location */}
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Location
          </Text>
          <Paragraph style={{ margin: 0 }}>
            {asset.location || <Text type="secondary">Not specified</Text>}
            {asset.site && (
              <Text type="secondary"> &bull; {asset.site.name}, {asset.site.city}</Text>
            )}
          </Paragraph>
        </div>

        {/* Assigned To */}
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Assigned To
          </Text>
          <Paragraph style={{ margin: 0 }}>
            {asset.assigned_to ? (
              <Space size={6}>
                <Text strong>{asset.assigned_to.full_name}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{asset.assigned_to.email}</Text>
              </Space>
            ) : (
              <Text type="secondary">Unassigned</Text>
            )}
          </Paragraph>
        </div>

        {/* Warranty */}
        <div>
          <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Warranty
          </Text>
          <div style={{ marginTop: 2 }}>
            <Space size={8}>
              {asset.warranty_expiry ? (
                <Text>{dayjs(asset.warranty_expiry).format('DD MMM YYYY')}</Text>
              ) : (
                <Text type="secondary">No expiry recorded</Text>
              )}
              <Badge
                status={WARRANTY_BADGE[asset.warranty_status] ?? 'default'}
                text={WARRANTY_LABELS[asset.warranty_status] ?? asset.warranty_status}
              />
            </Space>
          </div>
        </div>
      </Card>

      {/* Action Cards */}
      <Row gutter={[12, 12]}>
        {/* Report an Issue */}
        <Col xs={24} sm={8}>
          <Card
            hoverable
            onClick={() => setReportOpen(true)}
            style={{ minHeight: 120, borderRadius: 10, borderColor: '#ffa39e', cursor: 'pointer' }}
            styles={{ body: { padding: 16 } }}
          >
            <Space direction="vertical" size={6}>
              <WarningOutlined style={{ fontSize: 28, color: '#ff4d4f' }} />
              <Text strong style={{ fontSize: 15, color: '#cf1322' }}>
                Report an Issue
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Something broken or not working? Raise a support ticket.
              </Text>
            </Space>
          </Card>
        </Col>

        {/* Request Assignment */}
        <Col xs={24} sm={8}>
          <Card
            hoverable
            onClick={() => setAssignOpen(true)}
            style={{ minHeight: 120, borderRadius: 10, borderColor: '#91caff', cursor: 'pointer' }}
            styles={{ body: { padding: 16 } }}
          >
            <Space direction="vertical" size={6}>
              <UserOutlined style={{ fontSize: 28, color: '#1677ff' }} />
              <Text strong style={{ fontSize: 15, color: '#0958d9' }}>
                Request Assignment
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Need this asset assigned to you?
              </Text>
            </Space>
          </Card>
        </Col>

        {/* Confirm Audit */}
        <Col xs={24} sm={8}>
          <Card
            hoverable
            onClick={() => setAuditOpen(true)}
            style={{ minHeight: 120, borderRadius: 10, borderColor: '#b7eb8f', cursor: 'pointer' }}
            styles={{ body: { padding: 16 } }}
          >
            <Space direction="vertical" size={6}>
              <CheckCircleOutlined style={{ fontSize: 28, color: '#52c41a' }} />
              <Text strong style={{ fontSize: 15, color: '#237804' }}>
                Confirm Audit
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Confirm you have physically verified this asset.
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* ── Report Issue Modal ───────────────────────────────────────────────── */}
      <Modal
        title={`Report Issue for ${asset.asset_tag}`}
        open={reportOpen}
        onCancel={() => { setReportOpen(false); setReportNotes(''); setReportSuccess(null) }}
        onOk={
          reportSuccess
            ? () => { setReportOpen(false); setReportNotes(''); setReportSuccess(null) }
            : async () => {
                if (!reportNotes || reportNotes.trim().length < 10) return
                await handleReportSubmit(reportNotes.trim())
              }
        }
        okText={reportSuccess ? 'Close' : 'Submit'}
        cancelButtonProps={reportSuccess ? { style: { display: 'none' } } : undefined}
        confirmLoading={reportSubmitting}
        destroyOnClose
      >
        {reportSuccess ? (
          <Alert
            type="success"
            message={`Ticket ${(reportSuccess as { type: 'ticket'; ticket_number: string }).ticket_number} has been created. Our IT team will contact you shortly.`}
            showIcon
          />
        ) : (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              Describe the issue (minimum 10 characters)
            </Text>
            <Input.TextArea
              rows={4}
              placeholder="Describe the issue..."
              value={reportNotes}
              onChange={e => setReportNotes(e.target.value)}
              minLength={10}
              showCount
            />
            {reportNotes.trim().length > 0 && reportNotes.trim().length < 10 && (
              <Text type="danger" style={{ fontSize: 12 }}>
                Please enter at least 10 characters.
              </Text>
            )}
          </div>
        )}
      </Modal>

      {/* ── Request Assignment Modal ─────────────────────────────────────────── */}
      <Modal
        title={`Request Assignment for ${asset.asset_tag}`}
        open={assignOpen}
        onCancel={() => { setAssignOpen(false); setAssignNotes('I would like to be assigned this asset.'); setAssignSuccess(null) }}
        onOk={
          assignSuccess
            ? () => { setAssignOpen(false); setAssignNotes('I would like to be assigned this asset.'); setAssignSuccess(null) }
            : async () => { await handleAssignSubmit(assignNotes.trim()) }
        }
        okText={assignSuccess ? 'Close' : 'Submit'}
        cancelButtonProps={assignSuccess ? { style: { display: 'none' } } : undefined}
        confirmLoading={assignSubmitting}
        destroyOnClose
      >
        {assignSuccess ? (
          <Alert
            type="success"
            message={`Ticket ${(assignSuccess as { type: 'ticket'; ticket_number: string }).ticket_number} has been created. Our IT team will contact you shortly.`}
            showIcon
          />
        ) : (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              A request will be sent to your IT team for this asset to be assigned to you.
            </Text>
            <Input.TextArea
              rows={3}
              placeholder="Additional notes (optional)"
              value={assignNotes}
              onChange={e => setAssignNotes(e.target.value)}
            />
          </div>
        )}
      </Modal>

      {/* ── Confirm Audit Modal ──────────────────────────────────────────────── */}
      <Modal
        title="Confirm Asset Audit"
        open={auditOpen}
        onCancel={() => { setAuditOpen(false); setAuditNotes(''); setAuditSuccess(null) }}
        onOk={
          auditSuccess
            ? () => { setAuditOpen(false); setAuditNotes(''); setAuditSuccess(null) }
            : async () => { await handleAuditSubmit(auditNotes.trim()) }
        }
        okText={auditSuccess ? 'Close' : 'Confirm'}
        cancelButtonProps={auditSuccess ? { style: { display: 'none' } } : undefined}
        confirmLoading={auditSubmitting}
        destroyOnClose
      >
        {auditSuccess ? (
          <Alert
            type="success"
            message={`Audit confirmed at ${dayjs((auditSuccess as { type: 'audit'; confirmed_at: string }).confirmed_at).format('DD MMM YYYY, HH:mm')}`}
            showIcon
          />
        ) : (
          <div style={{ marginTop: 8 }}>
            <Alert
              type="info"
              message={`You are confirming that you have visually verified asset ${asset.asset_tag} is present at this location.`}
              style={{ marginBottom: 16 }}
              showIcon
            />
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              Current location (if different from records):
            </Text>
            <Input.TextArea
              rows={3}
              placeholder="Enter current location or leave blank to confirm existing records."
              value={auditNotes}
              onChange={e => setAuditNotes(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
