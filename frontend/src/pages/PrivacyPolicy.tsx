import { Typography, Divider, Card, Tag, Space } from 'antd'

const { Title, Paragraph, Text } = Typography

const EFFECTIVE_DATE = '2026-05-29'
const LAST_UPDATED = '2026-05-29'

export default function PrivacyPolicy() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f0f2f5',
        padding: '40px 16px',
      }}
    >
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <Card
          style={{
            borderRadius: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <Title level={2} style={{ marginBottom: 4 }}>
              Data Protection &amp; Privacy Policy
            </Title>
            <Space size={8} wrap style={{ justifyContent: 'center' }}>
              <Tag color="blue">ITSM Platform</Tag>
              <Tag color="default">Version 1.0</Tag>
              <Tag color="green">Effective: {EFFECTIVE_DATE}</Tag>
            </Space>
            <br />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              Last Updated: {LAST_UPDATED}
            </Text>
          </div>

          <Divider />

          {/* Section 1 */}
          <Title level={4}>1. Data Controller</Title>
          <Paragraph>
            Bluspring Enterprises Limited manages this application for internal IT service management.
            This policy governs the collection, processing, and retention of personal data within the
            ITSM platform deployed on-premises for internal operations.
          </Paragraph>

          <Divider />

          {/* Section 2 */}
          <Title level={4}>2. Personal Data Collected</Title>
          <Paragraph>
            The following categories of personal data are collected and processed within this platform:
          </Paragraph>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Name, work email address, and employee ID (for account creation)</li>
            <li>IP addresses and browser user-agent strings (for security audit logs)</li>
            <li>Device and asset assignment records</li>
            <li>Ticket descriptions submitted by users (may contain personal details)</li>
            <li>Login timestamps and session records</li>
          </ul>

          <Divider />

          {/* Section 3 */}
          <Title level={4}>3. Purpose of Processing</Title>
          <Paragraph>Personal data is processed for the following purposes:</Paragraph>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>IT helpdesk ticketing and service management</li>
            <li>Hardware and software asset tracking</li>
            <li>Information security audit and compliance (ISO 27001, India DPDPA 2023)</li>
            <li>Incident response and investigation</li>
          </ul>

          <Divider />

          {/* Section 4 */}
          <Title level={4}>4. Legal Basis</Title>
          <Paragraph>
            Processing is carried out under legitimate business interests and in compliance with the{' '}
            <Text strong>Digital Personal Data Protection Act 2023 (India)</Text> for internal enterprise
            systems. All processing is limited to what is strictly necessary for the stated purposes.
          </Paragraph>

          <Divider />

          {/* Section 5 */}
          <Title level={4}>5. Data Retention</Title>
          <Paragraph>
            The following retention schedules apply to data held within this platform:
          </Paragraph>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>
              <Text strong>Audit logs:</Text> 7 years (regulatory requirement)
            </li>
            <li>
              <Text strong>Closed tickets:</Text> 3 years
            </li>
            <li>
              <Text strong>User account data:</Text> Duration of employment + 1 year
            </li>
            <li>
              <Text strong>System configuration logs:</Text> 3 years
            </li>
          </ul>

          <Divider />

          {/* Section 6 */}
          <Title level={4}>6. Your Rights (DPDPA 2023)</Title>
          <Paragraph>
            Under the Digital Personal Data Protection Act 2023, employees may exercise the following
            rights:
          </Paragraph>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Access their personal data held within the platform</li>
            <li>Request correction of inaccurate personal data</li>
            <li>Nominate data fiduciaries in accordance with applicable provisions</li>
          </ul>
          <Paragraph>
            To exercise any of these rights, contact your IT Manager or the designated Data Protection
            Officer.
          </Paragraph>

          <Divider />

          {/* Section 7 */}
          <Title level={4}>7. Data Security</Title>
          <Paragraph>
            The following security controls are applied to all data within this platform:
          </Paragraph>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>All data encrypted in transit (TLS 1.2+)</li>
            <li>Access controlled by role-based permissions</li>
            <li>All data changes recorded in immutable audit trail</li>
            <li>System deployed entirely on-premises (no cloud storage)</li>
            <li>Password policy and account lockout enforced</li>
          </ul>

          <Divider />

          {/* Section 8 */}
          <Title level={4}>8. No Third-Party Sharing</Title>
          <Paragraph>
            Data is not shared with third parties except:
          </Paragraph>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>
              <Text strong>Microsoft Teams</Text> — for notifications, governed by Microsoft's Data
              Processing Agreement
            </li>
            <li>
              <Text strong>iRedMail</Text> — on-premises email server; no data is transferred externally
            </li>
          </ul>

          <Divider />

          {/* Section 9 */}
          <Title level={4}>9. Data Breach Notification</Title>
          <Paragraph>
            In case of a security incident affecting personal data, affected users will be notified
            within <Text strong>72 hours</Text> in compliance with DPDPA 2023 requirements. Notification
            will be issued by the IT Manager or Data Protection Officer via the registered work email
            address.
          </Paragraph>

          <Divider />

          {/* Section 10 */}
          <Title level={4}>10. Contact</Title>
          <Paragraph>
            For questions or requests related to this policy, contact:
          </Paragraph>
          <Card
            size="small"
            style={{ background: '#fafafa', borderRadius: 6, display: 'inline-block' }}
          >
            <Text strong>IT Manager / Data Protection Officer</Text>
            <br />
            <Text type="secondary">helpdesk@[your-domain]</Text>
          </Card>

          <Divider />

          <Paragraph type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
            This policy is subject to periodic review. The effective date above reflects the date of the
            most recent approved version. All employees are required to familiarise themselves with this
            policy upon joining and whenever it is updated.
          </Paragraph>
        </Card>
      </div>
    </div>
  )
}
