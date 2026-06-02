import { useEffect, useState } from 'react'
import {
  Typography, Tag, Card, Button, Col, Row, Spin, message,
  Descriptions, Timeline, Drawer, Form, Select, Input, Alert, Popconfirm, Steps, Space, Divider,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  DesktopOutlined,
  CodeOutlined,
  CheckSquareOutlined,
  StopOutlined,
  ToolOutlined,
  UserOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import client from '../../api/client'
import { useAuthStore } from '../../store/auth'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

// ── Types ─────────────────────────────────────────────────────────────────────
interface AccessRequest {
  id: string
  ref_number: string
  request_type: 'hardware' | 'software'
  type_display: string
  status: 'pending_manager' | 'manager_approved' | 'manager_rejected' |
          'pending_assignment' | 'assigned' | 'cancelled'
  status_display: string
  requested_by_name: string
  requested_by_email: string
  manager_email: string
  manager_name: string
  justification: string
  hardware_type: string
  hardware_specification: string
  software_name: string
  hardware_asset_tag: string | null
  software_license_name: string | null
  manager_notes: string
  assignment_notes: string
  created_at: string
  approved_at: string | null
  assigned_at: string | null
}

interface HardwareAsset {
  id: string; asset_tag: string; name: string; location?: string; site_name?: string
}
interface SoftwareLicense {
  id: string; name: string; seats_available: number
}

const STATUS_COLORS: Record<string, string> = {
  pending_manager:    'gold',
  manager_approved:   'blue',
  manager_rejected:   'red',
  pending_assignment: 'orange',
  assigned:           'green',
  cancelled:          'default',
}

// ── AssignDrawer ───────────────────────────────────────────────────────────────
interface AssignDrawerProps {
  open: boolean
  request: AccessRequest | null
  onClose: () => void
  onAssigned: () => void
}

function AssignDrawer({ open, request, onClose, onAssigned }: AssignDrawerProps) {
  const [form] = Form.useForm()
  const [hardwareAssets, setHardwareAssets] = useState<HardwareAsset[]>([])
  const [softwareLicenses, setSoftwareLicenses] = useState<SoftwareLicense[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !request) return
    form.resetFields(); setSubmitError(null)
    setHardwareAssets([]); setSoftwareLicenses([])

    setLoadingAssets(true)
    if (request.request_type === 'hardware') {
      client.get<{ results: HardwareAsset[] }>('/assets/hardware/', {
        params: { is_archived: false, page_size: 100 },
      })
        .then(({ data }) => setHardwareAssets(data.results ?? []))
        .catch(() => message.warning('Could not load hardware assets.'))
        .finally(() => setLoadingAssets(false))
    } else {
      client.get<{ results: SoftwareLicense[] }>('/software/licenses/', {
        params: { is_active: true, page_size: 100 },
      })
        .then(({ data }) => setSoftwareLicenses(data.results ?? []))
        .catch(() => message.warning('Could not load software licenses.'))
        .finally(() => setLoadingAssets(false))
    }
  }, [open, request, form])

  async function handleFinish(values: Record<string, unknown>) {
    if (!request) return
    setSubmitting(true); setSubmitError(null)
    try {
      const payload: Record<string, unknown> = { assignment_notes: values.assignment_notes ?? '' }
      if (request.request_type === 'hardware') payload.hardware_asset_id = values.hardware_asset_id
      else payload.software_license_id = values.software_license_id

      await client.post(`/access-requests/${request.id}/assign/`, payload)
      message.success(`${request.ref_number} assigned successfully. Requestor has been notified.`)
      form.resetFields(); onClose(); onAssigned()
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: Record<string, unknown> } })?.response?.data
      setSubmitError(
        (resp as { detail?: string })?.detail ??
        'Assignment failed. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const isHardware = request?.request_type === 'hardware'

  return (
    <Drawer
      title={
        <Space>
          <ToolOutlined style={{ color: '#1677ff' }} />
          <span>Assign {isHardware ? 'Hardware Asset' : 'Software License'} — {request?.ref_number}</span>
        </Space>
      }
      placement="right"
      width={620}
      open={open}
      onClose={() => { form.resetFields(); onClose() }}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="primary" icon={<CheckSquareOutlined />} loading={submitting} onClick={() => form.submit()}>
            Confirm Assignment
          </Button>
        </div>
      }
    >
      {/* What the user requested */}
      {request && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          message={
            <div>
              <Text strong>
                {isHardware
                  ? `${request.requested_by_name || request.requested_by_email} needs: ${request.hardware_type}`
                  : `${request.requested_by_name || request.requested_by_email} needs: ${request.software_name}`}
              </Text>
              {request.hardware_specification && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  Spec: {request.hardware_specification}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                Reason: {request.justification}
              </div>
            </div>
          }
        />
      )}

      {submitError && (
        <Alert type="error" message={submitError} showIcon closable
          onClose={() => setSubmitError(null)} style={{ marginBottom: 16 }} />
      )}

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        {isHardware ? (
          <>
            <Form.Item
              label={<Text strong>Select Hardware Asset to Assign</Text>}
              name="hardware_asset_id"
              rules={[{ required: true, message: 'Please select a hardware asset.' }]}
              extra="The selected asset will be assigned to the requestor."
            >
              <Select
                showSearch
                loading={loadingAssets}
                placeholder="Search and select an asset (tag, name, location)…"
                filterOption={(input, opt) =>
                  String(opt?.children ?? '').toLowerCase().includes(input.toLowerCase())
                }
                size="large"
              >
                {hardwareAssets.map(a => (
                  <Option key={a.id} value={a.id}>
                    <Space>
                      <Text code>{a.asset_tag}</Text>
                      <Text>{a.name}</Text>
                      {(a.location || a.site_name) && (
                        <Text type="secondary">({a.location || a.site_name})</Text>
                      )}
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>
            {!loadingAssets && hardwareAssets.length === 0 && (
              <Alert type="warning" showIcon
                message="No hardware assets found."
                description="Add hardware assets via Assets → Hardware before assigning." />
            )}
          </>
        ) : (
          <>
            <Form.Item
              label={<Text strong>Select Software License to Assign</Text>}
              name="software_license_id"
              rules={[{ required: true, message: 'Please select a software license.' }]}
              extra="One seat will be consumed from the selected license."
            >
              <Select
                showSearch
                loading={loadingAssets}
                placeholder="Select a license with available seats…"
                filterOption={(input, opt) =>
                  String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                size="large"
              >
                {softwareLicenses.map(l => (
                  <Option
                    key={l.id} value={l.id}
                    disabled={l.seats_available <= 0}
                    label={l.name}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>{l.name}</Text>
                      <Tag color={l.seats_available > 0 ? 'green' : 'red'}>
                        {l.seats_available > 0 ? `${l.seats_available} seat(s) available` : 'No seats'}
                      </Tag>
                    </div>
                  </Option>
                ))}
              </Select>
            </Form.Item>
            {!loadingAssets && softwareLicenses.length === 0 && (
              <Alert type="warning" showIcon
                message="No active software licenses found."
                description="Add software licenses via Assets → Software Licenses." />
            )}
          </>
        )}

        <Divider />
        <Form.Item label="Assignment Notes (optional)" name="assignment_notes">
          <TextArea rows={3} placeholder="E.g. Asset collected from IT store room, serial #XXXX…"
            maxLength={1000} showCount />
        </Form.Item>
      </Form>
    </Drawer>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AccessRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const role = user?.role_name ?? ''
  const isAgent = ['it_agent', 'it_manager', 'super_admin'].includes(role)
  const isITManager = ['it_manager', 'super_admin'].includes(role)

  const [request, setRequest] = useState<AccessRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)

  async function loadRequest() {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const { data } = await client.get<AccessRequest>(`/access-requests/${id}/`)
      setRequest(data)
    } catch {
      setError('Failed to load request.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRequest() }, [id]) // eslint-disable-line

  async function handleCancel() {
    if (!request) return
    setCancelling(true)
    try {
      await client.post(`/access-requests/${request.id}/cancel/`)
      message.success('Request cancelled.'); loadRequest()
    } catch (err: unknown) {
      message.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to cancel.')
    } finally { setCancelling(false) }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (error || !request) return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/access-requests')} style={{ marginBottom: 16 }}>Back</Button>
      <Alert type="error" message={error ?? 'Request not found.'} showIcon />
    </div>
  )

  const req = request
  const isOwner = user?.email === req.requested_by_email
  const canCancel = (isOwner && ['pending_manager', 'pending_assignment'].includes(req.status)) ||
                    (isITManager && !['assigned', 'cancelled'].includes(req.status))
  const needsAssignment = isAgent && req.status === 'pending_assignment'

  // Steps
  const currentStep = {
    pending_manager: 1,
    manager_approved: 2,
    manager_rejected: 2,
    pending_assignment: 2,
    assigned: 3,
    cancelled: 0,
  }[req.status] ?? 0

  const stepStatus = req.status === 'manager_rejected' || req.status === 'cancelled' ? 'error' : 'process'

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/access-requests')} style={{ marginBottom: 16 }}>
        Back to Access Requests
      </Button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Title level={3} style={{ margin: 0, fontFamily: 'monospace' }}>{req.ref_number}</Title>
        <Tag color={req.request_type === 'hardware' ? 'geekblue' : 'purple'}
          icon={req.request_type === 'hardware' ? <DesktopOutlined /> : <CodeOutlined />}>
          {req.type_display}
        </Tag>
        <Tag color={STATUS_COLORS[req.status] ?? 'default'}>{req.status_display}</Tag>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Submitted {dayjs(req.created_at).format('DD MMM YYYY, HH:mm')}
        </Text>
      </div>

      {/* ── IT AGENT ACTION BANNER ── shown prominently when assignment is needed */}
      {needsAssignment && (
        <Alert
          type="warning"
          showIcon
          icon={<ToolOutlined />}
          style={{ marginBottom: 20, borderRadius: 8 }}
          message={
            <Text strong style={{ fontSize: 15 }}>
              Action Required — IT Assignment Pending
            </Text>
          }
          description={
            <div>
              <Text>
                This request has been <Text strong>approved by the manager</Text> and is waiting for
                an IT agent to assign the {req.request_type === 'hardware' ? 'hardware asset' : 'software license'}.
              </Text>
              <div style={{ marginTop: 12 }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckSquareOutlined />}
                  onClick={() => setAssignOpen(true)}
                >
                  Assign {req.request_type === 'hardware' ? 'Hardware Asset' : 'Software License'} Now
                </Button>
              </div>
            </div>
          }
        />
      )}

      {/* Completed banner */}
      {req.status === 'assigned' && (
        <Alert type="success" showIcon icon={<CheckCircleOutlined />}
          message={<Text strong>Request completed — {req.request_type === 'hardware' ? `Asset ${req.hardware_asset_tag}` : `License: ${req.software_license_name}`} assigned to requestor.</Text>}
          style={{ marginBottom: 20 }} />
      )}

      {/* Rejected / cancelled */}
      {req.status === 'manager_rejected' && (
        <Alert type="error" showIcon message="Rejected by manager." description={req.manager_notes || undefined} style={{ marginBottom: 20 }} />
      )}
      {req.status === 'cancelled' && (
        <Alert type="warning" showIcon icon={<StopOutlined />} message="This request was cancelled." style={{ marginBottom: 20 }} />
      )}

      {/* Workflow steps */}
      {req.status !== 'cancelled' && (
        <Card style={{ marginBottom: 20 }}>
          <Steps
            current={currentStep}
            status={stepStatus}
            items={[
              {
                title: 'Submitted',
                description: dayjs(req.created_at).format('DD MMM YYYY'),
                icon: <CheckCircleOutlined />,
              },
              {
                title: req.status === 'manager_rejected' ? 'Rejected by Manager'
                     : req.status === 'pending_manager' ? 'Awaiting Manager Approval'
                     : 'Manager Approved',
                description: req.approved_at ? dayjs(req.approved_at).format('DD MMM YYYY') : undefined,
                icon: req.status === 'pending_manager' ? <ClockCircleOutlined />
                    : req.status === 'manager_rejected' ? <CloseCircleOutlined />
                    : <CheckCircleOutlined />,
              },
              {
                title: req.status === 'pending_assignment' ? 'Pending IT Assignment' : 'Assigned',
                description: req.assigned_at ? dayjs(req.assigned_at).format('DD MMM YYYY') : undefined,
                icon: req.status === 'pending_assignment' ? <LoadingOutlined />
                    : req.status === 'assigned' ? <CheckCircleOutlined />
                    : <ClockCircleOutlined />,
              },
            ]}
          />
        </Card>
      )}

      <Row gutter={24}>
        {/* Left — details */}
        <Col xs={24} lg={16}>
          <Card title="What was requested" style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small" bordered>
              {req.request_type === 'hardware' ? (
                <>
                  <Descriptions.Item label="Asset Type">
                    <Tag icon={<DesktopOutlined />}>{req.hardware_type || '—'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Specification">
                    {req.hardware_specification || <Text type="secondary">Not specified</Text>}
                  </Descriptions.Item>
                </>
              ) : (
                <Descriptions.Item label="Software">
                  <Tag icon={<CodeOutlined />}>{req.software_name || '—'}</Tag>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Justification">
                <Text>{req.justification}</Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Assignment result */}
          {req.status === 'assigned' && (
            <Card title="Assignment Details" style={{ marginBottom: 16 }}>
              <Descriptions column={1} size="small" bordered>
                {req.request_type === 'hardware' ? (
                  <Descriptions.Item label="Asset Assigned">
                    <Text strong code>{req.hardware_asset_tag ?? '—'}</Text>
                  </Descriptions.Item>
                ) : (
                  <Descriptions.Item label="License Assigned">
                    <Text strong>{req.software_license_name ?? '—'}</Text>
                  </Descriptions.Item>
                )}
                {req.assignment_notes && (
                  <Descriptions.Item label="Notes">{req.assignment_notes}</Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          )}

          {/* Manager notes */}
          {req.manager_notes && (
            <Card title={<Space><InfoCircleOutlined />Manager Notes</Space>} style={{ marginBottom: 16 }}>
              <Text>{req.manager_notes}</Text>
            </Card>
          )}
        </Col>

        {/* Right — people + actions */}
        <Col xs={24} lg={8}>
          <Card title={<Space><UserOutlined />People</Space>} style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Requestor">
                <div>
                  <div style={{ fontWeight: 500 }}>{req.requested_by_name || '—'}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{req.requested_by_email}</Text>
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Manager">
                <div>
                  <div style={{ fontWeight: 500 }}>{req.manager_name || '—'}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{req.manager_email}</Text>
                </div>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Actions">
            {needsAssignment && (
              <Button type="primary" icon={<CheckSquareOutlined />} block size="large"
                onClick={() => setAssignOpen(true)} style={{ marginBottom: 8 }}>
                Assign Now
              </Button>
            )}
            {canCancel && (
              <Popconfirm title="Cancel this request?" okText="Yes, cancel" okButtonProps={{ danger: true }}
                onConfirm={handleCancel}>
                <Button danger icon={<CloseCircleOutlined />} loading={cancelling} block style={{ marginBottom: 8 }}>
                  Cancel Request
                </Button>
              </Popconfirm>
            )}
            {!needsAssignment && !canCancel && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {req.status === 'assigned' ? 'Request completed.' :
                 req.status === 'cancelled' ? 'Request cancelled.' :
                 req.status === 'manager_rejected' ? 'Rejected by manager.' :
                 req.status === 'pending_manager' ? 'Waiting for manager approval.' :
                 'No actions available.'}
              </Text>
            )}
          </Card>
        </Col>
      </Row>

      <AssignDrawer
        open={assignOpen}
        request={req}
        onClose={() => setAssignOpen(false)}
        onAssigned={() => { setAssignOpen(false); loadRequest() }}
      />
    </div>
  )
}
