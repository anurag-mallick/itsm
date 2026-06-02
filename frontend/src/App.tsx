import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TicketList from './pages/tickets/TicketList'
import CreateTicket from './pages/tickets/CreateTicket'
import TicketDetail from './pages/tickets/TicketDetail'
import ChangeList from './pages/changes/ChangeList'
import CreateChange from './pages/changes/CreateChange'
import ChangeDetail from './pages/changes/ChangeDetail'
import HardwareList from './pages/assets/HardwareList'
import HardwareDetail from './pages/assets/HardwareDetail'
import AssetAcceptance from './pages/assets/AssetAcceptance'
import SoftwareList from './pages/assets/SoftwareList'
import AuditLogViewer from './pages/audit/AuditLogViewer'
import UserManagement from './pages/settings/UserManagement'
import Categories from './pages/settings/Categories'
import CustomFields from './pages/settings/CustomFields'
import CannedResponses from './pages/settings/CannedResponses'
import EmailConfig from './pages/settings/EmailConfig'
import TeamsConfig from './pages/settings/TeamsConfig'
import ScanLanding from './pages/scan/ScanLanding'
import PrivacyPolicy from './pages/PrivacyPolicy'
import GuestPortal from './pages/GuestPortal'
import CalendarView from './pages/CalendarView'
import SprintList from './pages/sprints/SprintList'
import SprintBoard from './pages/sprints/SprintBoard'
import AccessRequestList from './pages/access_requests/AccessRequestList'
import AccessRequestDetail from './pages/access_requests/AccessRequestDetail'
import ManagerApproval from './pages/access_requests/ManagerApproval'
import ResetPassword from './pages/ResetPassword'
import ChangePassword from './pages/profile/ChangePassword'
import UserProfile from './pages/profile/UserProfile'
import ServiceCatalog from './pages/catalog/ServiceCatalog'
import KnowledgeBase from './pages/knowledge/KnowledgeBase'
import DiscoveryPage from './pages/discovery/DiscoveryPage'
import ProblemList from './pages/problems/ProblemList'
import ProblemDetail from './pages/problems/ProblemDetail'
import { useAuthStore } from './store/auth'
import client from './api/client'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { isAuthenticated, setUser } = useAuthStore()

  // On mount, fetch the current user profile if a token exists
  useEffect(() => {
    if (isAuthenticated) {
      client
        .get('/auth/me/')
        .then(({ data }) => setUser(data))
        .catch(() => { /* handled by interceptor */ })
    }
  }, [isAuthenticated, setUser])

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/portal" element={<GuestPortal />} />
          <Route path="/access-requests/review/:id" element={<ManagerApproval />} />
          <Route path="/assets/accept/:assetId" element={<AssetAcceptance />} />

          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            {/* Dashboard */}
            <Route index element={<Dashboard />} />

            {/* Tickets */}
            <Route path="tickets" element={<TicketList />} />
            <Route path="tickets/new" element={<CreateTicket />} />
            <Route path="tickets/:id" element={<TicketDetail />} />

            {/* Access Requests */}
            <Route path="access-requests" element={<AccessRequestList />} />
            <Route path="access-requests/:id" element={<AccessRequestDetail />} />

            {/* Changes */}
            <Route path="changes" element={<ChangeList />} />
            <Route path="changes/new" element={<CreateChange />} />
            <Route path="changes/:id" element={<ChangeDetail />} />

            {/* Sprints */}
            <Route path="sprints" element={<SprintList />} />
            <Route path="sprints/:id" element={<SprintBoard />} />

            {/* Calendar */}
            <Route path="calendar" element={<CalendarView />} />

            {/* Assets */}
            <Route path="assets/hardware" element={<HardwareList />} />
            <Route path="assets/hardware/:id" element={<HardwareDetail />} />
            <Route path="assets/software" element={<SoftwareList />} />

            {/* Audit */}
            <Route path="audit" element={<AuditLogViewer />} />

            {/* Settings */}
            <Route path="settings/users" element={<UserManagement />} />
            <Route path="settings/categories" element={<Categories />} />
            <Route path="settings/custom-fields" element={<CustomFields />} />
            <Route path="settings/canned-responses" element={<CannedResponses />} />
            <Route path="settings/email" element={<EmailConfig />} />
            <Route path="settings/teams" element={<TeamsConfig />} />

            {/* Service Catalog */}
            <Route path="catalog" element={<ServiceCatalog />} />

            {/* Knowledge Base */}
            <Route path="knowledge" element={<KnowledgeBase />} />
            <Route path="knowledge/:slug" element={<KnowledgeBase />} />

            {/* Discovery */}
            <Route path="discovery" element={<DiscoveryPage />} />

            {/* Problems */}
            <Route path="problems" element={<ProblemList />} />
            <Route path="problems/:id" element={<ProblemDetail />} />

            {/* Profile */}
            <Route path="profile" element={<UserProfile />} />
            <Route path="profile/password" element={<ChangePassword />} />

            {/* Hardware scan via QR token */}
            <Route path="scan/:token" element={<ScanLanding />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}
