import { useEffect, useState } from 'react'
import {
  Row, Col, Card, Avatar, Typography, Tag, Form, Input, Button,
  Space, Alert, Spin, Divider,
} from 'antd'
import { UserOutlined, LinkOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { message } from 'antd'
import { useAuthStore } from '../../store/auth'
import client from '../../api/client'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface UserDetail {
  id: string
  email: string
  full_name: string
  first_name: string
  last_name: string
  role_name: string | null
  role_display: string | null
  account_type: string
  date_joined: string
}

export default function UserProfile() {
  const { user, setUser } = useAuthStore()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [profile, setProfile] = useState<UserDetail | null>(null)

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      try {
        const { data } = await client.get<UserDetail>('/auth/me/')
        setProfile(data)
        form.setFieldsValue({
          first_name: data.first_name,
          last_name: data.last_name,
        })
      } catch {
        setErrorMsg('Could not load profile.')
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [form])

  async function onFinish(values: { first_name: string; last_name: string }) {
    if (!profile) return
    setSaving(true)
    setErrorMsg('')
    try {
      const { data } = await client.patch<UserDetail>(`/users/${profile.id}/`, {
        first_name: values.first_name,
        last_name: values.last_name,
      })
      setProfile(data)
      // Sync the auth store so header reflects new name
      if (user) {
        setUser({
          ...user,
          full_name: data.full_name,
        })
      }
      message.success('Profile updated.')
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErrorMsg(detail ?? 'Could not save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const initials = profile?.full_name
    ? profile.full_name.charAt(0).toUpperCase()
    : (profile?.email?.charAt(0).toUpperCase() ?? '?')

  return (
    <>
      <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>My Profile</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        View and update your account information.
      </Text>

      {errorMsg && (
        <Alert
          type="error"
          message={errorMsg}
          showIcon
          closable
          onClose={() => setErrorMsg('')}
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={[24, 24]}>
          {/* ── Left card: profile summary ──────────────────────────── */}
          <Col xs={24} md={8}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <Avatar
                  size={72}
                  style={{ backgroundColor: '#1677ff', fontSize: 28, marginBottom: 12 }}
                >
                  {initials}
                </Avatar>

                <Title level={4} style={{ marginBottom: 4 }}>
                  {profile?.full_name || '—'}
                </Title>

                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                  {profile?.email}
                </Text>

                {profile?.role_display && (
                  <Tag color="blue" style={{ marginBottom: 8 }}>
                    {profile.role_display}
                  </Tag>
                )}

                <Divider style={{ margin: '12px 0' }} />

                <Space direction="vertical" size={6} style={{ width: '100%', textAlign: 'left' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Account Type</Text>
                    <div>
                      <Tag>{profile?.account_type ?? '—'}</Tag>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Member Since</Text>
                    <div>
                      <Text>
                        {profile?.date_joined
                          ? dayjs(profile.date_joined).format('DD MMM YYYY')
                          : '—'}
                      </Text>
                    </div>
                  </div>
                </Space>

                <Divider style={{ margin: '12px 0' }} />

                <Link to="/access-requests?my_requests=true">
                  <Button type="link" icon={<LinkOutlined />} style={{ padding: 0 }}>
                    My Access Requests
                  </Button>
                </Link>
              </div>
            </Card>
          </Col>

          {/* ── Right card: edit form ───────────────────────────────── */}
          <Col xs={24} md={16}>
            <Card title="Edit Profile">
              <Form form={form} layout="vertical" onFinish={onFinish} size="large">
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="first_name"
                      label="First Name"
                      rules={[{ required: true, message: 'First name is required.' }]}
                    >
                      <Input placeholder="First name" prefix={<UserOutlined />} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="last_name"
                      label="Last Name"
                      rules={[{ required: true, message: 'Last name is required.' }]}
                    >
                      <Input placeholder="Last name" prefix={<UserOutlined />} />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item label="Email Address">
                  <Input value={profile?.email} disabled />
                </Form.Item>

                <Form.Item style={{ marginBottom: 0 }}>
                  <Space>
                    <Button type="primary" htmlType="submit" loading={saving}>
                      Save Changes
                    </Button>
                    <Button onClick={() => {
                      form.setFieldsValue({
                        first_name: profile?.first_name,
                        last_name: profile?.last_name,
                      })
                      setErrorMsg('')
                    }}>
                      Reset
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            </Card>
          </Col>
        </Row>
      )}
    </>
  )
}
