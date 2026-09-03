import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand" style={{ fontWeight: 'bold', fontSize: '1.25rem', color: 'var(--primary)' }}>
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>ChatRoom</Link>
      </div>

      <button
        className="navbar-mobile-toggle"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label="Toggle Navigation Menu"
        type="button"
      >
        {mobileMenuOpen ? '✕' : '☰'}
      </button>

      {/* Desktop Links */}
      <div className="navbar-links navbar-desktop-links" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link to="/">Home</Link>
        <Link to="/chat">Chat</Link>

        {isAuthenticated ? (
          (() => {
            const isGoogle = user?.provider === 'google' || user?.googleId;
            const displayName = user?.fullName || user?.username || user?.email || 'User';

            if (isGoogle) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {user?.avatar && (
                      <img
                        src={user.avatar}
                        alt={displayName}
                        style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-slate)' }}
                      />
                    )}
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{displayName}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      padding: '0.4rem 0.8rem',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '0.85rem'
                    }}
                    onMouseEnter={(e) => e.target.style.color = 'var(--error)'}
                    onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
                  >
                    Logout
                  </button>
                </div>
              );
            }

            // Default (normal login) UI — preserve existing layout
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {user?.avatar && (
                    <img
                      src={user.avatar}
                      alt={user.username}
                      style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-slate)' }}
                    />
                  )}
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user?.username}</span>
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    padding: '0.4rem 0.8rem',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '0.85rem'
                  }}
                  onMouseEnter={(e) => e.target.style.color = 'var(--error)'}
                  onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
                >
                  Logout
                </button>
              </div>
            );
          })()
        ) : (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/login">Login</Link>
            <Link to="/register" style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--color-white)',
              padding: '0.4rem 0.9rem',
              borderRadius: 'var(--radius-xs)',
              textDecoration: 'none',
              fontWeight: 500
            }}>
              Register
            </Link>
          </div>
        )}
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="navbar-mobile-drawer" onClick={() => setMobileMenuOpen(false)}>
          <Link to="/" style={{ color: 'var(--text)', fontWeight: 600, minHeight: 42, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 6 }}>Home</Link>
          <Link to="/chat" style={{ color: 'var(--text)', fontWeight: 600, minHeight: 42, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 6 }}>Chat</Link>
          {isAuthenticated ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 8px', minHeight: 38 }}>
                {user?.avatar && (
                  <img
                    src={user.avatar}
                    alt="Avatar"
                    style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-slate)', flexShrink: 0 }}
                  />
                )}
                <span style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.fullName || user?.username || 'User'}</span>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--error, #ef4444)',
                  border: '1px solid var(--border)',
                  minHeight: 42,
                  padding: '0 1rem',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
              <Link to="/login" style={{ color: 'var(--text)', minHeight: 42, display: 'flex', alignItems: 'center', padding: '0 8px', borderRadius: 6, fontWeight: 500 }}>Login</Link>
              <Link to="/register" style={{
                backgroundColor: 'var(--primary)',
                color: 'var(--color-white)',
                minHeight: 42,
                padding: '0 1rem',
                borderRadius: 'var(--radius-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600
              }}>
                Register
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
