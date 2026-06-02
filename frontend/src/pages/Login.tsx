import { Form, Input, Button, Card, Typography, message, Space } from 'antd'
import { MailOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'

const { Title, Text } = Typography

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [form] = Form.useForm()

  async function onFinish(values: { email: string; password: string }) {
    try {
      const { data } = await client.post('/auth/login/', values)
      login(data.user, data.access, data.refresh)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        message.error('Invalid email or password.')
      } else if (status === 403) {
        message.error('Your account has been disabled. Contact an administrator.')
      } else {
        message.error('Unable to connect. Please try again.')
      }
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 420, borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <Space direction="vertical" size={4} style={{ width: '100%', textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0 }}>IT Service Management</Title>
          <Text type="secondary">Sign in to continue</Text>
        </Space>

        <Form form={form} layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
          <Form.Item
            name="email"
            label="Email address"
            rules={[
              { required: true, message: 'Please enter your email.' },
              { type: 'email', message: 'Please enter a valid email address.' },
            ]}
          >
            <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="you@company.com" autoComplete="email" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Please enter your password.' }]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="Password" autoComplete="current-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block>
              Sign In
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/privacy-policy" target="_blank">Data Protection &amp; Privacy Policy</a>
        </div>
      </Card>
    </div>
  )
}
