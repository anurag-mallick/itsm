import { useEffect, useState, useCallback } from 'react'
import {
  Typography, Button, Table, Tag, Space, Drawer, Form, Input,
  Select, Radio, InputNumber, Divider, Popconfirm, message,
  Spin, Empty, Switch, Tooltip, Badge, Alert,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, MinusCircleOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import client from '../../api/client'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConditionOption {
  value: string
  label: string
}

interface ConditionField {
  value: string
  label: string
  type: 'select' | 'text'
  options?: string[] | ConditionOption[]
}

interface Operator {
  value: string
  label: string
  applicable: string[]
}

interface ActionType {
  value: string
  label: string
  input: 'agent' | 'select' | 'category' | 'text'
  options?: string[]
}

interface Agent {
  id: string
  email: string
}

interface Category {
  id: number
  name: string
}

interface FieldsData {
  condition_fields: ConditionField[]
  operators: Operator[]
  action_types: ActionType[]
  agents: Agent[]
  categories: Category[]
}

interface Condition {
  field: string
  operator: string
  value: string | string[]
}

interface Action {
  type: string
  value: string
}

interface WorkflowRule {
  id: string
  name: string
  description: string
  trigger: string
  trigger_display: string
  conditions: Condition[]
  condition_match: 'all' | 'any'
  condition_match_display: string
  actions: Action[]
  is_active: boolean
  run_order: number
  times_triggered: number
  last_triggered_at: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

interface TestResult {
  rule: string
  ticket: string
  overall_match: boolean
  condition_results: { condition: Condition; result: boolean }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerColor(trigger: string) {
  return trigger === 'ticket_created' ? 'blue' : 'purple'
}

// ── Condition row ─────────────────────────────────────────────────────────────

interface ConditionRowProps {
  index: number
  condition: Condition
  fields: ConditionField[]
  operators: Operator[]
  onChange: (index: number, updated: Condition) => void
  onRemove: (index: number) => void
}

function ConditionRow({ index, condition, fields, operators, onChange, onRemove }: ConditionRowProps) {
  const selectedField = fields.find(f => f.value === condition.field)
  const fieldType = selectedField?.type ?? 'text'

  const applicableOperators = operators.filter(op => op.applicable.includes(fieldType))

  function handleFieldChange(val: string) {
    const field = fields.find(f => f.value === val)
    const newOperator = operators.find(op => op.applicable.includes(field?.type ?? 'text'))?.value ?? 'equals'
    onChange(index, { field: val, operator: newOperator, value: '' })
  }

  function handleOperatorChange(val: string) {
    onChange(index, { ...condition, operator: val })
  }

  function handleValueChange(val: string | string[]) {
    onChange(index, { ...condition, value: val })
  }

  const isMulti = condition.operator === 'in' || condition.operator === 'not_in'
  const noValueNeeded = condition.operator === 'is_empty' || condition.operator === 'is_not_empty'

  function renderValueInput() {
    if (noValueNeeded) {
      return <Text type="secondary" style={{ fontSize: 12, lineHeight: '32px', whiteSpace: 'nowrap' }}>No value needed</Text>
    }
    if (fieldType === 'select' && selectedField?.options) {
      const opts = selectedField.options
      return (
        <Select
          style={{ minWidth: 140 }}
          mode={isMulti ? 'multiple' : undefined}
          value={condition.value}
          onChange={handleValueChange}
          placeholder="Select value"
          size="small"
        >
          {opts.map(opt => {
            if (typeof opt === 'string') {
              return <Option key={opt} value={opt}>{opt}</Option>
            }
            return <Option key={opt.value} value={opt.value}>{opt.label}</Option>
          })}
        </Select>
      )
    }
    return (
      <Input
        style={{ minWidth: 140 }}
        size="small"
        value={typeof condition.value === 'string' ? condition.value : ''}
        onChange={e => handleValueChange(e.target.value)}
        placeholder="Value"
      />
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
      <Select
        style={{ minWidth: 160 }}
        size="small"
        value={condition.field || undefined}
        onChange={handleFieldChange}
        placeholder="Select field"
      >
        {fields.map(f => (
          <Option key={f.value} value={f.value}>{f.label}</Option>
        ))}
      </Select>

      <Select
        style={{ minWidth: 160 }}
        size="small"
        value={condition.operator || undefined}
        onChange={handleOperatorChange}
        placeholder="Operator"
      >
        {applicableOperators.map(op => (
          <Option key={op.value} value={op.value}>{op.label}</Option>
        ))}
      </Select>

      {renderValueInput()}

      <Button
        type="text"
        danger
        size="small"
        icon={<MinusCircleOutlined />}
        onClick={() => onRemove(index)}
      />
    </div>
  )
}

// ── Action row ────────────────────────────────────────────────────────────────

interface ActionRowProps {
  index: number
  action: Action
  actionTypes: ActionType[]
  agents: Agent[]
  categories: Category[]
  onChange: (index: number, updated: Action) => void
  onRemove: (index: number) => void
}

function ActionRow({ index, action, actionTypes, agents, categories, onChange, onRemove }: ActionRowProps) {
  const selectedType = actionTypes.find(t => t.value === action.type)

  function handleTypeChange(val: string) {
    onChange(index, { type: val, value: '' })
  }

  function renderValueInput() {
    if (!selectedType) return null

    if (selectedType.input === 'agent') {
      return (
        <Select
          style={{ minWidth: 200 }}
          size="small"
          value={action.value || undefined}
          onChange={val => onChange(index, { ...action, value: val })}
          placeholder="Select agent"
          showSearch
          filterOption={(input, option) =>
            String(option?.label ?? option?.children ?? '').toLowerCase().includes(input.toLowerCase())
          }
        >
          {agents.map(a => (
            <Option key={String(a.id)} value={String(a.id)}>{a.email}</Option>
          ))}
        </Select>
      )
    }

    if (selectedType.input === 'category') {
      return (
        <Select
          style={{ minWidth: 200 }}
          size="small"
          value={action.value || undefined}
          onChange={val => onChange(index, { ...action, value: val })}
          placeholder="Select category"
          showSearch
          filterOption={(input, option) =>
            String(option?.label ?? option?.children ?? '').toLowerCase().includes(input.toLowerCase())
          }
        >
          {categories.map(c => (
            <Option key={String(c.id)} value={String(c.id)}>{c.name}</Option>
          ))}
        </Select>
      )
    }

    if (selectedType.input === 'select' && selectedType.options) {
      return (
        <Select
          style={{ minWidth: 160 }}
          size="small"
          value={action.value || undefined}
          onChange={val => onChange(index, { ...action, value: val })}
          placeholder="Select value"
        >
          {selectedType.options.map(opt => (
            <Option key={opt} value={opt}>{opt}</Option>
          ))}
        </Select>
      )
    }

    if (selectedType.input === 'text') {
      return (
        <TextArea
          style={{ minWidth: 200 }}
          size="small"
          rows={2}
          value={action.value}
          onChange={e => onChange(index, { ...action, value: e.target.value })}
          placeholder="Note text"
        />
      )
    }

    return null
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' }}>
      <Select
        style={{ minWidth: 200 }}
        size="small"
        value={action.type || undefined}
        onChange={handleTypeChange}
        placeholder="Select action"
      >
        {actionTypes.map(t => (
          <Option key={t.value} value={t.value}>{t.label}</Option>
        ))}
      </Select>

      {renderValueInput()}

      <Button
        type="text"
        danger
        size="small"
        icon={<MinusCircleOutlined />}
        onClick={() => onRemove(index)}
        style={{ marginTop: 2 }}
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkflowRules() {
  const [rules, setRules] = useState<WorkflowRule[]>([])
  const [loading, setLoading] = useState(true)
  const [fieldsData, setFieldsData] = useState<FieldsData | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<WorkflowRule | null>(null)
  const [saving, setSaving] = useState(false)

  // Drawer form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [trigger, setTrigger] = useState<string>('ticket_created')
  const [conditionMatch, setConditionMatch] = useState<'all' | 'any'>('all')
  const [runOrder, setRunOrder] = useState<number>(0)
  const [conditions, setConditions] = useState<Condition[]>([])
  const [actions, setActions] = useState<Action[]>([])

  // Test panel state
  const [testTicketId, setTestTicketId] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get<{ results: WorkflowRule[] } | WorkflowRule[]>('/workflows/')
      const list = Array.isArray(data) ? data : (data as { results: WorkflowRule[] }).results ?? []
      setRules(list)
    } catch {
      message.error('Failed to load workflow rules.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchFields = useCallback(async () => {
    try {
      const { data } = await client.get<FieldsData>('/workflows/fields/')
      setFieldsData(data)
    } catch {
      message.error('Failed to load field definitions.')
    }
  }, [])

  useEffect(() => {
    fetchRules()
    fetchFields()
  }, [fetchRules, fetchFields])

  // ── Drawer helpers ──────────────────────────────────────────────────────────

  function openCreate() {
    setEditingRule(null)
    setName('')
    setDescription('')
    setTrigger('ticket_created')
    setConditionMatch('all')
    setRunOrder(0)
    setConditions([])
    setActions([])
    setTestTicketId('')
    setTestResult(null)
    setDrawerOpen(true)
  }

  function openEdit(rule: WorkflowRule) {
    setEditingRule(rule)
    setName(rule.name)
    setDescription(rule.description)
    setTrigger(rule.trigger)
    setConditionMatch(rule.condition_match)
    setRunOrder(rule.run_order)
    setConditions(rule.conditions.length > 0 ? rule.conditions : [])
    setActions(rule.actions.length > 0 ? rule.actions : [])
    setTestTicketId('')
    setTestResult(null)
    setDrawerOpen(true)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingRule(null)
    setTestResult(null)
  }

  // ── Condition helpers ───────────────────────────────────────────────────────

  function addCondition() {
    setConditions(prev => [...prev, { field: '', operator: 'equals', value: '' }])
  }

  function updateCondition(index: number, updated: Condition) {
    setConditions(prev => prev.map((c, i) => i === index ? updated : c))
  }

  function removeCondition(index: number) {
    setConditions(prev => prev.filter((_, i) => i !== index))
  }

  // ── Action helpers ──────────────────────────────────────────────────────────

  function addAction() {
    setActions(prev => [...prev, { type: '', value: '' }])
  }

  function updateAction(index: number, updated: Action) {
    setActions(prev => prev.map((a, i) => i === index ? updated : a))
  }

  function removeAction(index: number) {
    setActions(prev => prev.filter((_, i) => i !== index))
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim()) {
      message.warning('Rule name is required.')
      return
    }
    if (actions.length === 0) {
      message.warning('At least one action is required.')
      return
    }
    setSaving(true)
    const payload = {
      name: name.trim(),
      description: description.trim(),
      trigger,
      condition_match: conditionMatch,
      run_order: runOrder,
      conditions,
      actions,
    }
    try {
      if (editingRule) {
        const { data } = await client.patch<WorkflowRule>(`/workflows/${editingRule.id}/`, payload)
        setRules(prev => prev.map(r => r.id === data.id ? data : r))
        message.success('Rule updated.')
      } else {
        const { data } = await client.post<WorkflowRule>('/workflows/', payload)
        setRules(prev => [...prev, data])
        message.success('Rule created.')
      }
      closeDrawer()
    } catch {
      message.error('Failed to save rule.')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ───────────────────────────────────────────────────────────

  async function toggleActive(rule: WorkflowRule) {
    try {
      const { data } = await client.patch<WorkflowRule>(`/workflows/${rule.id}/`, {
        is_active: !rule.is_active,
      })
      setRules(prev => prev.map(r => r.id === data.id ? data : r))
      message.success(`Rule ${data.is_active ? 'activated' : 'deactivated'}.`)
    } catch {
      message.error('Failed to update rule status.')
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    try {
      await client.delete(`/workflows/${id}/`)
      setRules(prev => prev.filter(r => r.id !== id))
      message.success('Rule deleted.')
    } catch {
      message.error('Failed to delete rule.')
    }
  }

  // ── Test ────────────────────────────────────────────────────────────────────

  async function handleTest() {
    if (!editingRule) return
    if (!testTicketId.trim()) {
      message.warning('Enter a ticket ID to test.')
      return
    }
    setTestLoading(true)
    setTestResult(null)
    try {
      const { data } = await client.post<TestResult>(`/workflows/${editingRule.id}/test/`, {
        ticket_id: testTicketId.trim(),
      })
      setTestResult(data)
    } catch {
      message.error('Test failed. Check the ticket ID.')
    } finally {
      setTestLoading(false)
    }
  }

  // ── Table columns ───────────────────────────────────────────────────────────

  const columns: ColumnsType<WorkflowRule> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: WorkflowRule) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Trigger',
      dataIndex: 'trigger_display',
      key: 'trigger',
      render: (_: string, record: WorkflowRule) => (
        <Tag color={triggerColor(record.trigger)}>{record.trigger_display}</Tag>
      ),
    },
    {
      title: 'Conditions',
      dataIndex: 'conditions',
      key: 'conditions',
      render: (conditions: Condition[]) => (
        <Text>{conditions.length} condition{conditions.length !== 1 ? 's' : ''}</Text>
      ),
    },
    {
      title: 'Actions',
      dataIndex: 'actions',
      key: 'actions',
      render: (actions: Action[]) => (
        <Text>{actions.length} action{actions.length !== 1 ? 's' : ''}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean, record: WorkflowRule) => (
        <Tooltip title={isActive ? 'Click to deactivate' : 'Click to activate'}>
          <Badge
            status={isActive ? 'success' : 'default'}
            text={
              <span
                style={{ cursor: 'pointer' }}
                onClick={() => toggleActive(record)}
              >
                {isActive ? 'Active' : 'Inactive'}
              </span>
            }
          />
        </Tooltip>
      ),
    },
    {
      title: 'Triggered',
      dataIndex: 'times_triggered',
      key: 'times_triggered',
      render: (count: number) => <Text>{count}×</Text>,
    },
    {
      title: 'Last Run',
      dataIndex: 'last_triggered_at',
      key: 'last_triggered_at',
      render: (val: string | null) =>
        val ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(val).toLocaleString()}
          </Text>
        ) : (
          <Text type="secondary">Never</Text>
        ),
    },
    {
      title: 'Order',
      dataIndex: 'run_order',
      key: 'run_order',
      render: (val: number) => <Text>{val}</Text>,
    },
    {
      title: 'Actions',
      key: 'row_actions',
      render: (_: unknown, record: WorkflowRule) => (
        <Space>
          <Tooltip title="Edit rule">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={() => openEdit(record)}
            />
          </Tooltip>
          <Tooltip title={record.is_active ? 'Deactivate' : 'Activate'}>
            <Switch
              checked={record.is_active}
              size="small"
              onChange={() => toggleActive(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this workflow rule?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete rule">
              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Workflow Automation</Title>
          <Text type="secondary">
            Automatically assign, categorize, and act on tickets based on rules.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Add Rule
        </Button>
      </div>

      {/* Rules table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : rules.length === 0 ? (
        <Empty
          description="No workflow rules configured yet."
          style={{ padding: 60 }}
        >
          <Button type="primary" onClick={openCreate}>Create your first rule</Button>
        </Empty>
      ) : (
        <Table
          dataSource={rules}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          size="small"
        />
      )}

      {/* Add / Edit drawer */}
      <Drawer
        title={editingRule ? `Edit: ${editingRule.name}` : 'New Workflow Rule'}
        width={700}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={closeDrawer}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </Space>
        }
      >
        {!fieldsData ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          <>
            {/* ── Basic info ── */}
            <Divider orientation="left" style={{ fontSize: 13 }}>Basic Information</Divider>

            <Form layout="vertical" size="small">
              <Form.Item label="Rule Name" required>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Auto-assign Hardware to IT Team"
                  maxLength={200}
                />
              </Form.Item>

              <Form.Item label="Description">
                <Input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                  maxLength={500}
                />
              </Form.Item>

              <Form.Item label="Trigger">
                <Select value={trigger} onChange={setTrigger} style={{ width: '100%' }}>
                  <Option value="ticket_created">When a ticket is created</Option>
                  <Option value="ticket_updated">When a ticket is updated</Option>
                </Select>
              </Form.Item>

              <Form.Item label="Condition Match">
                <Radio.Group
                  value={conditionMatch}
                  onChange={e => setConditionMatch(e.target.value)}
                >
                  <Radio value="all">All conditions must match (AND)</Radio>
                  <Radio value="any">Any condition must match (OR)</Radio>
                </Radio.Group>
              </Form.Item>

              <Form.Item label="Run Order" tooltip="Lower numbers run first. Default is 0.">
                <InputNumber
                  value={runOrder}
                  onChange={val => setRunOrder(val ?? 0)}
                  min={0}
                  max={9999}
                  style={{ width: 120 }}
                />
              </Form.Item>
            </Form>

            {/* ── Conditions ── */}
            <Divider orientation="left" style={{ fontSize: 13 }}>
              When these conditions are true
            </Divider>

            {conditions.length === 0 && (
              <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                No conditions — this rule will match every ticket.
              </Text>
            )}

            {conditions.map((cond, i) => (
              <ConditionRow
                key={i}
                index={i}
                condition={cond}
                fields={fieldsData.condition_fields}
                operators={fieldsData.operators}
                onChange={updateCondition}
                onRemove={removeCondition}
              />
            ))}

            <Button
              type="dashed"
              icon={<PlusOutlined />}
              size="small"
              onClick={addCondition}
              style={{ marginBottom: 16 }}
            >
              Add Condition
            </Button>

            {/* ── Actions ── */}
            <Divider orientation="left" style={{ fontSize: 13 }}>
              Then execute these actions
            </Divider>

            {actions.length === 0 && (
              <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                Add at least one action.
              </Text>
            )}

            {actions.map((act, i) => (
              <ActionRow
                key={i}
                index={i}
                action={act}
                actionTypes={fieldsData.action_types}
                agents={fieldsData.agents}
                categories={fieldsData.categories}
                onChange={updateAction}
                onRemove={removeAction}
              />
            ))}

            <Button
              type="dashed"
              icon={<PlusOutlined />}
              size="small"
              onClick={addAction}
              style={{ marginBottom: 16 }}
            >
              Add Action
            </Button>

            {/* ── Test panel (edit mode only) ── */}
            {editingRule && (
              <>
                <Divider orientation="left" style={{ fontSize: 13 }}>
                  Test This Rule
                </Divider>

                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Enter a ticket UUID to evaluate conditions without executing actions.
                </Text>

                <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                  <Input
                    placeholder="Ticket UUID (e.g. 123e4567-e89b-...)"
                    value={testTicketId}
                    onChange={e => setTestTicketId(e.target.value)}
                    onPressEnter={handleTest}
                  />
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    loading={testLoading}
                    onClick={handleTest}
                  >
                    Run Test
                  </Button>
                </Space.Compact>

                {testResult && (
                  <div>
                    <Alert
                      type={testResult.overall_match ? 'success' : 'warning'}
                      message={
                        testResult.overall_match
                          ? `Rule MATCHES ticket ${testResult.ticket}`
                          : `Rule does NOT match ticket ${testResult.ticket}`
                      }
                      style={{ marginBottom: 8 }}
                    />
                    {testResult.condition_results.map((cr, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 0',
                          borderBottom: '1px solid #f0f0f0',
                          fontSize: 12,
                        }}
                      >
                        {cr.result ? (
                          <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        ) : (
                          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                        )}
                        <Text style={{ fontSize: 12 }}>
                          <strong>{cr.condition.field}</strong>
                          {' '}{cr.condition.operator}{' '}
                          <em>
                            {Array.isArray(cr.condition.value)
                              ? cr.condition.value.join(', ')
                              : cr.condition.value || '(empty)'}
                          </em>
                        </Text>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  )
}
