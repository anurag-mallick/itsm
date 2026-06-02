import { useEffect, useState, useCallback } from 'react'
import {
  Button, Tag, Typography, Badge, Card, Descriptions, Space, Select,
  Input, message, Timeline, Modal, Avatar, Divider, Spin, Row, Col,
  Tooltip, Alert,
} from 'antd'
import {
  ArrowLeftOutlined, UserOutlined, EditOutlined, QrcodeOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import client from '../../api/client'
import { useAuthStore } from '../../store/auth'
import ActivityFeed from '../../components/ActivityFeed'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssignedUser {
  id: string
  email: string
  full_name: string
}

interface StatusHistoryItem {
  old_status: string
  new_status: string
  changed_by: { full_name: string }
  notes: string
  changed_at: string
}

interface HardwareAsset {
  id: string
  asset_tag: string
  name: string
  asset_type: string
  make: string
  model_name: string
  serial_number: string
  status: string
  warranty_status: string
  location: string
  // API returns flat fields, not a nested object
  assigned_to: string | null       // UUID
  assigned_to_email: string | null
  assigned_to_name: string | null
  purchase_date: string | null
  purchase_cost: string | null
  warranty_expiry: string | null
  notes: string
  custom_fields: Record<string, unknown>
  status_history: StatusHistoryItem[]
  created_at: string
  is_archived: boolean
  archived_at: string | null
  archived_by_email: string | null
  archive_reason: string
  // Acceptance workflow fields
  acceptance_status: 'none' | 'pending' | 'accepted' | 'rejected'
  accepted_at: string | null
  acceptance_notes: string
}

interface UserOption {
  id: string
  email: string
  full_name: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSET_TYPE_LABELS: Record<string, string> = {
  laptop: 'Laptop',
  desktop: 'Desktop',
  server: 'Server',
  monitor: 'Monitor',
  phone: 'Phone',
  tablet: 'Tablet',
  printer: 'Printer',
  network_switch: 'Network Switch',
  router: 'Router',
  ups: 'UPS',
  peripheral: 'Peripheral',
  other: 'Other',
}

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

const STATUS_OPTIONS = [
  { label: 'Procurement', value: 'procurement' },
  { label: 'Active', value: 'active' },
  { label: 'Under Repair', value: 'under_repair' },
  { label: 'Retired', value: 'retired' },
  { label: 'Disposed', value: 'disposed' },
]

const TIMELINE_COLORS: Record<string, string> = {
  active: 'green',
  procurement: 'blue',
  under_repair: 'orange',
  retired: 'gray',
  disposed: 'red',
}

// ── ReasonModal (reusable for archive + unarchive) ────────────────────────────

interface ReasonModalProps {
  open: boolean
  title: string
  description: string
  okText: string
  okDanger?: boolean
  loading: boolean
  extraInfo?: React.ReactNode
  onConfirm: (reason: string) => void
  onCancel: () => void
}

function ReasonModal({
  open, title, description, okText, okDanger = false,
  loading, extraInfo, onConfirm, onCancel,
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
      {extraInfo}
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function HardwareDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const isAgent = ['it_agent', 'it_manager', 'super_admin'].includes(user?.role_name ?? '')
  const isManager = ['it_manager', 'super_admin'].includes(user?.role_name ?? '')

  const [asset, setAsset] = useState<HardwareAsset | null>(null)
  const [loading, setLoading] = useState(true)

  // Status change
  const [newStatus, setNewStatus] = useState<string>('')
  const [statusNotes, setStatusNotes] = useState('')
  const [statusLoading, setStatusLoading] = useState(false)

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [userSearchLoading, setUserSearchLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [unassignLoading, setUnassignLoading] = useState(false)

  // QR Code modal
  const [qrOpen, setQrOpen] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrData, setQrData] = useState<{
    qr_image: string
    barcode_image: string
    qr_url: string
    asset_tag: string
  } | null>(null)

  // Archive / unarchive modals
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [unarchiveOpen, setUnarchiveOpen] = useState(false)
  const [unarchiveLoading, setUnarchiveLoading] = useState(false)

  const fetchAsset = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<HardwareAsset>(`/assets/hardware/${id}/`)
      setAsset(data)
    } catch {
      message.error('Failed to load asset details.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchAsset() }, [fetchAsset])

  // User search for assign modal
  useEffect(() => {
    if (!userSearch.trim()) {
      setUserOptions([])
      return
    }
    const t = setTimeout(async () => {
      setUserSearchLoading(true)
      try {
        const { data } = await client.get<{ results: UserOption[] } | UserOption[]>('/users/', {
          params: { search: userSearch, page_size: 20 },
        })
        const results = Array.isArray(data) ? data : (data as { results: UserOption[] }).results
        setUserOptions(results)
      } catch {
        setUserOptions([])
      } finally {
        setUserSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [userSearch])

  const handleStatusUpdate = async () => {
    if (!newStatus) { message.warning('Select a new status.'); return }
    setStatusLoading(true)
    try {
      await client.post(`/assets/hardware/${id}/status/`, {
        status: newStatus,
        notes: statusNotes,
      })
      message.success('Status updated.')
      setNewStatus('')
      setStatusNotes('')
      fetchAsset()
    } catch {
      message.error('Failed to update status.')
    } finally {
      setStatusLoading(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedUserId) { message.warning('Select a user to assign.'); return }
    setAssignLoading(true)
    try {
      await client.post(`/assets/hardware/${id}/assign/`, { user_id: selectedUserId })
      message.success('Asset assigned successfully.')
      setAssignOpen(false)
      setSelectedUserId('')
      setUserSearch('')
      fetchAsset()
    } catch {
      message.error('Failed to assign asset.')
    } finally {
      setAssignLoading(false)
    }
  }

  const handleUnassign = async () => {
    Modal.confirm({
      title: 'Unassign this asset?',
      content: 'The asset will be marked as unassigned.',
      okText: 'Unassign',
      okType: 'danger',
      onOk: async () => {
        setUnassignLoading(true)
        try {
          await client.post(`/assets/hardware/${id}/assign/`, { user_id: null })
          message.success('Asset unassigned.')
          fetchAsset()
        } catch {
          message.error('Failed to unassign asset.')
        } finally {
          setUnassignLoading(false)
        }
      },
    })
  }

  const handleOpenQr = async () => {
    setQrOpen(true)
    if (qrData) return // already fetched
    setQrLoading(true)
    try {
      const { data } = await client.get<{
        qr_image: string
        barcode_image: string
        qr_url: string
        asset_tag: string
      }>(`/assets/hardware/${id}/qr/`)
      setQrData(data)
    } catch {
      message.error('Failed to load QR code.')
      setQrOpen(false)
    } finally {
      setQrLoading(false)
    }
  }

  const handleDownloadQr = () => {
    if (!qrData) return
    const a = document.createElement('a')
    a.href = qrData.qr_image
    a.download = `${qrData.asset_tag}-qr.png`
    a.click()
  }

  const handlePrintQr = () => {
    window.print()
  }

  // ── Archive / Unarchive ─────────────────────────────────────────────────────

  async function handleArchiveConfirm(reason: string) {
    setArchiveLoading(true)
    try {
      await client.post(`/assets/hardware/${id}/archive/`, { reason })
      message.success('Asset archived.')
      setArchiveOpen(false)
      navigate('/assets/hardware')
    } catch {
      message.error('Failed to archive asset.')
    } finally {
      setArchiveLoading(false)
    }
  }

  async function handleUnarchiveConfirm(reason: string) {
    setUnarchiveLoading(true)
    try {
      await client.post(`/assets/hardware/${id}/unarchive/`, { reason })
      message.success('Asset restored.')
      setUnarchiveOpen(false)
      fetchAsset()
    } catch {
      message.error('Failed to restore asset.')
    } finally {
      setUnarchiveLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!asset) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets/hardware')}>
          Back
        </Button>
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <Text type="secondary">Asset not found.</Text>
        </div>
      </div>
    )
  }

  const isArchived = asset.is_archived

  return (
    <div>
      {/* Back button */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/assets/hardware')}
        style={{ marginBottom: 16 }}
      >
        Back to Hardware Assets
      </Button>

      {/* Archived banner */}
      {isArchived && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, borderColor: '#fa8c16' }}
          message={
            <Space direction="vertical" size={2}>
              <Text strong>This asset is archived.</Text>
              <Text>
                Archived by: <strong>{asset.archived_by_email ?? '—'}</strong>
                {asset.archived_at && (
                  <> on <strong>{dayjs(asset.archived_at).format('DD MMM YYYY, HH:mm')}</strong></>
                )}
              </Text>
              {asset.archive_reason && (
                <Text>Reason: {asset.archive_reason}</Text>
              )}
            </Space>
          }
          action={
            isManager ? (
              <Button size="small" onClick={() => setUnarchiveOpen(true)}>
                Restore Asset
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Acceptance status banners */}
      {asset.acceptance_status === 'pending' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Awaiting user acceptance"
          description={
            asset.assigned_to?.email
              ? `An acceptance email has been sent to ${asset.assigned_to_email}. Waiting for the user to accept or reject the assignment.`
              : 'An acceptance email has been sent to the assigned user.'
          }
        />
      )}
      {asset.acceptance_status === 'accepted' && asset.accepted_at && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Accepted by user on ${dayjs(asset.accepted_at).format('DD MMM YYYY, HH:mm')}`}
          description={asset.acceptance_notes ? `Notes: ${asset.acceptance_notes}` : undefined}
        />
      )}
      {asset.acceptance_status === 'rejected' && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="User rejected this assignment"
          description={
            asset.acceptance_notes
              ? `The asset is now unassigned. User notes: ${asset.acceptance_notes}`
              : 'The asset is now unassigned. Please reassign or investigate.'
          }
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Space wrap size={12} align="center">
            <Tag style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, padding: '4px 10px' }}>
              {asset.asset_tag}
            </Tag>
            <Title level={3} style={{ margin: 0 }}>{asset.name}</Title>
            <Tag color={STATUS_COLORS[asset.status] ?? 'default'} style={{ fontSize: 13 }}>
              {asset.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </Tag>
            <Tag>{ASSET_TYPE_LABELS[asset.asset_type] ?? asset.asset_type}</Tag>
            <Badge
              status={WARRANTY_BADGE[asset.warranty_status] ?? 'default'}
              text={WARRANTY_LABELS[asset.warranty_status] ?? asset.warranty_status}
            />
            {isArchived && (
              <Tag icon={<InboxOutlined />} color="orange">Archived</Tag>
            )}
          </Space>
          <Space>
            {isArchived ? (
              <Tooltip title="Asset is archived">
                <Button
                  type="default"
                  icon={<QrcodeOutlined />}
                  disabled
                >
                  QR Code
                </Button>
              </Tooltip>
            ) : (
              <Button
                type="default"
                icon={<QrcodeOutlined />}
                onClick={handleOpenQr}
              >
                QR Code
              </Button>
            )}
          </Space>
        </div>
      </div>

      <Row gutter={24}>
        {/* Left column — details */}
        <Col xs={24} lg={14}>
          <Card title="Asset Details" style={{ marginBottom: 24 }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Make">{asset.make || <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="Model">{asset.model_name || <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="Serial Number">
                {asset.serial_number
                  ? <span style={{ fontFamily: 'monospace' }}>{asset.serial_number}</span>
                  : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Location">{asset.location || <Text type="secondary">—</Text>}</Descriptions.Item>
              <Descriptions.Item label="Purchase Date">
                {asset.purchase_date ? dayjs(asset.purchase_date).format('DD MMM YYYY') : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Purchase Cost">
                {asset.purchase_cost ? `₹ ${parseFloat(asset.purchase_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Warranty Expiry">
                {asset.warranty_expiry ? (
                  <Space>
                    <span>{dayjs(asset.warranty_expiry).format('DD MMM YYYY')}</span>
                    <Text type="secondary">({dayjs(asset.warranty_expiry).fromNow()})</Text>
                  </Space>
                ) : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Notes">
                {asset.notes || <Text type="secondary">—</Text>}
              </Descriptions.Item>
            </Descriptions>

            {/* Custom fields */}
            {asset.custom_fields && Object.keys(asset.custom_fields).length > 0 && (
              <>
                <Divider orientation="left" style={{ fontSize: 13 }}>Custom Fields</Divider>
                <Descriptions column={1} size="small" bordered>
                  {Object.entries(asset.custom_fields).map(([key, val]) => (
                    <Descriptions.Item key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}>
                      {String(val)}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </>
            )}
          </Card>

          {/* Status History Timeline */}
          <Card title="Status History" style={{ marginBottom: 24 }}>
            {asset.status_history && asset.status_history.length > 0 ? (
              <Timeline
                items={asset.status_history.map(item => ({
                  color: TIMELINE_COLORS[item.new_status] ?? 'gray',
                  children: (
                    <div>
                      <Space size={6} wrap>
                        <Tag color={STATUS_COLORS[item.old_status] ?? 'default'} style={{ fontSize: 11 }}>
                          {item.old_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>→</Text>
                        <Tag color={STATUS_COLORS[item.new_status] ?? 'default'} style={{ fontSize: 11 }}>
                          {item.new_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </Tag>
                      </Space>
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          by {item.changed_by?.full_name ?? 'Unknown'} &bull;{' '}
                          <Tooltip title={dayjs(item.changed_at).format('DD MMM YYYY, HH:mm')}>
                            {dayjs(item.changed_at).fromNow()}
                          </Tooltip>
                        </Text>
                      </div>
                      {item.notes && (
                        <div style={{ marginTop: 4, color: '#595959', fontSize: 13 }}>{item.notes}</div>
                      )}
                    </div>
                  ),
                }))}
              />
            ) : (
              <Text type="secondary">No status history recorded.</Text>
            )}
          </Card>

          {/* Activity Log */}
          <Card title="Activity Log">
            <ActivityFeed module="assets" recordId={asset.id} />
          </Card>
        </Col>

        {/* Right column — assignment + status change */}
        <Col xs={24} lg={10}>
          {/* Assigned To */}
          <Card
            title="Assigned To"
            style={{ marginBottom: 24 }}
            extra={
              isAgent && !isArchived ? (
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setAssignOpen(true)}
                >
                  {asset.assigned_to ? 'Reassign' : 'Assign'}
                </Button>
              ) : isAgent && isArchived ? (
                <Tooltip title="Asset is archived">
                  <Button size="small" icon={<EditOutlined />} disabled>
                    {asset.assigned_to ? 'Reassign' : 'Assign'}
                  </Button>
                </Tooltip>
              ) : null
            }
          >
            {asset.assigned_to ? (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space size={10}>
                  <Avatar size={40} style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />}>
                    {(asset.assigned_to_name || asset.assigned_to_email || '?').charAt(0).toUpperCase()}
                  </Avatar>
                  <div>
                    <div style={{ fontWeight: 600 }}>{asset.assigned_to_name || asset.assigned_to_email}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{asset.assigned_to_email}</div>
                  </div>
                </Space>
                {isAgent && !isArchived && (
                  <Button
                    danger
                    size="small"
                    loading={unassignLoading}
                    onClick={handleUnassign}
                    style={{ marginTop: 8 }}
                  >
                    Unassign
                  </Button>
                )}
              </Space>
            ) : (
              <Text type="secondary">Unassigned</Text>
            )}
          </Card>

          {/* Change Status */}
          {isAgent && (
            <Card title="Change Status" style={{ marginBottom: 24 }}>
              {isArchived ? (
                <Tooltip title="Asset is archived">
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Current Status</Text>
                      <div style={{ marginTop: 4 }}>
                        <Tag color={STATUS_COLORS[asset.status] ?? 'default'} style={{ fontSize: 13 }}>
                          {asset.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </Tag>
                      </div>
                    </div>
                    <Select placeholder="Select new status" style={{ width: '100%' }} disabled />
                    <Button type="primary" disabled style={{ width: '100%' }}>Update Status</Button>
                  </Space>
                </Tooltip>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Current Status</Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag color={STATUS_COLORS[asset.status] ?? 'default'} style={{ fontSize: 13 }}>
                        {asset.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </Tag>
                    </div>
                  </div>
                  <Select
                    placeholder="Select new status"
                    value={newStatus || undefined}
                    onChange={setNewStatus}
                    style={{ width: '100%' }}
                  >
                    {STATUS_OPTIONS.filter(o => o.value !== asset.status).map(o => (
                      <Option key={o.value} value={o.value}>{o.label}</Option>
                    ))}
                  </Select>
                  <Input.TextArea
                    rows={3}
                    placeholder="Notes for status change (optional)"
                    value={statusNotes}
                    onChange={e => setStatusNotes(e.target.value)}
                  />
                  <Button
                    type="primary"
                    loading={statusLoading}
                    onClick={handleStatusUpdate}
                    disabled={!newStatus}
                  >
                    Update Status
                  </Button>
                </Space>
              )}
            </Card>
          )}

          {/* Archive action */}
          {isAgent && !isArchived && (
            <Card>
              <Button
                danger
                icon={<InboxOutlined />}
                style={{ width: '100%' }}
                onClick={() => setArchiveOpen(true)}
              >
                Archive Asset
              </Button>
            </Card>
          )}
        </Col>
      </Row>

      {/* QR Code Modal */}
      <Modal
        title={qrData ? `QR Code & Barcode — ${qrData.asset_tag}` : 'QR Code & Barcode'}
        open={qrOpen}
        onCancel={() => setQrOpen(false)}
        footer={[
          <Button key="close" onClick={() => setQrOpen(false)}>
            Close
          </Button>,
        ]}
        width={440}
        destroyOnClose={false}
      >
        {/* Print style: hide everything except the qr-print-area */}
        <style>{`
          @media print {
            body > * { display: none !important; }
            #qr-print-area { display: block !important; }
          }
        `}</style>

        {qrLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
          </div>
        )}

        {!qrLoading && qrData && (
          <div id="qr-print-area">
            {/* QR Code section */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Scan to open asset page
              </Text>
              <img
                src={qrData.qr_image}
                alt="QR Code"
                width={200}
                height={200}
                style={{ display: 'block', margin: '0 auto', imageRendering: 'pixelated' }}
              />
            </div>

            {/* Barcode section */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {qrData.asset_tag}
              </Text>
              <img
                src={qrData.barcode_image}
                alt="Barcode"
                style={{ width: '100%', maxWidth: '100%', display: 'block' }}
              />
            </div>

            {/* QR URL */}
            <div style={{ marginBottom: 20 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Asset URL
              </Text>
              <Typography.Paragraph copyable style={{ margin: 0, wordBreak: 'break-all' }}>
                {qrData.qr_url}
              </Typography.Paragraph>
            </div>

            {/* Download + Print buttons — hidden when printing */}
            <Space className="no-print" style={{ width: '100%', justifyContent: 'center' }}>
              <Button onClick={handleDownloadQr}>
                Download QR
              </Button>
              <Button onClick={handlePrintQr}>
                Print
              </Button>
            </Space>
          </div>
        )}
      </Modal>

      {/* Assign / Reassign Modal */}
      <Modal
        title={asset.assigned_to ? 'Reassign Asset' : 'Assign Asset'}
        open={assignOpen}
        onCancel={() => { setAssignOpen(false); setSelectedUserId(''); setUserSearch('') }}
        onOk={handleAssign}
        okText="Assign"
        confirmLoading={assignLoading}
        destroyOnClose
      >
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Search for a user by name or email.
          </Text>
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="Search users…"
            filterOption={false}
            onSearch={setUserSearch}
            value={selectedUserId || undefined}
            onChange={setSelectedUserId}
            loading={userSearchLoading}
            notFoundContent={userSearch ? (userSearchLoading ? 'Searching…' : 'No users found.') : 'Type to search.'}
          >
            {userOptions.map(u => {
              const label = u.full_name || u.email || '?'
              return (
                <Option key={u.id} value={u.id}>
                  <Space size={8}>
                    <Avatar size={20} style={{ backgroundColor: '#1677ff', fontSize: 10 }}>
                      {label.charAt(0).toUpperCase()}
                    </Avatar>
                    {label}
                    <Text type="secondary" style={{ fontSize: 12 }}>{u.email}</Text>
                  </Space>
                </Option>
              )
            })}
          </Select>
        </div>
      </Modal>

      {/* Archive Modal */}
      <ReasonModal
        open={archiveOpen}
        title="Archive Asset"
        description="Archived assets are hidden from all active views."
        okText="Archive"
        okDanger
        loading={archiveLoading}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setArchiveOpen(false)}
      />

      {/* Unarchive Modal */}
      <ReasonModal
        open={unarchiveOpen}
        title="Restore Asset from Archive"
        description="The asset will be restored and visible in the active assets list."
        okText="Restore"
        loading={unarchiveLoading}
        extraInfo={
          asset.archived_at || asset.archive_reason ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <div>
                  {asset.archived_at && (
                    <div>
                      <Text strong>Archived at: </Text>
                      <Text>{dayjs(asset.archived_at).format('DD MMM YYYY, HH:mm')}</Text>
                    </div>
                  )}
                  {asset.archive_reason && (
                    <div style={{ marginTop: 4 }}>
                      <Text strong>Archive reason: </Text>
                      <Text>{asset.archive_reason}</Text>
                    </div>
                  )}
                </div>
              }
            />
          ) : undefined
        }
        onConfirm={handleUnarchiveConfirm}
        onCancel={() => setUnarchiveOpen(false)}
      />
    </div>
  )
}
