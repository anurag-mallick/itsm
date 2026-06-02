import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography,
  Tag,
  Space,
  Card,
  Input,
  Button,
  Spin,
  message,
  Divider,
  List,
  Modal,
  Form,
  Row,
  Col,
  Select,
  Breadcrumb,
} from 'antd';
import {
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  LinkOutlined,
  BugOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuthStore } from '../../store/auth';

const { Title, Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkedTicket {
  id: number;
  ticket_number: string;
  title: string;
  status: string;
}

interface Problem {
  id: number;
  problem_number: string;
  title: string;
  status: 'open' | 'investigating' | 'known_error' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'critical';
  owner_name: string;
  description: string;
  root_cause: string;
  workaround: string;
  resolution: string;
  linked_tickets: LinkedTicket[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  open: 'red',
  investigating: 'orange',
  known_error: 'gold',
  resolved: 'green',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  critical: 'red',
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  open: 'blue',
  in_progress: 'orange',
  resolved: 'green',
  closed: 'default',
};

// ---------------------------------------------------------------------------
// Editable field card
// ---------------------------------------------------------------------------

interface EditableFieldProps {
  label: string;
  value: string;
  onSave: (val: string) => Promise<void>;
  canEdit: boolean;
  rows?: number;
}

const EditableField: React.FC<EditableFieldProps> = ({
  label,
  value,
  onSave,
  canEdit,
  rows = 4,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      size="small"
      title={label}
      style={{ marginBottom: 16 }}
      extra={
        canEdit && !editing ? (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => { setDraft(value); setEditing(true); }}
          >
            Edit
          </Button>
        ) : null
      }
    >
      {editing ? (
        <div>
          <Input.TextArea
            rows={rows}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              Save
            </Button>
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </Space>
        </div>
      ) : (
        <div>
          {value ? (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: 13,
                margin: 0,
                color: '#262626',
              }}
            >
              {value}
            </pre>
          ) : (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {canEdit ? 'Click Edit to add content.' : 'No content yet.'}
            </Text>
          )}
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ProblemDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const canEdit = ['it_agent', 'it_manager', 'super_admin'].includes(
    user?.role_name ?? '',
  );

  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);

  // Status/priority editing
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm] = Form.useForm();
  const [savingHeader, setSavingHeader] = useState(false);

  // Link ticket modal
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [ticketIdInput, setTicketIdInput] = useState('');
  const [linking, setLinking] = useState(false);

  const fetchProblem = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await client.get<Problem>(`/problems/${id}/`);
      setProblem(data);
    } catch {
      message.error('Failed to load problem record.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProblem();
  }, [fetchProblem]);

  async function patchField(field: string, value: string) {
    if (!id) return;
    try {
      const { data } = await client.patch<Problem>(`/problems/${id}/`, { [field]: value });
      setProblem(data);
      message.success('Updated successfully.');
    } catch {
      message.error('Failed to update field.');
      throw new Error('patch failed');
    }
  }

  async function handleSaveHeader() {
    if (!id) return;
    try {
      const values = await headerForm.validateFields();
      setSavingHeader(true);
      const { data } = await client.patch<Problem>(`/problems/${id}/`, {
        status: values.status,
        priority: values.priority,
        title: values.title,
      });
      setProblem(data);
      setEditingHeader(false);
      message.success('Problem updated.');
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error('Failed to update problem.');
    } finally {
      setSavingHeader(false);
    }
  }

  async function handleLinkTicket() {
    if (!id || !ticketIdInput.trim()) return;
    setLinking(true);
    try {
      const { data } = await client.post<Problem>(`/problems/${id}/link-ticket/`, {
        ticket_id: ticketIdInput.trim(),
      });
      setProblem(data);
      setLinkModalOpen(false);
      setTicketIdInput('');
      message.success('Ticket linked successfully.');
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ??
        Object.values(err?.response?.data ?? {}).flat().join(' ') ??
        'Failed to link ticket.';
      message.error(String(msg));
    } finally {
      setLinking(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div style={{ padding: 24 }}>
        <Text type="danger">Problem record not found.</Text>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            href: '/problems',
            title: (
              <span>
                <HomeOutlined style={{ marginRight: 4 }} />
                Problems
              </span>
            ),
          },
          { title: problem.problem_number },
        ]}
      />

      {/* Header */}
      <Card style={{ marginBottom: 20 }}>
        {editingHeader ? (
          <Form
            form={headerForm}
            layout="vertical"
            initialValues={{
              title: problem.title,
              status: problem.status,
              priority: problem.priority,
            }}
          >
            <Form.Item
              label="Title"
              name="title"
              rules={[{ required: true, message: 'Title is required.' }]}
            >
              <Input />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="Status"
                  name="status"
                  rules={[{ required: true }]}
                >
                  <Select>
                    <Select.Option value="open">Open</Select.Option>
                    <Select.Option value="investigating">Investigating</Select.Option>
                    <Select.Option value="known_error">Known Error</Select.Option>
                    <Select.Option value="resolved">Resolved</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Priority"
                  name="priority"
                  rules={[{ required: true }]}
                >
                  <Select>
                    <Select.Option value="low">Low</Select.Option>
                    <Select.Option value="medium">Medium</Select.Option>
                    <Select.Option value="high">High</Select.Option>
                    <Select.Option value="critical">Critical</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingHeader}
                onClick={handleSaveHeader}
              >
                Save
              </Button>
              <Button icon={<CloseOutlined />} onClick={() => setEditingHeader(false)}>
                Cancel
              </Button>
            </Space>
          </Form>
        ) : (
          <div>
            <Space align="center" style={{ marginBottom: 8 }}>
              <BugOutlined style={{ color: '#1677ff', fontSize: 18 }} />
              <Text style={{ fontFamily: 'monospace', color: '#8c8c8c' }}>
                {problem.problem_number}
              </Text>
              <Tag color={STATUS_COLORS[problem.status]}>
                {problem.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Tag>
              <Tag color={PRIORITY_COLORS[problem.priority]}>
                {problem.priority.charAt(0).toUpperCase() + problem.priority.slice(1)} Priority
              </Tag>
            </Space>
            <Title level={4} style={{ margin: '0 0 8px 0' }}>
              {problem.title}
            </Title>
            <Space style={{ color: '#8c8c8c', fontSize: 13 }}>
              <span>Owner: {problem.owner_name || 'Unassigned'}</span>
              <Divider type="vertical" />
              <span>Created: {new Date(problem.created_at).toLocaleDateString()}</span>
              <Divider type="vertical" />
              <span>Updated: {new Date(problem.updated_at).toLocaleDateString()}</span>
            </Space>
            {canEdit && (
              <div style={{ marginTop: 12 }}>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    headerForm.setFieldsValue({
                      title: problem.title,
                      status: problem.status,
                      priority: problem.priority,
                    });
                    setEditingHeader(true);
                  }}
                >
                  Edit Header
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Editable detail cards */}
      <EditableField
        label="Description"
        value={problem.description}
        onSave={(val) => patchField('description', val)}
        canEdit={canEdit}
        rows={5}
      />
      <EditableField
        label="Root Cause"
        value={problem.root_cause}
        onSave={(val) => patchField('root_cause', val)}
        canEdit={canEdit}
      />
      <EditableField
        label="Workaround"
        value={problem.workaround}
        onSave={(val) => patchField('workaround', val)}
        canEdit={canEdit}
      />
      <EditableField
        label="Resolution"
        value={problem.resolution}
        onSave={(val) => patchField('resolution', val)}
        canEdit={canEdit}
      />

      {/* Linked tickets */}
      <Card
        title="Linked Tickets"
        size="small"
        extra={
          canEdit && (
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => setLinkModalOpen(true)}
            >
              Link Ticket
            </Button>
          )
        }
      >
        {problem.linked_tickets.length === 0 ? (
          <Text type="secondary">No linked tickets.</Text>
        ) : (
          <List
            size="small"
            dataSource={problem.linked_tickets}
            renderItem={(ticket) => (
              <List.Item>
                <Space>
                  <Link to={`/tickets/${ticket.id}`}>
                    <Text style={{ fontFamily: 'monospace', color: '#1677ff' }}>
                      {ticket.ticket_number}
                    </Text>
                  </Link>
                  <Text>{ticket.title}</Text>
                  <Tag
                    color={TICKET_STATUS_COLORS[ticket.status] ?? 'default'}
                    style={{ marginLeft: 4 }}
                  >
                    {ticket.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Tag>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* Link Ticket Modal */}
      <Modal
        title="Link Ticket"
        open={linkModalOpen}
        onOk={handleLinkTicket}
        onCancel={() => { setLinkModalOpen(false); setTicketIdInput(''); }}
        confirmLoading={linking}
        okText="Link"
        destroyOnClose
      >
        <div style={{ marginTop: 16 }}>
          <Text style={{ display: 'block', marginBottom: 8 }}>
            Enter the ticket ID or ticket number to link to this problem:
          </Text>
          <Input
            placeholder="e.g. TKT-1023 or 1023"
            value={ticketIdInput}
            onChange={(e) => setTicketIdInput(e.target.value)}
            onPressEnter={handleLinkTicket}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ProblemDetail;
