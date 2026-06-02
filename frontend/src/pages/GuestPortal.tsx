import { useEffect, useState } from 'react'
import {
  Button, Card, Collapse, Descriptions, Form, Input, Result, Select,
  Tag, Typography, message,
} from 'antd'
import { MailOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons'
import client from '../api/client'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Option } = Select
const { Panel } = Collapse

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortalCategory {
  id: number
  name: string
  sla_response_hours: number
}

interface SubmitResponse {
  ticket_number: string
  subject: string
  status: string
  message: string
}

interface TicketStatus {
  ticket_number: string
  subject: string
  status: string
  priority: string
  category: string | null
  created_at: string
  updated_at: string
  assignee: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function formatLabel(val: string): string {
  return val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Submit Form ───────────────────────────────────────────────────────────────

function SubmitTicketForm() {
  const [form] = Form.useForm()
  const [categories, setCategories] = useState<PortalCategory[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<SubmitResponse | null>(null)

  useEffect(() => {
    setLoadingCats(true)
    // Public endpoint — no auth header needed; client may attach token if present, which is harmless
    client.get<PortalCategory[]>('/portal/categories/')
      .then(({ data }) => setCategories(data))
      .catch(() => { /* categories are optional; silently skip if unavailable */ })
      .finally(() => setLoadingCats(false))
  }, [])

  async function handleSubmit(values: Record<string, unknown>) {
    setSubmitting(true)
    try {
      const payload = {
        name: (values.name as string | undefined) ?? '',
        email: values.email as string,
        subject: values.subject as string,
        description: (values.description as string | undefined) ?? '',
        priority: (values.priority as string | undefined) ?? 'medium',
        category_id: (values.category_id as number | undefined) ?? null,
      }
      const { data } = await client.post<SubmitResponse>('/portal/submit/', payload)
      setSuccess(data)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(detail ?? 'Failed to submit ticket. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <Result
        status="success"
        title={`Ticket ${success.ticket_number} Submitted`}
        subTitle={success.message}
        extra={[
          <Button
            key="new"
            onClick={() => { setSuccess(null); form.resetFields() }}
          >
            Submit Another Ticket
          </Button>,
        ]}
      />
    )
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{ priority: 'medium' }}
      requiredMark="optional"
    >
      <Form.Item
        label="Your Name"
        name="name"
        rules={[{ required: true, message: 'Name is required.' }]}
      >
        <Input placeholder="Full name" />
      </Form.Item>

      <Form.Item
        label="Email Address"
        name="email"
        rules={[
          { required: true, message: 'Email address is required.' },
          { type: 'email', message: 'Please enter a valid email address.' },
        ]}
      >
        <Input placeholder="you@example.com" prefix={<MailOutlined />} />
      </Form.Item>

      <Form.Item
        label="Subject"
        name="subject"
        rules={[
          { required: true, message: 'Subject is required.' },
          { min: 5, message: 'Subject must be at least 5 characters.' },
        ]}
      >
        <Input placeholder="Brief description of the issue" />
      </Form.Item>

      <Form.Item label="Category" name="category_id">
        <Select
          placeholder="Select a category (optional)"
          loading={loadingCats}
          allowClear
        >
          {categories.map(c => (
            <Option key={c.id} value={c.id}>{c.name}</Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item label="Priority" name="priority">
        <Select>
          <Option value="low">Low</Option>
          <Option value="medium">Medium</Option>
          <Option value="high">High</Option>
          <Option value="critical">Critical</Option>
        </Select>
      </Form.Item>

      <Form.Item
        label="Description"
        name="description"
        rules={[
          { required: true, message: 'Description is required.' },
          { min: 10, message: 'Description must be at least 10 characters.' },
        ]}
      >
        <TextArea rows={5} placeholder="Describe your issue in detail…" />
      </Form.Item>

      <Form.Item style={{ marginBottom: 0 }}>
        <Button
          type="primary"
          htmlType="submit"
          loading={submitting}
          block
          size="large"
          icon={<SendOutlined />}
        >
          Submit Ticket
        </Button>
      </Form.Item>
    </Form>
  )
}

// ── Status Check ──────────────────────────────────────────────────────────────

function CheckTicketStatus() {
  const [form] = Form.useForm()
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<TicketStatus | null>(null)
  const [notFound, setNotFound] = useState(false)

  async function handleCheck(values: { ticket_number: string; email: string }) {
    setChecking(true)
    setResult(null)
    setNotFound(false)
    try {
      const { data } = await client.get<TicketStatus>(
        `/portal/status/${values.ticket_number.trim().toUpperCase()}/`,
        { params: { email: values.email.trim().toLowerCase() } },
      )
      setResult(data)
    } catch (err: unknown) {
      const statusCode = (err as { response?: { status?: number } })?.response?.status
      if (statusCode === 404) {
        setNotFound(true)
      } else {
        message.error('Failed to retrieve ticket status. Please try again.')
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleCheck}
        requiredMark="optional"
      >
        <Form.Item
          label="Ticket Number"
          name="ticket_number"
          rules={[{ required: true, message: 'Ticket number is required.' }]}
        >
          <Input placeholder="e.g. TKT-00001" prefix={<SearchOutlined />} />
        </Form.Item>

        <Form.Item
          label="Email Address"
          name="email"
          rules={[
            { required: true, message: 'Email address is required.' },
            { type: 'email', message: 'Please enter a valid email address.' },
          ]}
        >
          <Input placeholder="Email used when submitting" prefix={<MailOutlined />} />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="default"
            htmlType="submit"
            loading={checking}
            block
            icon={<SearchOutlined />}
          >
            Check Status
          </Button>
        </Form.Item>
      </Form>

      {notFound && (
        <div style={{
          marginTop: 16,
          padding: '12px 16px',
          background: '#fff2f0',
          border: '1px solid #ffccc7',
          borderRadius: 6,
          color: '#cf1322',
        }}>
          No ticket found with this number and email combination.
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20 }}>
          <Descriptions
            title={`Ticket ${result.ticket_number}`}
            bordered
            size="small"
            column={1}
          >
            <Descriptions.Item label="Subject">{result.subject}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={STATUS_COLORS[result.status] ?? 'default'}>
                {formatLabel(result.status)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Priority">
              <Tag color={PRIORITY_COLORS[result.priority] ?? 'default'}>
                {formatLabel(result.priority)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Category">
              {result.category ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Assigned To">
              {result.assignee ?? <span style={{ color: '#bbb' }}>Unassigned</span>}
            </Descriptions.Item>
            <Descriptions.Item label="Created">
              {formatDate(result.created_at)}
            </Descriptions.Item>
            <Descriptions.Item label="Last Updated">
              {formatDate(result.updated_at)}
            </Descriptions.Item>
          </Descriptions>
        </div>
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuestPortal() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f0f2f5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 16px 60px',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32, maxWidth: 600, width: '100%' }}>
        <Title level={2} style={{ marginBottom: 4 }}>IT Support Portal</Title>
        <Paragraph type="secondary" style={{ fontSize: 15, marginBottom: 0 }}>
          Bluspring Enterprises — IT Service Desk
        </Paragraph>
      </div>

      {/* Submit Ticket Card */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SendOutlined />
            <span>Submit a Support Ticket</span>
          </div>
        }
        style={{ maxWidth: 600, width: '100%', marginBottom: 24, borderRadius: 8 }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <SubmitTicketForm />
      </Card>

      {/* Check Status Collapsible Card */}
      <Card
        style={{ maxWidth: 600, width: '100%', borderRadius: 8 }}
        styles={{ body: { padding: 0 } }}
      >
        <Collapse
          ghost
          expandIconPosition="end"
          style={{ borderRadius: 8 }}
        >
          <Panel
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <SearchOutlined />
                <Text strong>Check Ticket Status</Text>
              </div>
            }
            key="status"
          >
            <div style={{ padding: '0 4px 8px' }}>
              <CheckTicketStatus />
            </div>
          </Panel>
        </Collapse>
      </Card>

      {/* Footer */}
      <div style={{ marginTop: 32, textAlign: 'center' }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#1677ff' }}>Sign in to the IT Portal</a>
        </Text>
      </div>
    </div>
  )
}
