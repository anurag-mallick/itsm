import { useEffect, useState } from 'react'
import {
  Form, Input, Select, Button, Typography, Card, message,
  InputNumber, DatePicker,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import client from '../../api/client'

const { Title } = Typography
const { TextArea } = Input
const { Option } = Select

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentUser {
  id: string
  email: string
  full_name: string
}

interface CreatedChange {
  id: string
  ref_number: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreateChange() {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const [users, setUsers] = useState<AgentUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [labelInput, setLabelInput] = useState('')

  // Load users for assignee dropdown
  useEffect(() => {
    setLoadingUsers(true)
    client
      .get<AgentUser[] | { results: AgentUser[] }>('/users/')
      .then(({ data }) =>
        setUsers(Array.isArray(data) ? data : (data as { results: AgentUser[] }).results ?? [])
      )
      .catch(() => { /* non-critical */ })
      .finally(() => setLoadingUsers(false))
  }, [])

  async function handleSubmit(values: Record<string, unknown>) {
    setSubmitting(true)
    try {
      // Labels stored as comma-separated string from the Select tags input
      const labelsArr = (values.labels as string[] | undefined) ?? []
      const labelsStr = labelsArr.join(',')

      // Due date handling
      const due_date = values.due_date
        ? dayjs(values.due_date as string).format('YYYY-MM-DD')
        : null

      const payload = {
        title: values.title as string,
        description: (values.description as string | undefined) ?? '',
        change_type: (values.change_type as string | undefined) ?? 'task',
        priority: (values.priority as string | undefined) ?? 'medium',
        status: (values.status as string | undefined) ?? 'backlog',
        assignee: (values.assignee as string | undefined) ?? null,
        due_date,
        story_points: (values.story_points as number | undefined) ?? null,
        labels: labelsStr,
        custom_fields: {},
        linked_ticket_ids: [],
      }

      const { data } = await client.post<CreatedChange>('/changes/', payload)

      if (!data?.id) {
        message.error('Change was created but no ID was returned.')
        return
      }

      message.success(`Change ${data.ref_number} created.`)
      navigate(`/changes/${data.id}`)
    } catch {
      message.error('Failed to create change. Please check your inputs and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/changes')}>
          Back
        </Button>
        <Title level={4} style={{ margin: 0 }}>New Change Request</Title>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            change_type: 'task',
            priority: 'medium',
            status: 'backlog',
          }}
          requiredMark="optional"
        >
          {/* Title */}
          <Form.Item
            label="Title"
            name="title"
            rules={[{ required: true, message: 'Title is required.' }]}
          >
            <Input placeholder="Short title for this change request" />
          </Form.Item>

          {/* Type / Priority / Status row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Form.Item label="Type" name="change_type">
              <Select>
                <Option value="epic">Epic</Option>
                <Option value="feature">Feature</Option>
                <Option value="story">Story</Option>
                <Option value="task">Task</Option>
                <Option value="bug">Bug</Option>
                <Option value="improvement">Improvement</Option>
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

            <Form.Item label="Status" name="status">
              <Select>
                <Option value="backlog">Backlog</Option>
                <Option value="todo">To Do</Option>
                <Option value="in_progress">In Progress</Option>
              </Select>
            </Form.Item>
          </div>

          {/* Assignee / Due Date row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item label="Assignee" name="assignee">
              <Select
                showSearch
                allowClear
                placeholder="Unassigned"
                loading={loadingUsers}
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
            </Form.Item>

            <Form.Item label="Due Date" name="due_date">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {/* Story Points / Labels row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item label="Story Points" name="story_points">
              <InputNumber
                min={1}
                max={100}
                style={{ width: '100%' }}
                placeholder="1–100"
              />
            </Form.Item>

            <Form.Item label="Labels" name="labels">
              <Select
                mode="tags"
                placeholder="Add labels (press Enter)"
                tokenSeparators={[',']}
                searchValue={labelInput}
                onSearch={setLabelInput}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </div>

          {/* Description */}
          <Form.Item label="Description" name="description">
            <TextArea rows={6} placeholder="Detailed description of this change request…" />
          </Form.Item>

          {/* Submit */}
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Create Change Request
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
