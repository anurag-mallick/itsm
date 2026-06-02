import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography,
  Table,
  Button,
  Tag,
  Space,
  Select,
  message,
  Modal,
  Form,
  Input,
  Spin,
} from 'antd';
import { PlusOutlined, BugOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Problem {
  id: number;
  problem_number: string;
  title: string;
  status: 'open' | 'investigating' | 'known_error' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'critical';
  owner_name: string;
  linked_tickets_count: number;
  created_at: string;
}

interface ProblemsResponse {
  results: Problem[];
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProblemList: React.FC = () => {
  const navigate = useNavigate();

  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  // New problem modal
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const fetchProblems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const { data } = await client.get<ProblemsResponse>('/problems/', { params });
      setProblems(data.results ?? []);
    } catch {
      message.error('Failed to load problem records.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter]);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  async function handleCreate() {
    try {
      const values = await form.validateFields();
      setCreating(true);
      await client.post('/problems/', values);
      message.success('Problem record created.');
      setModalOpen(false);
      form.resetFields();
      fetchProblems();
    } catch (err: any) {
      if (err?.errorFields) return;
      const msg =
        err?.response?.data?.detail ??
        Object.values(err?.response?.data ?? {}).flat().join(' ') ??
        'Failed to create problem.';
      message.error(String(msg));
    } finally {
      setCreating(false);
    }
  }

  const columns: ColumnsType<Problem> = [
    {
      title: 'PRB #',
      dataIndex: 'problem_number',
      key: 'problem_number',
      render: (val: string) => (
        <Text style={{ fontFamily: 'monospace', color: '#1677ff' }}>{val}</Text>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (val: string) => <Text strong>{val}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => (
        <Tag color={STATUS_COLORS[val] ?? 'default'}>
          {val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </Tag>
      ),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (val: string) => (
        <Tag color={PRIORITY_COLORS[val] ?? 'default'}>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Owner',
      dataIndex: 'owner_name',
      key: 'owner_name',
      render: (val: string) => val || <Text type="secondary">Unassigned</Text>,
    },
    {
      title: 'Linked Tickets',
      dataIndex: 'linked_tickets_count',
      key: 'linked_tickets_count',
      render: (val: number) => (
        <Tag color={val > 0 ? 'blue' : 'default'}>{val}</Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => new Date(val).toLocaleDateString(),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space
        style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}
        wrap
      >
        <Title level={3} style={{ margin: 0 }}>
          <BugOutlined style={{ marginRight: 10, color: '#1677ff' }} />
          Problem Records
        </Title>
        <Space>
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: 180 }}
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter(v ?? '')}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'investigating', label: 'Investigating' },
              { value: 'known_error', label: 'Known Error' },
              { value: 'resolved', label: 'Resolved' },
            ]}
          />
          <Select
            placeholder="Filter by priority"
            allowClear
            style={{ width: 160 }}
            value={priorityFilter || undefined}
            onChange={(v) => setPriorityFilter(v ?? '')}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'critical', label: 'Critical' },
            ]}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
          >
            New Problem
          </Button>
        </Space>
      </Space>

      <Table<Problem>
        dataSource={problems}
        columns={columns}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({
          onClick: () => navigate(`/problems/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        size="middle"
      />

      {/* New Problem Modal */}
      <Modal
        title="New Problem Record"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={creating}
        okText="Create Problem"
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Title"
            name="title"
            rules={[{ required: true, message: 'Title is required.' }]}
          >
            <Input placeholder="Brief description of the problem" />
          </Form.Item>
          <Form.Item
            label="Priority"
            name="priority"
            rules={[{ required: true, message: 'Priority is required.' }]}
          >
            <Select placeholder="Select priority">
              <Select.Option value="low">Low</Select.Option>
              <Select.Option value="medium">Medium</Select.Option>
              <Select.Option value="high">High</Select.Option>
              <Select.Option value="critical">Critical</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={4} placeholder="Detailed problem description" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProblemList;
