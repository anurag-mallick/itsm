import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography,
  Tabs,
  Card,
  Row,
  Col,
  Button,
  Tag,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Checkbox,
  Spin,
  Empty,
  message,
  Result,
  Table,
  Collapse,
  Space,
  Badge,
} from 'antd';
import {
  ShoppingOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import client from '../../api/client';
import { useAuthStore } from '../../store/auth';

const { Title, Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface CatalogItem {
  id: number;
  name: string;
  description: string;
  icon: string;
  form_fields: FormField[];
  fulfillment_sla_hours: number;
  requires_manager_approval: boolean;
  category_name: string;
}

interface CatalogPublicResponse {
  results: CatalogItem[];
}

interface ServiceRequest {
  id: number;
  request_number: string;
  catalog_item_name: string;
  status: string;
  created_at: string;
}

interface ServiceRequestsResponse {
  results: ServiceRequest[];
}

interface SubmitResponse {
  request_number: string;
  id: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  pending: 'gold',
  approved: 'blue',
  in_progress: 'cyan',
  fulfilled: 'green',
  rejected: 'red',
  cancelled: 'default',
};

function groupByCategory(items: CatalogItem[]): Record<string, CatalogItem[]> {
  return items.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    const cat = item.category_name || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Dynamic form field renderer
// ---------------------------------------------------------------------------

function DynamicField({ field }: { field: FormField }) {
  switch (field.type) {
    case 'textarea':
      return (
        <Input.TextArea
          rows={3}
          placeholder={field.placeholder ?? ''}
          maxLength={1000}
          showCount
        />
      );
    case 'number':
      return (
        <InputNumber
          style={{ width: '100%' }}
          placeholder={field.placeholder ?? ''}
        />
      );
    case 'date':
      return <DatePicker style={{ width: '100%' }} />;
    case 'select':
      return (
        <Select placeholder={field.placeholder ?? 'Select an option'}>
          {(field.options ?? []).map((opt) => (
            <Select.Option key={opt} value={opt}>
              {opt}
            </Select.Option>
          ))}
        </Select>
      );
    case 'checkbox':
      return <Checkbox>{field.label}</Checkbox>;
    default:
      return (
        <Input placeholder={field.placeholder ?? ''} />
      );
  }
}

// ---------------------------------------------------------------------------
// Item card
// ---------------------------------------------------------------------------

interface ItemCardProps {
  item: CatalogItem;
  onRequest: (item: CatalogItem) => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, onRequest }) => (
  <Card
    hoverable
    style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
    actions={[
      <Button
        key="request"
        type="primary"
        icon={<ShoppingOutlined />}
        onClick={() => onRequest(item)}
        style={{ margin: '0 16px' }}
      >
        Request
      </Button>,
    ]}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: '#e6f4ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <AppstoreOutlined style={{ fontSize: 20, color: '#1677ff' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text strong style={{ fontSize: 15, display: 'block' }}>
          {item.name}
        </Text>
        <Paragraph
          ellipsis={{ rows: 2 }}
          style={{ margin: 0, color: '#595959', fontSize: 13 }}
        >
          {item.description}
        </Paragraph>
      </div>
    </div>
    <Space size={6} wrap>
      <Tag icon={<ClockCircleOutlined />} color="default">
        SLA: {item.fulfillment_sla_hours}h
      </Tag>
      {item.requires_manager_approval && (
        <Tag icon={<SafetyCertificateOutlined />} color="orange">
          Requires manager approval
        </Tag>
      )}
    </Space>
  </Card>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ServiceCatalog: React.FC = () => {
  const { user } = useAuthStore();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // Request drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successRequest, setSuccessRequest] = useState<string | null>(null);
  const [requestForm] = Form.useForm();

  // My requests
  const [myRequests, setMyRequests] = useState<ServiceRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get<CatalogPublicResponse>('/catalog/public/');
      setItems(data.results ?? []);
    } catch {
      message.error('Failed to load service catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const { data } = await client.get<ServiceRequestsResponse>('/catalog/requests/');
      setMyRequests(data.results ?? []);
    } catch {
      // Non-critical
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
    fetchMyRequests();
  }, [fetchCatalog, fetchMyRequests]);

  const grouped = groupByCategory(items);
  const categories = Object.keys(grouped);

  const displayedItems =
    activeCategory === 'all' ? items : grouped[activeCategory] ?? [];

  function openRequestDrawer(item: CatalogItem) {
    setSelectedItem(item);
    setSuccessRequest(null);
    requestForm.resetFields();
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedItem(null);
    setSuccessRequest(null);
    requestForm.resetFields();
  }

  async function handleSubmit() {
    if (!selectedItem) return;
    try {
      const values = await requestForm.validateFields();
      setSubmitting(true);
      const { data } = await client.post<SubmitResponse>('/catalog/requests/', {
        catalog_item: selectedItem.id,
        form_data: values,
      });
      setSuccessRequest(data.request_number);
      fetchMyRequests();
    } catch (err: any) {
      if (err?.errorFields) return;
      const msg =
        err?.response?.data?.detail ??
        Object.values(err?.response?.data ?? {}).flat().join(' ') ??
        'Failed to submit request.';
      message.error(String(msg));
    } finally {
      setSubmitting(false);
    }
  }

  const tabItems = [
    { key: 'all', label: `All (${items.length})` },
    ...categories.map((cat) => ({
      key: cat,
      label: `${cat} (${grouped[cat].length})`,
    })),
  ];

  const myRequestsColumns: ColumnsType<ServiceRequest> = [
    {
      title: 'SR #',
      dataIndex: 'request_number',
      key: 'request_number',
      render: (val: string) => <Text style={{ fontFamily: 'monospace' }}>{val}</Text>,
    },
    {
      title: 'Service',
      dataIndex: 'catalog_item_name',
      key: 'catalog_item_name',
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
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => new Date(val).toLocaleDateString(),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          Service Catalog
        </Title>
        <Text type="secondary">Request IT services and equipment</Text>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 80 }}>
          <Spin size="large" />
        </div>
      ) : items.length === 0 ? (
        <Empty description="No catalog items available." style={{ marginTop: 60 }} />
      ) : (
        <>
          <Tabs
            activeKey={activeCategory}
            onChange={setActiveCategory}
            items={tabItems}
            style={{ marginBottom: 24 }}
          />

          <Row gutter={[16, 16]}>
            {displayedItems.map((item) => (
              <Col key={item.id} xs={24} sm={12} lg={8}>
                <ItemCard item={item} onRequest={openRequestDrawer} />
              </Col>
            ))}
          </Row>
        </>
      )}

      {/* My Requests collapsible */}
      {user && (
        <div style={{ marginTop: 40 }}>
          <Collapse
            defaultActiveKey={[]}
            items={[
              {
                key: 'my-requests',
                label: (
                  <Space>
                    <CheckCircleOutlined />
                    <span>My Requests</span>
                    <Badge count={myRequests.length} style={{ backgroundColor: '#1677ff' }} />
                  </Space>
                ),
                children: requestsLoading ? (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <Spin />
                  </div>
                ) : myRequests.length === 0 ? (
                  <Empty description="You have no service requests yet." />
                ) : (
                  <Table<ServiceRequest>
                    dataSource={myRequests}
                    columns={myRequestsColumns}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 10, showSizeChanger: false }}
                  />
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Request Drawer */}
      <Drawer
        title={selectedItem ? `Request: ${selectedItem.name}` : 'Request Service'}
        width={560}
        open={drawerOpen}
        onClose={closeDrawer}
        footer={
          !successRequest && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={closeDrawer}>Cancel</Button>
              <Button type="primary" loading={submitting} onClick={handleSubmit}>
                Submit Request
              </Button>
            </div>
          )
        }
      >
        {successRequest ? (
          <Result
            status="success"
            title="Request Submitted"
            subTitle={`Your request ${successRequest} has been submitted successfully.`}
            extra={[
              <Button key="close" type="primary" onClick={closeDrawer}>
                Close
              </Button>,
            ]}
          />
        ) : selectedItem ? (
          <>
            <Paragraph style={{ color: '#595959', marginBottom: 20 }}>
              {selectedItem.description}
            </Paragraph>
            <Space size={6} wrap style={{ marginBottom: 20 }}>
              <Tag icon={<ClockCircleOutlined />} color="default">
                SLA: {selectedItem.fulfillment_sla_hours}h
              </Tag>
              {selectedItem.requires_manager_approval && (
                <Tag icon={<SafetyCertificateOutlined />} color="orange">
                  Requires manager approval
                </Tag>
              )}
            </Space>

            {selectedItem.form_fields && selectedItem.form_fields.length > 0 ? (
              <Form form={requestForm} layout="vertical">
                {selectedItem.form_fields.map((field) => (
                  <Form.Item
                    key={field.name}
                    label={field.type !== 'checkbox' ? field.label : undefined}
                    name={field.name}
                    rules={
                      field.required
                        ? [{ required: true, message: `${field.label} is required.` }]
                        : undefined
                    }
                    valuePropName={field.type === 'checkbox' ? 'checked' : 'value'}
                  >
                    <DynamicField field={field} />
                  </Form.Item>
                ))}
              </Form>
            ) : (
              <Text type="secondary">
                No additional information required. Click Submit Request to proceed.
              </Text>
            )}
          </>
        ) : null}
      </Drawer>
    </div>
  );
};

export default ServiceCatalog;
