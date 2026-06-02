import { useState } from 'react'
import { Form, Input, Button, Card, Typography, Alert, Space } from 'antd'
import { MailOutlined, LockOutlined } from '@ant-design/icons'
import { useSearchParams, Link } from 'react-router-dom'
import client from '../api/client'

const { Title, Text } = Typography

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // ── Request reset (no token) ──────────────────────────────────────────────
  async function onRequestFinish(values: { email: string }) {
    setLoading(true)
    setErrorMsg('')
    try {
      await client.post('/auth/password-reset/request/', { email: values.email })
      setSuccess(true)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErrorMsg(detail ?? 'Could not send reset link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Confirm reset (token present) ─────────────────────────────────────────
  async function onConfirmFinish(values: { new_password: string; confirm_password: string }) {
    if (values.new_password !== values.confirm_password) {
      setErrorMsg('Passwords do not match.')
      return
    }
    setLoading(true)
    setErrorMsg('')
    try {
      await client.post('/auth/password-reset/confirm/', {
        token,
        new_password: values.new_password,
      })
      setSuccess(true)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErrorMsg(detail ?? 'Could not reset password. The link may have expired.')
    } finally {
      setLoading(false)
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
      <Card style={{ width: 400, borderRadius: 8 }} variant="outlined">
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ marginBottom: 4 }}>
              {token ? 'Set New Password' : 'Reset Password'}
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {token
                ? 'Enter and confirm your new password below.'
                : 'Enter your account email to receive a reset link.'}
            </Text>
          </div>

          {errorMsg && (
            <Alert type="error" message={errorMsg} showIcon closable onClose={() => setErrorMsg('')} />
          )}

          {/* ── Request form ───────────────────────────────────────────── */}
          {!token && !success && (
            <Form form={form} layout="vertical" onFinish={onRequestFinish} size="large">
              <Form.Item
                name="email"
                label="Email Address"
                rules={[
                  { required: true, message: 'Please enter your email.' },
                  { type: 'email', message: 'Please enter a valid email.' },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="you@company.com" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" block loading={loading}>
                  Send Reset Link
                </Button>
              </Form.Item>
            </Form>
          )}

          {/* ── Request success ────────────────────────────────────────── */}
          {!token && success && (
            <Alert
              type="success"
              message="Check your inbox"
              description="If an account exists for that email, a password reset link has been sent."
              showIcon
            />
          )}

          {/* ── Confirm form ───────────────────────────────────────────── */}
          {token && !success && (
            <Form form={form} layout="vertical" onFinish={onConfirmFinish} size="large">
              <Form.Item
                name="new_password"
                label="New Password"
                rules={[
                  { required: true, message: 'Please enter a new password.' },
                  { min: 10, message: 'Password must be at least 10 characters.' },
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="At least 10 characters" />
              </Form.Item>
              <Form.Item
                name="confirm_password"
                label="Confirm New Password"
                dependencies={['new_password']}
                rules={[
                  { required: true, message: 'Please confirm your password.' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('new_password') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('Passwords do not match.'))
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="Repeat new password" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" block loading={loading}>
                  Reset Password
                </Button>
              </Form.Item>
            </Form>
          )}

          {/* ── Confirm success ────────────────────────────────────────── */}
          {token && success && (
            <Alert
              type="success"
              message="Password reset successfully."
              description={
                <span>
                  Your password has been updated.{' '}
                  <Link to="/login">Login now</Link>
                </span>
              }
              showIcon
            />
          )}

          <div style={{ textAlign: 'center' }}>
            <Link to="/login">
              <Text type="secondary" style={{ fontSize: 13 }}>Back to Login</Text>
            </Link>
          </div>
        </Space>
      </Card>
    </div>
  )
}
