import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Layout, Menu, Avatar, Dropdown, Typography, Tag,
  Badge, Drawer, List, Button, AutoComplete, Input,
  Space, Spin, Divider, message,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  DashboardOutlined,
  CustomerServiceOutlined,
  DesktopOutlined,
  CodeOutlined,
  AuditOutlined,
  SettingOutlined,
  UserOutlined,
  TeamOutlined,
  LogoutOutlined,
  KeyOutlined,
  MailOutlined,
  AppstoreOutlined,
  AlignLeftOutlined,
  TagsOutlined,
  BranchesOutlined,
  CalendarOutlined,
  ProjectOutlined,
  FileProtectOutlined,
  BellOutlined,
  SearchOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  ShoppingOutlined,
  BookOutlined,
  BugOutlined,
  RadarChartOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'
import ErrorBoundary from '../components/ErrorBoundary'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { Sider, Content, Header } = Layout
const { Text } = Typography

// ── Role guards ───────────────────────────────────────────────────────────────
const SETTINGS_ROLES = ['it_manager', 'super_admin']
const SUPER_ADMIN_ROLES = ['super_admin']
const AUDIT_ROLES = ['it_manager', 'it_agent', 'super_admin', 'auditor']
const REQUESTOR_ROLES = ['requestor', 'end_user']
const IT_ROLES = ['it_agent', 'it_manager', 'super_admin']

// ── Notification types ────────────────────────────────────────────────────────
interface Notification {
  id: number
  title: string
  body: string
  notification_type: string
  is_read: boolean
  url: string
  created_at: string
}

interface SearchResult {
  type: string
  type_label: string
  title: string
  subtitle: string
  url: string
  id: string | number
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  query: string
}

// ── Notification icon helper ──────────────────────────────────────────────────
function notifIcon(type: string) {
  if (type.includes('ticket')) return <CustomerServiceOutlined style={{ color: '#1677ff' }} />
  if (type.includes('asset') || type.includes('hardware')) return <DesktopOutlined style={{ color: '#722ed1' }} />
  if (type.includes('change')) return <BranchesOutlined style={{ color: '#13c2c2' }} />
  if (type.includes('access')) return <FileProtectOutlined style={{ color: '#52c41a' }} />
  return <BellOutlined style={{ color: '#faad14' }} />
}

export default function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  // ── Notifications state ───────────────────────────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifLoading, setNotifLoading] = useState(false)

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOptions, setSearchOptions] = useState<{ label: React.ReactNode; options: { label: React.ReactNode; value: string }[] }[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const role = user?.role_name ?? ''
  const isRequestor = REQUESTOR_ROLES.includes(role)
  const canSeeAudit = AUDIT_ROLES.includes(role) || !isRequestor
  const canSeeSettings = SETTINGS_ROLES.includes(role)
  const canSeeSuperAdminSettings = SUPER_ADMIN_ROLES.includes(role)
  const canSeeITPages = IT_ROLES.includes(role)

  // ── Fetch unread count ────────────────────────────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await client.get<{ count: number }>('/notifications/unread-count/')
      setUnreadCount(data.count)
    } catch {
      // Non-critical; ignore silently
    }
  }, [])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 60_000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // ── Fetch notifications (on drawer open) ──────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true)
    try {
      const { data } = await client.get<{ results: Notification[] } | Notification[]>('/notifications/')
      const list = Array.isArray(data) ? data : (data as { results: Notification[] }).results ?? []
      setNotifications(list)
    } catch {
      message.error('Could not load notifications.')
    } finally {
      setNotifLoading(false)
    }
  }, [])

  function openNotifDrawer() {
    setNotifOpen(true)
    fetchNotifications()
  }

  // ── Mark single notification as read ─────────────────────────────────────
  async function markRead(notif: Notification) {
    if (!notif.is_read) {
      try {
        await client.post(`/notifications/${notif.id}/read/`)
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch { /* ignore */ }
    }
    setNotifOpen(false)
    navigate(notif.url)
  }

  // ── Mark all as read ──────────────────────────────────────────────────────
  async function markAllRead() {
    try {
      await client.post('/notifications/read-all/')
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
      message.success('All notifications marked as read.')
    } catch {
      message.error('Could not mark all as read.')
    }
  }

  // ── Global search (debounced) ─────────────────────────────────────────────
  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (value.length < 2) {
      setSearchOptions([])
      return
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const { data } = await client.get<SearchResponse>('/search/', { params: { q: value } })
        const grouped: Record<string, SearchResult[]> = {}
        for (const r of data.results) {
          if (!grouped[r.type_label]) grouped[r.type_label] = []
          grouped[r.type_label].push(r)
        }
        if (data.results.length === 0) {
          setSearchOptions([{
            label: <span style={{ color: '#999' }}>No results</span>,
            options: [{ label: <Text type="secondary">No results found.</Text>, value: '__no_results__' }],
          }])
        } else {
          setSearchOptions(
            Object.entries(grouped).map(([groupLabel, items]) => ({
              label: <span style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: '#888' }}>{groupLabel}</span>,
              options: items.map(item => ({
                label: (
                  <div>
                    <div style={{ fontWeight: 500 }}>{item.title}</div>
                    {item.subtitle && <div style={{ fontSize: 12, color: '#888' }}>{item.subtitle}</div>}
                  </div>
                ),
                value: item.url,
              })),
            }))
          )
        }
      } catch {
        setSearchOptions([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }

  function handleSearchSelect(url: string) {
    if (url === '__no_results__') return
    setSearchQuery('')
    setSearchOptions([])
    navigate(url)
  }

  async function handleLogout() {
    try {
      await client.post('/auth/logout/', { refresh: localStorage.getItem('refresh_token') })
    } catch { /* ignore — token may already be expired */ }
    logout()
    navigate('/login', { replace: true })
  }

  // ── Navigation items ──────────────────────────────────────────────────────
  const navItems: MenuProps['items'] = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/tickets',
      icon: <CustomerServiceOutlined />,
      label: 'Tickets',
    },
    {
      key: '/access-requests',
      icon: <FileProtectOutlined />,
      label: 'Access Requests',
    },
    {
      key: '/changes',
      icon: <BranchesOutlined />,
      label: 'Changes',
    },
    {
      key: '/sprints',
      icon: <ProjectOutlined />,
      label: 'Sprints',
    },
    {
      key: '/assets',
      icon: <DesktopOutlined />,
      label: 'Assets',
      children: [
        {
          key: '/assets/hardware',
          icon: <DesktopOutlined />,
          label: 'Hardware',
        },
        {
          key: '/assets/software',
          icon: <CodeOutlined />,
          label: 'Software Licenses',
        },
      ],
    },
    {
      key: '/calendar',
      icon: <CalendarOutlined />,
      label: 'Calendar',
    },
    {
      key: '/catalog',
      icon: <ShoppingOutlined />,
      label: 'Service Catalog',
    },
    {
      key: '/knowledge',
      icon: <BookOutlined />,
      label: 'Knowledge Base',
    },
    ...(canSeeITPages
      ? [
          {
            key: '/problems',
            icon: <BugOutlined />,
            label: 'Problems',
          } as NonNullable<MenuProps['items']>[number],
          {
            key: '/discovery',
            icon: <RadarChartOutlined />,
            label: 'Discovery',
          } as NonNullable<MenuProps['items']>[number],
        ]
      : []),
    ...(canSeeAudit
      ? [
          {
            key: '/audit',
            icon: <AuditOutlined />,
            label: 'Audit Log',
          } as NonNullable<MenuProps['items']>[number],
        ]
      : []),
    ...(canSeeSettings
      ? [
          {
            key: '/settings',
            icon: <SettingOutlined />,
            label: 'Settings',
            children: [
              {
                key: '/settings/users',
                icon: <TeamOutlined />,
                label: 'Users',
              },
              {
                key: '/settings/categories',
                icon: <TagsOutlined />,
                label: 'Categories',
              },
              {
                key: '/settings/custom-fields',
                icon: <AppstoreOutlined />,
                label: 'Custom Fields',
              },
              {
                key: '/settings/canned-responses',
                icon: <AlignLeftOutlined />,
                label: 'Canned Responses',
              },
              ...(canSeeSuperAdminSettings
                ? [
                    {
                      key: '/settings/email',
                      icon: <MailOutlined />,
                      label: 'Email Config',
                    },
                    {
                      key: '/settings/teams',
                      icon: <TeamOutlined />,
                      label: 'Teams Config',
                    },
                  ]
                : []),
            ],
          } as NonNullable<MenuProps['items']>[number],
        ]
      : []),
  ]

  // ── User header dropdown ──────────────────────────────────────────────────
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'email',
      label: <Text type="secondary">{user?.email}</Text>,
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'My Profile',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'password',
      icon: <KeyOutlined />,
      label: 'Change Password',
      onClick: () => navigate('/profile/password'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      danger: true,
      onClick: handleLogout,
    },
  ]

  const defaultOpenKeys: string[] = []
  if (pathname.startsWith('/assets')) defaultOpenKeys.push('/assets')
  if (pathname.startsWith('/settings')) defaultOpenKeys.push('/settings')

  // Derive selected key for nested routes (/knowledge/:slug, /problems/:id)
  const knowledgeSelected = pathname.startsWith('/knowledge') ? '/knowledge' : null
  const problemsSelected = pathname.startsWith('/problems') ? '/problems' : null

  const selectedKey =
    knowledgeSelected ??
    problemsSelected ??
    (pathname === '/' ? '/' : pathname)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        style={{ borderRight: '1px solid #f0f0f0' }}
      >
        <div
          style={{
            padding: '16px 12px',
            borderBottom: '1px solid #f0f0f0',
            textAlign: 'center',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {collapsed ? (
            <CustomerServiceOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          ) : (
            <Text strong style={{ fontSize: 13 }}>
              IT Service Desk
            </Text>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={defaultOpenKeys}
          items={navItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: '1px solid #f0f0f0',
            gap: 12,
          }}
        >
          {/* Global search */}
          <AutoComplete
            style={{ width: 280 }}
            options={searchOptions}
            value={searchQuery}
            onSearch={handleSearchChange}
            onSelect={handleSearchSelect}
            notFoundContent={null}
          >
            <Input
              prefix={searchLoading ? <Spin size="small" /> : <SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Search tickets, assets, changes…"
              allowClear
              onClear={() => { setSearchQuery(''); setSearchOptions([]) }}
            />
          </AutoComplete>

          {/* Notification bell */}
          <Badge count={unreadCount} size="small" offset={[-2, 2]}>
            <Button
              type="text"
              icon={<BellOutlined style={{ fontSize: 18 }} />}
              onClick={openNotifDrawer}
              aria-label="Notifications"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            />
          </Badge>

          {user?.role_display && (
            <Tag color="blue" style={{ marginRight: 0 }}>
              {user.role_display}
            </Tag>
          )}

          <Dropdown
            menu={{ items: userMenuItems }}
            placement="bottomRight"
            trigger={['click']}
          >
            <div
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              aria-label="User menu"
            >
              <Avatar
                icon={<UserOutlined />}
                size="small"
                style={{ backgroundColor: '#1677ff' }}
              />
              {!collapsed && <Text>{user?.full_name ?? user?.email}</Text>}
            </div>
          </Dropdown>
        </Header>

        {/* Notification drawer */}
        <Drawer
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Notifications</span>
              <Button size="small" type="link" onClick={markAllRead}>
                Mark all as read
              </Button>
            </div>
          }
          placement="right"
          width={400}
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
          styles={{ body: { padding: 0 } }}
        >
          {notifLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
              No notifications yet.
            </div>
          ) : (
            <List
              dataSource={notifications}
              renderItem={notif => (
                <List.Item
                  key={notif.id}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderLeft: notif.is_read ? 'none' : '3px solid #1677ff',
                    background: notif.is_read ? 'transparent' : '#f0f7ff',
                    transition: 'background 0.2s',
                  }}
                  onClick={() => markRead(notif)}
                >
                  <List.Item.Meta
                    avatar={notifIcon(notif.notification_type)}
                    title={
                      <span style={{ fontWeight: notif.is_read ? 400 : 600 }}>
                        {notif.title}
                      </span>
                    }
                    description={
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Text
                          type="secondary"
                          ellipsis={{ tooltip: notif.body }}
                          style={{ fontSize: 12, display: 'block', maxWidth: 300 }}
                        >
                          {notif.body}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          <ClockCircleOutlined style={{ marginRight: 4 }} />
                          {dayjs(notif.created_at).fromNow()}
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Drawer>

        <Content
          style={{
            margin: 24,
            padding: 24,
            background: '#fff',
            borderRadius: 8,
            minHeight: 'calc(100vh - 64px - 48px)',
          }}
        >
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  )
}
