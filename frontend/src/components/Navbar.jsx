import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayName = user?.fullName || user?.username || user?.email || 'User';

  return (
    <nav className="navbar" role="navigation" aria-label="Main Navigation">
      <div className="navbar-container">
        {/* Brand Logo */}
        <Link to="/" className="navbar-brand">
          <div className="brand-icon-bubble">
            <span className="brand-spark">✦</span>
          </div>
          <span className="brand-text">
            Chat<span className="brand-accent">Room</span>
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="navbar-links navbar-desktop-links">
          <Link
            to="/"
            className={`nav-link-item ${location.pathname === '/' ? 'active' : ''}`}
          >
            Home
          </Link>
          <Link
            to="/chat"
            className={`nav-link-item ${location.pathname === '/chat' ? 'active' : ''}`}
          >
            Chat
          </Link>

          {isAuthenticated ? (
            <div className="navbar-user-section">
              <div className="user-profile-pill">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={displayName}
                    className="user-pill-avatar"
                  />
                ) : (
                  <span className="user-pill-initials">
                    {(displayName.substring(0, 2)).toUpperCase()}
                  </span>
                )}
                <span className="user-pill-name">{displayName}</span>
                <span className="user-status-dot" title="Online" />
              </div>

              <button
                onClick={handleLogout}
                className="btn-logout-pill"
                type="button"
                title="Log out"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="navbar-auth-buttons">
              <Link to="/login" className="nav-btn-login">
                Sign In
              </Link>
              <Link to="/register" className="nav-btn-register">
                Get Started
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <button
          className="navbar-mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle Navigation Menu"
          aria-expanded={mobileMenuOpen}
          type="button"
        >
          {mobileMenuOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="toggle-svg">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="toggle-svg">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Menu Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="navbar-mobile-drawer" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-drawer-inner" onClick={(e) => e.stopPropagation()}>
            <Link
              to="/"
              className={`mobile-nav-link ${location.pathname === '/' ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="mobile-nav-icon">🏠</span> Home
            </Link>
            <Link
              to="/chat"
              className={`mobile-nav-link ${location.pathname === '/chat' ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="mobile-nav-icon">💬</span> Chat Dashboard
            </Link>

            {isAuthenticated ? (
              <div className="mobile-user-section">
                <div className="mobile-user-card">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={displayName} className="mobile-user-avatar" />
                  ) : (
                    <div className="mobile-user-initials">
                      {(displayName.substring(0, 2)).toUpperCase()}
                    </div>
                  )}
                  <div className="mobile-user-info">
                    <div className="mobile-username">{displayName}</div>
                    <div className="mobile-user-sub">Active Now</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="mobile-btn-logout"
                  type="button"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="mobile-auth-grid">
                <Link
                  to="/login"
                  className="mobile-btn-login"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="mobile-btn-register"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Create Account
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
