import { useEffect, useState } from 'react'
import {
  Form, Input, Select, Button, Typography, Card, Spin, message,
  InputNumber, DatePicker, Checkbox,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import client from '../../api/client'

const { Title } = Typography
const { TextArea } = Input
const { Option } = Select

// ── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: number
  name: string
}

interface CustomFieldOption {
  label: string
  value: string
}

interface CustomField {
  id: number
  name: string
  field_key: string
  field_type: 'text' | 'textarea' | 'number' | 'date' | 'dropdown' | 'checkbox' | 'multi_select'
  is_required: boolean
  options?: CustomFieldOption[]
}

interface CreatedTicket {
  id: string
  ticket_number: string
  status: string
  subject: string
}

// ── Custom field renderer ─────────────────────────────────────────────────────

function renderCustomField(field: CustomField) {
  switch (field.field_type) {
    case 'text':
      return <Input />
    case 'textarea':
      return <TextArea rows={3} />
    case 'number':
      return <InputNumber style={{ width: '100%' }} />
    case 'date':
      return <DatePicker style={{ width: '100%' }} />
    case 'dropdown':
      return (
        <Select>
          {(field.options ?? []).map(o => (
            <Option key={o.value} value={o.value}>{o.label}</Option>
          ))}
        </Select>
      )
    case 'checkbox':
      return <Checkbox />
    case 'multi_select':
      return (
        <Select mode="multiple">
          {(field.options ?? []).map(o => (
            <Option key={o.value} value={o.value}>{o.label}</Option>
          ))}
        </Select>
      )
    default:
      return <Input />
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreateTicket() {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const [categories, setCategories] = useState<Category[]>([])
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [loadingCustomFields, setLoadingCustomFields] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)

  // Load categories on mount
  useEffect(() => {
    setLoadingCategories(true)
    client.get<Category[]>('/categories/')
      .then(({ data }) => setCategories(data))
      .catch(() => message.error('Failed to load categories.'))
      .finally(() => setLoadingCategories(false))
  }, [])

  // Load custom fields whenever the selected category changes.
  // If no category is selected load fields with no category_id (module-level fields).
  // If a category is selected load fields scoped to that category.
  useEffect(() => {
    setLoadingCustomFields(true)
    setCustomFields([])

    const params: Record<string, string | number> = { module: 'tickets' }
    if (selectedCategoryId !== null) {
      params.category_id = selectedCategoryId
    }

    client.get<CustomField[]>('/custom-fields/', { params })
      .then(({ data }) => {
        // The endpoint may return a paginated response or a plain array.
        const list = Array.isArray(data)
          ? data
          : ((data as unknown as { results: CustomField[] }).results ?? [])
        setCustomFields(list)
      })
      .catch(() => message.error('Failed to load custom fields.'))
      .finally(() => setLoadingCustomFields(false))
  }, [selectedCategoryId])

  function handleCategoryChange(val: number | undefined) {
    const newId = val ?? null
    // Clear previously entered custom field values before the new set loads.
    const resetObj: Record<string, undefined> = {}
    customFields.forEach(f => { resetObj[`cf_${f.field_key}`] = undefined })
    form.setFieldsValue(resetObj)
    setSelectedCategoryId(newId)
  }

  async function handleSubmit(values: Record<string, unknown>) {
    setSubmitting(true)
    try {
      // Collect custom field values keyed by field name.
      const custom_fields: Record<string, unknown> = {}
      customFields.forEach(f => {
        const key = `cf_${f.field_key}`
        if (values[key] !== undefined && values[key] !== null) {
          custom_fields[f.name] = values[key]
        }
        delete values[key]
      })

      const payload = {
        subject: values.subject as string,
        description: (values.description as string | undefined) ?? '',
        priority: (values.priority as string | undefined) ?? 'medium',
        category: (values.category_id as number | undefined) ?? null,
        custom_fields,
      }

      const { data } = await client.post<CreatedTicket>('/tickets/', payload)

      if (!data?.id) {
        message.error('Ticket was created but no ticket ID was returned. Please check the tickets list.')
        return
      }

      message.success('Ticket created successfully.')
      navigate(`/tickets/${data.id}`)
    } catch {
      message.error('Failed to create ticket. Please check your inputs and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/tickets')}
        >
          Back
        </Button>
        <Title level={4} style={{ margin: 0 }}>New Ticket</Title>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ priority: 'medium' }}
          requiredMark="optional"
        >
          {/* Subject */}
          <Form.Item
            label="Subject"
            name="subject"
            rules={[{ required: true, message: 'Subject is required.' }]}
          >
            <Input placeholder="Brief description of the issue" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Category */}
            <Form.Item label="Category" name="category_id">
              <Select
                placeholder="Select a category"
                loading={loadingCategories}
                allowClear
                onChange={handleCategoryChange}
                onClear={() => handleCategoryChange(undefined)}
              >
                {categories.map(c => (
                  <Option key={c.id} value={c.id}>{c.name}</Option>
                ))}
              </Select>
            </Form.Item>

            {/* Priority */}
            <Form.Item label="Priority" name="priority">
              <Select>
                <Option value="low">Low</Option>
                <Option value="medium">Medium</Option>
                <Option value="high">High</Option>
                <Option value="critical">Critical</Option>
              </Select>
            </Form.Item>
          </div>

          {/* Description */}
          <Form.Item label="Description" name="description">
            <TextArea rows={4} placeholder="Provide details about the issue…" />
          </Form.Item>

          {/* Dynamic custom fields */}
          {loadingCustomFields && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Spin size="small" />
            </div>
          )}

          {!loadingCustomFields && customFields.length > 0 && (
            <>
              <div style={{
                borderTop: '1px solid #f0f0f0',
                margin: '8px 0 16px',
                paddingTop: 16,
                fontWeight: 500,
                color: '#555',
                fontSize: 13,
              }}>
                Additional Fields
              </div>
              {customFields.map(field => (
                <Form.Item
                  key={field.id}
                  label={field.name}
                  name={`cf_${field.field_key}`}
                  valuePropName={field.field_type === 'checkbox' ? 'checked' : 'value'}
                  rules={
                    field.is_required
                      ? [{ required: true, message: `${field.name} is required.` }]
                      : []
                  }
                >
                  {renderCustomField(field)}
                </Form.Item>
              ))}
            </>
          )}

          {/* Submit */}
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Submit Ticket
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
