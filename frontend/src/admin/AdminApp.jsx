import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { AdminThemeProvider } from './context/AdminThemeContext';
import { AdminToaster } from './components/AdminToaster';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import AdminLayout from './components/AdminLayout';
import AdminLogin from './pages/AdminLogin';
import MfaSetup from './pages/MfaSetup';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/Users';
import RoomsPage from './pages/Rooms';
import MessagesPage from './pages/Messages';
import ReportsPage from './pages/Reports';
import FriendsPage from './pages/Friends';
import CallsPage from './pages/Calls';
import AnnouncementsPage from './pages/Announcements';
import AnalyticsPage from './pages/Analytics';
import RolesPage from './pages/Roles';
import AuditLogsPage from './pages/AuditLogs';
import SettingsPage from './pages/Settings';
import './admin.css';

export default function AdminApp() {
  return (
    <AdminThemeProvider>
      <AdminAuthProvider>
        <AdminToaster />
        <Routes>
          <Route path="login" element={<AdminLogin />} />
          <Route
            path="setup-mfa"
            element={(
              <AdminProtectedRoute>
                <AdminLayout />
              </AdminProtectedRoute>
            )}
          >
            <Route index element={<MfaSetup />} />
          </Route>
          <Route
            element={(
              <AdminProtectedRoute>
                <AdminLayout />
              </AdminProtectedRoute>
            )}
          >
            <Route index element={<Dashboard />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="rooms" element={<RoomsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="friends" element={<FriendsPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="audit-logs" element={<AuditLogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AdminAuthProvider>
    </AdminThemeProvider>
  );
}
