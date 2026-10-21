import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import { SkeletonCallHistory } from '../components/SkeletonLoaders';

export default function CallHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All'); // All, Voice, Video, Missed

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const res = await api.get('/calls');
        setCalls(res.data);
      } catch (err) {
        console.error('Failed to fetch call history:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCalls();
  }, []);

  const formatDuration = (seconds) => {
    if (!seconds) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    if (d.toDateString() === new Date().toDateString()) {
      return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredCalls = calls.filter(call => {
    if (filter === 'All') return true;
    if (filter === 'Voice') return call.type === 'voice';
    if (filter === 'Video') return call.type === 'video';
    if (filter === 'Missed') return call.status === 'missed';
    return true;
  });

  if (loading) {
    return (
      <SkeletonCallHistory />
    );
  }

  return (
    <div className="call-history-container">
      <div className="call-history-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 16px' }}>
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            title="Back"
            type="button"
            style={{
              width: 42,
              height: 42,
              minWidth: 42,
              minHeight: 42,
              borderRadius: 8,
              background: '#222530',
              border: '1px solid #3f4657',
              color: '#f3f4f6',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            ←
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#f3f4f6' }}>Call History</h1>
        </div>
        
        <div className="ui-scroll-tabs" role="tablist" aria-label="Filter call history">
          {['All', 'Voice', 'Video', 'Missed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              type="button"
              className={`ui-tab-chip ${filter === f ? 'active' : ''}`}
              role="tab"
              aria-selected={filter === f}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="call-history-feed scrollzone">
        {filteredCalls.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6b7280', marginTop: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📞</div>
            <h3>No recent calls found</h3>
            <p style={{ fontSize: 13 }}>Make a voice or video call to see it here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredCalls.map(call => {
              const myId = user?._id || user?.id;
              const callerId = call.caller?._id || call.caller?.id;
              const isOutgoing = Boolean(myId && callerId && String(myId) === String(callerId));
              const otherUser = isOutgoing ? call.receiver : call.caller;
              const otherName = otherUser ? otherUser.username : 'Unknown User';
              
              const isMissed = call.status === 'missed';
              const icon = call.type === 'video' ? '📹' : '📞';
              
              let statusColor = '#9ca3af';
              if (isMissed) statusColor = '#ef4444';
              else if (isOutgoing) statusColor = '#10b981'; // green for outgoing successful
              else statusColor = '#3b82f6'; // blue for incoming successful
              
              return (
                <div key={call._id} className="call-history-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#222530', borderRadius: 12, border: '1px solid #2d3241', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 180px' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                      {otherUser?.avatar ? (
                         <img src={otherUser.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                         otherName.substring(0, 2).toUpperCase()
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: isMissed ? '#ef4444' : '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {otherName}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9ca3af', marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ color: statusColor, fontSize: 13 }}>
                          {isMissed ? '↙' : isOutgoing ? '↗' : '↙'}
                        </span>
                        <span>{formatDate(call.startTime)}</span>
                        <span>•</span>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{call.room?.name || 'Private Room'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, color: '#d1d5db', fontWeight: 500 }}>{formatDuration(call.duration)}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{call.status}</div>
                    </div>
                    <div style={{ fontSize: 20, color: '#9ca3af' }}>{icon}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
