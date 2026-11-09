import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

export default function AdminProtectedRoute({ children }) {
  const { admin, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="admin-root" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="admin-row">
          <span className="admin-spinner" style={{ color: 'var(--a-primary)' }} />
          <span className="admin-text-muted">Verifying admin session…</span>
        </div>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!admin.mfaEnabled && location.pathname !== '/admin/setup-mfa') {
    return <Navigate to="/admin/setup-mfa" replace />;
  }

  return children;
}
