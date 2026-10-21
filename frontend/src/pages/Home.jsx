import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useSmoothScroll } from '../context/SmoothScroll';
import { animateHeroReveal } from '../utils/animations';
import gsap from 'gsap';

export default function Home() {
  const { isAuthenticated } = useAuth();
  const { lenis } = useSmoothScroll() || {};
  const containerRef = useRef(null);
  const mockupRef = useRef(null);

  const [activeChannel, setActiveChannel] = useState('engineering-hq');
  const [typedMessage, setTypedMessage] = useState('');

  const fullText = "SFU audio streams benchmarked at 19ms latency across all clients. Deploying to prod.";

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setTypedMessage(fullText.slice(0, index));
      index++;
      if (index > fullText.length + 24) {
        index = 0;
      }
    }, 40);
    return () => clearInterval(interval);
  }, []);

  // GSAP Orchestrated Page Entrance
  useEffect(() => {
    if (!containerRef.current) return;
    const tl = animateHeroReveal(containerRef.current);
    return () => {
      if (tl) tl.kill();
    };
  }, []);

  // Gentle 3D Mouse Parallax on central mockup
  const handleMouseMove = (e) => {
    if (!mockupRef.current || window.innerWidth < 1024) return;
    const rect = mockupRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    gsap.to(mockupRef.current, {
      rotationY: x * 3.5,
      rotationX: -y * 3.5,
      transformPerspective: 1200,
      ease: 'power1.out',
      duration: 0.35,
    });
  };

  const handleMouseLeave = () => {
    if (!mockupRef.current) return;
    gsap.to(mockupRef.current, {
      rotationY: 0,
      rotationX: 0,
      ease: 'power2.out',
      duration: 0.5,
    });
  };

  const handleScrollToFeatures = (e) => {
    e.preventDefault();
    if (lenis) {
      lenis.scrollTo('#architecture-specs', { offset: -60, duration: 1.2 });
    } else {
      const el = document.getElementById('architecture-specs');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const channelConversations = {
    'engineering-hq': [
      {
        id: '1',
        sender: 'Sarah Connor',
        avatar: 'SC',
        avatarBg: '#2563eb',
        time: '10:42 AM',
        text: 'Duplex WebSocket cluster updated. SFU conference room is active for audio & 4K video.',
        reactions: ['⚡ 4', '❤️ 2'],
      },
      {
        id: '2',
        sender: 'You',
        isMe: true,
        avatar: 'ME',
        avatarBg: '#4f46e5',
        time: '10:44 AM',
        isDynamicTyping: true,
        delivered: true,
      },
    ],
    'product-launch': [
      {
        id: '1',
        sender: 'Elena Rostova',
        avatar: 'ER',
        avatarBg: '#059669',
        time: '09:15 AM',
        text: 'The responsive mobile drawer and user profile modals have passed regression audits.',
        reactions: ['✨ 5'],
      },
      {
        id: '2',
        sender: 'Marcus Vance',
        avatar: 'MV',
        avatarBg: '#d97706',
        time: '09:18 AM',
        text: 'Verified. Lenis inertial momentum and GSAP message transitions feel tactile and fluid.',
      },
    ],
    'general-lounge': [
      {
        id: '1',
        sender: 'Alex Chen',
        avatar: 'AC',
        avatarBg: '#7c3aed',
        time: 'Yesterday',
        text: 'Welcome to the team channel! Feel free to test custom status pickers and themes.',
      },
      {
        id: '2',
        sender: 'You',
        isMe: true,
        avatar: 'ME',
        avatarBg: '#4f46e5',
        time: '10:02 AM',
        text: 'Voice note support and waveform scrubbing working seamlessly.',
        delivered: true,
      },
    ],
  };

  const architecturalSpecs = [
    {
      title: 'Direct duplex messaging',
      subtitle: 'Socket.io v4 real-time transport',
      desc: 'Sub-25ms message delivery across active channels with instant delivery receipts, typing telemetry, and persistent room state.',
      metric: '< 25ms',
      metricLabel: 'Sync Latency',
    },
    {
      title: 'Selective forwarding conference',
      subtitle: 'LiveKit SFU WebRTC architecture',
      desc: 'High-definition group audio and 4K video rooms with automated bitrate scaling, echo cancellation, and screen share.',
      metric: '4K 60fps',
      metricLabel: 'Video Streams',
    },
    {
      title: 'Cryptographic privacy',
      subtitle: 'TLS 1.3 & OMEMO multi-end encryption',
      desc: 'All communication is protected in transit with cryptographic session authentication and strict channel access gates.',
      metric: '256-bit',
      metricLabel: 'Session Cipher',
    },
    {
      title: 'Waveform audio engine',
      subtitle: 'Voice note recording and playback',
      desc: 'Integrated voice notes with real-time waveform visualization, volume normalization, and instant audio caching.',
      metric: '48 kHz',
      metricLabel: 'Studio Audio',
    },
    {
      title: 'Instant media delivery',
      subtitle: 'Secure object storage & CDN caching',
      desc: 'Send images, documents, and archives with automatic thumbnail previews and secure authenticated file streaming.',
      metric: 'Zero lag',
      metricLabel: 'Asset Streaming',
    },
    {
      title: 'Desktop and mobile harmony',
      subtitle: 'Responsive PWA & touch ergonomics',
      desc: 'Engineered as an installable progressive web app with swipe drawer navigation, smooth inertia scrolling, and offline caching.',
      metric: '100% PWA',
      metricLabel: 'Native Feel',
    },
  ];

  return (
    <div className="home-page-wrapper" ref={containerRef}>
      {/* Background architectural depth grid */}
      <div className="home-grid-backdrop" aria-hidden="true" />

      {/* ─── HERO SECTION ────────────────────────────────────────── */}
      <section className="home-hero-section">
        <div className="hero-telemetry-strip">
          <span className="telemetry-beacon" aria-hidden="true" />
          <span className="telemetry-text">Live WebRTC SFU &amp; duplex stream active</span>
        </div>

        <h1 className="home-hero-headline">
          Real-time communication, engineered with architectural precision.
        </h1>

        <p className="home-hero-subhead">
          Ultra-low-latency messaging, end-to-end encrypted discussion spaces, and multi-party voice and video conferencing built for modern collaboration.
        </p>

        <div className="home-hero-actions">
          {isAuthenticated ? (
            <Link to="/chat" className="hero-action-btn primary">
              <span>Launch chatroom</span>
            </Link>
          ) : (
            <>
              <Link to="/register" className="hero-action-btn primary">
                <span>Get started free</span>
              </Link>
              <Link to="/login" className="hero-action-btn secondary">
                <span>Sign in</span>
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={handleScrollToFeatures}
            className="hero-action-btn tertiary"
          >
            <span>Explore architecture</span>
          </button>
        </div>

        {/* ─── LIVE INTERACTIVE APP DEMO MOCKUP ─────────────────────── */}
        <div
          className="home-mockup-frame"
          ref={mockupRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Mockup Window Titlebar */}
          <div className="mockup-header-bar">
            <div className="mockup-traffic-dots" aria-hidden="true">
              <span className="dot dot-close" />
              <span className="dot dot-min" />
              <span className="dot dot-expand" />
            </div>
            <div className="mockup-capsule">
              <span className="mockup-capsule-icon">🔒</span>
              <span className="mockup-capsule-text">chatroom.app/channel/{activeChannel}</span>
            </div>
            <div className="mockup-status-live">
              <span className="live-dot" />
              <span>14 Connected</span>
            </div>
          </div>

          <div className="mockup-body-split">
            {/* Sidebar list preview with clickable channels */}
            <div className="mockup-sidebar-preview">
              <div className="mockup-sidebar-label">Channels</div>
              {['engineering-hq', 'product-launch', 'general-lounge'].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className={`mockup-channel-item ${activeChannel === ch ? 'active' : ''}`}
                  onClick={() => setActiveChannel(ch)}
                >
                  <span className="channel-hash">#</span>
                  <div className="channel-meta">
                    <span className="channel-name">{ch}</span>
                  </div>
                  {ch === 'engineering-hq' && <span className="channel-badge">Live</span>}
                </button>
              ))}

              {/* Call in progress card */}
              <div className="mockup-active-call-pill">
                <div className="call-avatar-stack">
                  <span className="call-avatar">🎙️</span>
                </div>
                <div className="call-info">
                  <div className="call-title">SFU Voice Stream</div>
                  <div className="call-time">Active · 04:12</div>
                </div>
                <Link to="/chat" className="call-join-mini-btn">Enter</Link>
              </div>
            </div>

            {/* Chat feed preview */}
            <div className="mockup-chat-feed">
              <div className="mockup-feed-header">
                <span className="feed-title">#{activeChannel}</span>
                <span className="feed-security">TLS 1.3 Verified Session</span>
              </div>

              <div className="mockup-messages-list">
                {channelConversations[activeChannel]?.map((msg) => (
                  <div
                    key={msg.id}
                    className={`mockup-msg-row ${msg.isMe ? 'outgoing' : 'incoming'}`}
                  >
                    {!msg.isMe && (
                      <div className="mockup-avatar" style={{ background: msg.avatarBg }}>
                        {msg.avatar}
                      </div>
                    )}
                    <div className="mockup-bubble-wrap">
                      <div className="mockup-sender-label">
                        <span>{msg.sender}</span>
                        <span className="mockup-time">{msg.time}</span>
                      </div>
                      <div className={`mockup-bubble ${msg.isMe ? 'out' : 'in'}`}>
                        {msg.isDynamicTyping ? (
                          <>
                            {typedMessage || '...'}
                            <span className="mockup-cursor" aria-hidden="true">|</span>
                          </>
                        ) : (
                          msg.text
                        )}
                      </div>
                      {msg.reactions && (
                        <div className="mockup-reaction-pills">
                          {msg.reactions.map((r, ri) => (
                            <span key={ri} className="reaction-chip">{r}</span>
                          ))}
                        </div>
                      )}
                      {msg.delivered && (
                        <div className="mockup-receipt">Delivered ✓✓</div>
                      )}
                    </div>
                    {msg.isMe && (
                      <div className="mockup-avatar" style={{ background: msg.avatarBg }}>
                        {msg.avatar}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Mockup Composer */}
              <div className="mockup-composer-bar">
                <span className="composer-clip">📎</span>
                <span className="composer-input-placeholder">Send a message to #{activeChannel}...</span>
                <div className="composer-actions">
                  <span className="composer-action">🎙️</span>
                  <span className="composer-send-pill">Send</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── ARCHITECTURAL SPECIFICATIONS GRID ─────────────────────── */}
      <section className="home-architecture-section" id="architecture-specs">
        <div className="section-head text-center">
          <h2 className="section-title">Engineered for speed, durability, and cryptographic privacy</h2>
          <p className="section-subtitle">
            A multi-layered architecture combining persistent WebSocket duplex transport with selective forwarding WebRTC media relays.
          </p>
        </div>

        <div className="architecture-grid">
          {architecturalSpecs.map((spec, i) => (
            <div key={i} className="spec-card">
              <div className="spec-card-top">
                <div className="spec-metric-wrap">
                  <span className="spec-metric-value">{spec.metric}</span>
                  <span className="spec-metric-label">{spec.metricLabel}</span>
                </div>
              </div>
              <h3 className="spec-title">{spec.title}</h3>
              <div className="spec-subtitle">{spec.subtitle}</div>
              <p className="spec-desc">{spec.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── DIRECT ACCESS ACTION SECTION ──────────────────────────── */}
      <section className="home-cta-section">
        <div className="home-cta-card">
          <h2 className="cta-heading">Ready to communicate without latency?</h2>
          <p className="cta-subheading">
            Join verified public channels or launch an encrypted discussion space with zero installation friction.
          </p>
          <div className="cta-actions">
            <Link to={isAuthenticated ? "/chat" : "/register"} className="hero-action-btn primary large">
              <span>{isAuthenticated ? 'Open chat dashboard' : 'Create free account'}</span>
            </Link>
            <Link to="/chat" className="hero-action-btn secondary large">
              <span>Browse public channels</span>
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
            <p className="footer-tagline">Real-time messaging and voice/video calling platform.</p>
          </div>

          <div className="footer-status-pill">
            <span className="status-live-dot" />
            <span>Duplex WebSocket &amp; LiveKit SFU active</span>
          </div>

          <div className="footer-links">
            <Link to="/">Home</Link>
            <Link to="/chat">Chat</Link>
            <Link to="/login">Sign in</Link>
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
