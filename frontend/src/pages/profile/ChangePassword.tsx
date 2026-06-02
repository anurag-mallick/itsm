import { useState } from 'react'
import { Form, Input, Button, Card, Typography, Alert, Space } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import client from '../../api/client'

const { Title, Text } = Typography

export default function ChangePassword() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function onFinish(values: {
    old_password: string
    new_password: string
    confirm_password: string
  }) {
    setErrorMsg('')
    setLoading(true)
    try {
      await client.post('/auth/change-password/', {
        old_password: values.old_password,
        new_password: values.new_password,
      })
      message.success('Password changed successfully.')
      navigate('/')
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string; old_password?: string[] } } })
          ?.response?.data?.detail ??
        (err as { response?: { data?: { old_password?: string[] } } })
          ?.response?.data?.old_password?.[0]
      setErrorMsg(detail ?? 'Could not change password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
        Change Password
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Update your account password. You will remain logged in after the change.
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

      <Card>
        <Form form={form} layout="vertical" onFinish={onFinish} size="large">
          <Form.Item
            name="old_password"
            label="Current Password"
            rules={[{ required: true, message: 'Please enter your current password.' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Current password" />
          </Form.Item>

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
              { required: true, message: 'Please confirm your new password.' },
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

          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              Update Password
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
