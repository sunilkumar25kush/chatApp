import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState('messaging');
  const [typedMessage, setTypedMessage] = useState('');
  const fullText = "Hey team! The new LiveKit WebRTC video integration is live 🚀 Let's test the 4K call stream!";

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setTypedMessage(fullText.slice(0, index));
      index++;
      if (index > fullText.length + 20) {
        index = 0;
      }
    }, 45);
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="home-feature-icon">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 10h.01M12 10h.01M16 10h.01" />
        </svg>
      ),
      tag: 'Socket.io v4 Engine',
      title: 'Ultra-Low Latency Messaging',
      desc: 'Sub-30ms message delivery with instant read receipts, optimistic updates, and persistent state across all tabs.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="home-feature-icon">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      ),
      tag: 'LiveKit SFU',
      title: 'Multi-Party Video & Voice',
      desc: 'Selective Forwarding Unit (SFU) architecture capable of crystal-clear group conferences with screen share and adaptive bitrate.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="home-feature-icon">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      tag: 'OMEMO & TLS 1.3',
      title: 'Enterprise Encryption',
      desc: 'Transport-layer security paired with end-to-end cryptographic safeguards ensuring your private conversations remain private.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="home-feature-icon">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      ),
      tag: 'Studio Quality Audio',
      title: 'Interactive Voice Notes',
      desc: 'Record and stream voice notes with waveform scrubbing, real-time volume normalization, and rapid download caching.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="home-feature-icon">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      ),
      tag: 'Media Engine',
      title: 'Instant CDN File Sharing',
      desc: 'Seamlessly upload documents, images, and archives with automatic preview thumbnails and high-speed local/cloud delivery.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="home-feature-icon">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ),
      tag: 'Personality Studio',
      title: 'Custom Themes & Wallpapers',
      desc: 'Express yourself with dynamic wallpapers, obsidian dark mode, neon cyberpunk accents, and custom presence statuses.',
    },
  ];

  const stats = [
    { value: '< 25ms', label: 'Message Sync Latency' },
    { value: '99.99%', label: 'Uptime SLA' },
    { value: '4K 60fps', label: 'SFU Video Streams' },
    { value: '100% PWA', label: 'Cross-Device Responsive' },
  ];

  return (
    <div className="home-page-wrapper">
      {/* Ambient background glow orbs */}
      <div className="ambient-glow-orb ambient-orb-1" aria-hidden="true" />
      <div className="ambient-glow-orb ambient-orb-2" aria-hidden="true" />
      <div className="ambient-grid-overlay" aria-hidden="true" />

      {/* ─── HERO SECTION ────────────────────────────────────────── */}
      <section className="home-hero-section">
        <div className="home-hero-badge">
          <span className="badge-pulse-dot" />
          <span className="badge-text">Next-Generation Real-Time Platform</span>
          <span className="badge-tag">v2.4 Live</span>
        </div>

        <h1 className="home-hero-headline">
          Conversations Elevated.<br />
          <span className="gradient-text">Encrypted, Seamless & Lightning Fast.</span>
        </h1>

        <p className="home-hero-subhead">
          Experience ultra-low-latency text messaging, crystal-clear WebRTC SFU voice &amp; video conferences,
          and rich media collaboration designed for modern teams and communities.
        </p>

        <div className="home-hero-actions">
          {isAuthenticated ? (
            <Link to="/chat" className="btn-glow-primary">
              <span>Launch Chatroom</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="btn-arrow-icon">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          ) : (
            <>
              <Link to="/register" className="btn-glow-primary">
                <span>Get Started Free</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="btn-arrow-icon">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link to="/login" className="btn-glass-secondary">
                <span>Sign In to Account</span>
              </Link>
            </>
          )}
        </div>

        <div className="home-social-proof">
          <div className="proof-avatars">
            <span className="proof-avatar" style={{ background: '#6366f1' }}>JD</span>
            <span className="proof-avatar" style={{ background: '#06b6d4' }}>SK</span>
            <span className="proof-avatar" style={{ background: '#10b981' }}>AL</span>
            <span className="proof-avatar" style={{ background: '#f59e0b' }}>MR</span>
          </div>
          <div className="proof-text">
            <strong>Active Global Community</strong>
            <span>Encrypted WebRTC &amp; WebSocket sessions streaming 24/7</span>
          </div>
        </div>

        {/* ─── INTERACTIVE APP PREVIEW MOCKUP ─────────────────────── */}
        <div className="home-mockup-frame">
          <div className="mockup-header-bar">
            <div className="mockup-traffic-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <div className="mockup-search-capsule">
              <span className="mockup-lock-icon">🔒</span>
              <span className="mockup-url-text">chatroom.app/channel/engineering-hq</span>
            </div>
            <div className="mockup-header-status">
              <span className="status-pill-online">● 14 Online</span>
            </div>
          </div>

          <div className="mockup-body-split">
            {/* Sidebar list preview */}
            <div className="mockup-sidebar-preview">
              <div className="mockup-channel-item active">
                <span className="channel-hash">#</span>
                <div className="channel-meta">
                  <div className="channel-name">engineering-hq</div>
                  <div className="channel-sub">LiveKit SFU testing</div>
                </div>
                <span className="channel-badge">3</span>
              </div>
              <div className="mockup-channel-item">
                <span className="channel-hash">#</span>
                <div className="channel-meta">
                  <div className="channel-name">product-launch</div>
                  <div className="channel-sub">Design updates</div>
                </div>
              </div>
              <div className="mockup-channel-item">
                <span className="channel-hash">#</span>
                <div className="channel-meta">
                  <div className="channel-name">general-lounge</div>
                  <div className="channel-sub">Social hangouts</div>
                </div>
              </div>

              {/* Call in progress card */}
              <div className="mockup-active-call-pill">
                <div className="call-avatar-stack">
                  <span className="call-avatar">🎙️</span>
                </div>
                <div className="call-info">
                  <div className="call-title">Team Standup</div>
                  <div className="call-time">Live · 04:12</div>
                </div>
                <button className="call-join-mini-btn" type="button">Join</button>
              </div>
            </div>

            {/* Chat feed preview */}
            <div className="mockup-chat-feed">
              {/* Message 1: Incoming */}
              <div className="mockup-msg-row incoming">
                <div className="mockup-avatar" style={{ background: '#3b82f6' }}>SK</div>
                <div className="mockup-bubble-wrap">
                  <div className="mockup-sender-label">Sarah Connor <span className="mockup-time">10:42 AM</span></div>
                  <div className="mockup-bubble in">
                    Welcome everyone! Let&apos;s review the new latency benchmarks on the WebSocket cluster.
                  </div>
                  <div className="mockup-reaction-pills">
                    <span className="reaction-chip">🔥 4</span>
                    <span className="reaction-chip">❤️ 6</span>
                  </div>
                </div>
              </div>

              {/* Message 2: Outgoing */}
              <div className="mockup-msg-row outgoing">
                <div className="mockup-bubble-wrap">
                  <div className="mockup-sender-label right">You <span className="mockup-time">10:44 AM</span></div>
                  <div className="mockup-bubble out">
                    {typedMessage || '...'}
                    <span className="mockup-cursor">|</span>
                  </div>
                  <div className="mockup-receipt">✓✓ Delivered</div>
                </div>
                <div className="mockup-avatar" style={{ background: '#6366f1' }}>ME</div>
              </div>

              {/* Call Banner */}
              <div className="mockup-call-notification">
                <div className="mockup-call-icon">📹</div>
                <div className="mockup-call-text">
                  <strong>Group Video Conference Started</strong>
                  <span>High Definition 4K WebRTC SFU Room Active</span>
                </div>
                <Link to="/chat" className="mockup-call-btn">Enter Room</Link>
              </div>

              {/* Mockup Composer */}
              <div className="mockup-composer-bar">
                <span className="composer-clip">📎</span>
                <span className="composer-input-placeholder">Send a message to #engineering-hq...</span>
                <div className="composer-actions">
                  <span className="composer-action">😊</span>
                  <span className="composer-action">🎤</span>
                  <span className="composer-send-pill">➤</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS COUNTER BAR ────────────────────────────────────── */}
      <section className="home-stats-strip">
        <div className="home-stats-grid">
          {stats.map((s, idx) => (
            <div key={idx} className="stat-card">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES SHOWCASE ────────────────────────────────────── */}
      <section className="home-features-section">
        <div className="section-head text-center">
          <div className="section-eyebrow">Enterprise Core Engine</div>
          <h2 className="section-title">Engineered for Seamless Communication</h2>
          <p className="section-subtitle">
            Every layer—from WebSocket duplex streaming to LiveKit SFU media orchestration—is built
            to deliver lightning performance without compromise.
          </p>
        </div>

        <div className="features-grid">
          {features.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-card-glow" />
              <div className="feature-icon-wrapper">{f.icon}</div>
              <div className="feature-tag">{f.tag}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── READY TO CONNECT CTA ─────────────────────────────────── */}
      <section className="home-cta-section">
        <div className="home-cta-card">
          <div className="cta-glow-backdrop" />
          <h2 className="cta-heading">Ready to Experience Modern Messaging?</h2>
          <p className="cta-subheading">
            Join thousands of conversations with real-time room discovery, zero installation barriers,
            and complete mobile, tablet, and desktop responsiveness.
          </p>
          <div className="cta-actions">
            <Link to={isAuthenticated ? "/chat" : "/register"} className="btn-glow-primary btn-large">
              <span>{isAuthenticated ? 'Open Chat Dashboard' : 'Create Free Account'}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="btn-arrow-icon">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link to="/chat" className="btn-glass-secondary btn-large">
              <span>Explore Public Channels</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────────── */}
      <footer className="home-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="footer-logo">
              <span className="logo-spark">✦</span> ChatRoom
            </div>
            <p className="footer-tagline">Real-Time Messaging &amp; Voice/Video Calling Platform.</p>
          </div>

          <div className="footer-status-pill">
            <span className="status-live-dot" />
            <span>All Services Operational · WebSocket Connected</span>
          </div>

          <div className="footer-links">
            <Link to="/">Home</Link>
            <Link to="/chat">Chat</Link>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </div>
        </div>
        <div className="footer-copyright">
          © {new Date().getFullYear()} ChatRoom. Built with MERN, LiveKit WebRTC &amp; Socket.io.
        </div>
      </footer>
    </div>
  );
}
