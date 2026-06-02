import { useEffect, useState, useCallback } from 'react'
import {
  Row,
  Col,
  Card,
  Statistic,
  Typography,
  Divider,
  Spin,
  Alert,
  Button,
  Tooltip,
  Progress,
  Tag,
  Space,
} from 'antd'
import {
  CustomerServiceOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DesktopOutlined,
  CodeOutlined,
  WarningOutlined,
  UserOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'

const { Title, Text } = Typography

interface DashboardStats {
  open_tickets: number
  in_progress_tickets: number
  pending_tickets: number
  sla_breaching: number
  unassigned_tickets: number
  resolved_today: number
  my_open_tickets: number
  active_hardware: number
  under_repair: number
  warranty_expiring_30d: number
  total_licenses: number
  licenses_expiring_30d: number
  licenses_expired: number
}

interface StatusBucket {
  status: string
  count: number
}

interface PriorityBucket {
  priority: string
  count: number
}

interface TicketReport {
  by_status: StatusBucket[]
  by_priority: PriorityBucket[]
}

// ── Color maps ────────────────────────────────────────────────────────────────
const STATUS_PROGRESS_COLOR: Record<string, string> = {
  open: '#1677ff',
  in_progress: '#fa8c16',
  pending_info: '#faad14',
  resolved: '#52c41a',
  closed: '#d9d9d9',
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_info: 'Pending Info',
  resolved: 'Resolved',
  closed: 'Closed',
}

const PRIORITY_TAG_COLOR: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'blue',
  low: 'default',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [report, setReport] = useState<TicketReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const { data } = await client.get<DashboardStats>('/reports/dashboard/')
      setStats(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchReport = useCallback(async () => {
    setReportLoading(true)
    try {
      const { data } = await client.get<TicketReport>('/reports/tickets/')
      setReport(data)
    } catch {
      // Non-critical; distribution section will simply not render
    } finally {
      setReportLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchReport()
  }, [fetchStats, fetchReport])

  const val = (n: number | undefined) => (n ?? 0)

  // ── Compute totals for percentage bars ────────────────────────────────────
  const statusTotal = report
    ? report.by_status.reduce((sum, b) => sum + b.count, 0)
    : 0

  const priorityTotal = report
    ? report.by_priority.reduce((sum, b) => sum + b.count, 0)
    : 0

  function refreshAll() {
    fetchStats()
    fetchReport()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>Dashboard</Title>
          <Text type="secondary">Welcome to the IT Service Management portal.</Text>
        </div>
        <Tooltip title="Refresh statistics">
          <Button
            icon={<ReloadOutlined />}
            onClick={refreshAll}
            loading={loading || reportLoading}
            size="small"
          >
            Refresh
          </Button>
        </Tooltip>
      </div>

      {error && (
        <Alert
          type="error"
          message="Could not load dashboard statistics."
          showIcon
          style={{ marginTop: 16 }}
          action={
            <Button size="small" onClick={refreshAll}>Retry</Button>
          }
        />
      )}

      <Spin spinning={loading}>
        <Divider orientation="left" style={{ marginTop: 20 }}>Tickets</Divider>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card
              hoverable
              onClick={() => navigate('/tickets?status=open')}
              style={{ cursor: 'pointer' }}
            >
              <Statistic
                title="Open Tickets"
                value={val(stats?.open_tickets)}
                prefix={<CustomerServiceOutlined />}
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/tickets?status=resolved')} style={{ cursor: 'pointer' }}>
              <Statistic
                title="Resolved Today"
                value={val(stats?.resolved_today)}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card
              hoverable
              onClick={() => navigate('/tickets?sla_breached=true')}
              style={{ cursor: 'pointer' }}
            >
              <Statistic
                title="SLA Breaching"
                value={val(stats?.sla_breaching)}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/tickets?assigned=false')} style={{ cursor: 'pointer' }}>
              <Statistic
                title="Unassigned"
                value={val(stats?.unassigned_tickets)}
                prefix={<WarningOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/tickets?status=in_progress')} style={{ cursor: 'pointer' }}>
              <Statistic
                title="In Progress"
                value={val(stats?.in_progress_tickets)}
                prefix={<ToolOutlined />}
                valueStyle={{ color: '#13c2c2' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/tickets?status=pending')} style={{ cursor: 'pointer' }}>
              <Statistic
                title="Pending Info"
                value={val(stats?.pending_tickets)}
                prefix={<QuestionCircleOutlined />}
                valueStyle={{ color: '#06b6d4' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/tickets?my_tickets=true')} style={{ cursor: 'pointer' }}>
              <Statistic
                title="My Open Tickets"
                value={val(stats?.my_open_tickets)}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>

        {/* ── Ticket distribution ─────────────────────────────────────────── */}
        {(reportLoading || (report && report.by_status.length > 0)) && (
          <>
            <Divider orientation="left" style={{ marginTop: 24 }}>Ticket Status Distribution</Divider>
            <Spin spinning={reportLoading}>
              <Row gutter={[24, 16]}>
                <Col xs={24} md={14}>
                  <Card title="By Status" size="small">
                    {report && statusTotal > 0
                      ? report.by_status.map(bucket => {
                          const pct = Math.round((bucket.count / statusTotal) * 100)
                          return (
                            <div key={bucket.status} style={{ marginBottom: 14 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Text style={{ fontSize: 13 }}>
                                  {STATUS_LABEL[bucket.status] ?? bucket.status}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {bucket.count} ({pct}%)
                                </Text>
                              </div>
                              <Progress
                                percent={pct}
                                showInfo={false}
                                strokeColor={STATUS_PROGRESS_COLOR[bucket.status] ?? '#1677ff'}
                                size="small"
                                style={{ marginBottom: 0 }}
                              />
                            </div>
                          )
                        })
                      : !reportLoading && (
                          <Text type="secondary">No ticket data available.</Text>
                        )}
                  </Card>
                </Col>

                <Col xs={24} md={10}>
                  <Card title="By Priority" size="small">
                    {report && priorityTotal > 0 ? (
                      <Space wrap size={[8, 10]}>
                        {report.by_priority.map(bucket => (
                          <Tag
                            key={bucket.priority}
                            color={PRIORITY_TAG_COLOR[bucket.priority] ?? 'default'}
                            style={{ fontSize: 13, padding: '4px 10px' }}
                          >
                            {bucket.priority.charAt(0).toUpperCase() + bucket.priority.slice(1)}{' '}
                            <Text
                              strong
                              style={{
                                color: 'inherit',
                                marginLeft: 4,
                              }}
                            >
                              {bucket.count}
                            </Text>
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      !reportLoading && (
                        <Text type="secondary">No priority data available.</Text>
                      )
                    )}
                  </Card>
                </Col>
              </Row>
            </Spin>
          </>
        )}

        <Divider orientation="left" style={{ marginTop: 24 }}>Assets</Divider>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card
              hoverable
              onClick={() => navigate('/assets/hardware')}
              style={{ cursor: 'pointer' }}
            >
              <Statistic
                title="Active Hardware"
                value={val(stats?.active_hardware)}
                prefix={<DesktopOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/assets/hardware?status=under_repair')} style={{ cursor: 'pointer' }}>
              <Statistic
                title="Under Repair"
                value={val(stats?.under_repair)}
                prefix={<ToolOutlined />}
                valueStyle={{ color: '#ff7a45' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/assets/hardware?warranty_expiring=30')} style={{ cursor: 'pointer' }}>
              <Statistic
                title="Warranty Expiring (30d)"
                value={val(stats?.warranty_expiring_30d)}
                prefix={<WarningOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/assets/software')} style={{ cursor: 'pointer' }}>
              <Statistic
                title="Software Licenses"
                value={val(stats?.total_licenses)}
                prefix={<CodeOutlined />}
                valueStyle={{ color: '#13c2c2' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card
              hoverable
              onClick={() => navigate('/assets/software')}
              style={{ cursor: 'pointer' }}
            >
              <Statistic
                title="Expiring Licenses (30d)"
                value={val(stats?.licenses_expiring_30d)}
                prefix={<WarningOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => navigate('/assets/software')} style={{ cursor: 'pointer' }}>
              <Statistic
                title="Expired Licenses"
                value={val(stats?.licenses_expired)}
                prefix={<WarningOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </>
  )
}
