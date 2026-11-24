import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import UserAvatar from '../common/UserAvatar';
import StoryViewer from './StoryViewer';
import CreateStatusModal from './CreateStatusModal';
import storyService from '../../services/storyService';
import { socket } from '../../services/socket';
import { useAuth } from '../../context/useAuth';
import './stories.css';

function formatFullTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function StatusPage({ onBack }) {
  const { user: currentUser } = useAuth();
  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();

  const [loading, setLoading] = useState(true);
  const [myGroup, setMyGroup] = useState(null);
  const [friendGroups, setFriendGroups] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);

  const fetchFeed = useCallback(async () => {
    try {
      const data = await storyService.getFeed();
      setMyGroup(data.myGroup || null);
      setFriendGroups(data.friendGroups || []);
    } catch {
      /* ignore gracefully */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  useEffect(() => {
    const handleUpdate = () => fetchFeed();
    socket.on('story_new', handleUpdate);
    socket.on('story_viewed', handleUpdate);
    socket.on('story_deleted', handleUpdate);
    return () => {
      socket.off('story_new', handleUpdate);
      socket.off('story_viewed', handleUpdate);
      socket.off('story_deleted', handleUpdate);
    };
  }, [fetchFeed]);

  const viewerGroups = useMemo(() => {
    const list = [];
    if (myGroup && myGroup.stories?.length > 0) {
      list.push({ ...myGroup, isMe: true });
    }
    (friendGroups || []).forEach((fg) => {
      if (fg.stories?.length > 0) {
        list.push(fg);
      }
    });
    return list;
  }, [myGroup, friendGroups]);

  const recentUpdates = useMemo(() => {
    return friendGroups.filter((g) => g.hasUnseen);
  }, [friendGroups]);

  const viewedUpdates = useMemo(() => {
    return friendGroups.filter((g) => !g.hasUnseen);
  }, [friendGroups]);

  const handleOpenViewer = (group) => {
    const idx = viewerGroups.findIndex(
      (g) => (g.user?._id || g.user?.id) === (group.user?._id || group.user?.id)
    );
    if (idx !== -1) {
      setSelectedGroupIndex(idx);
      setViewerOpen(true);
    }
  };

  const myHasStories = Boolean(myGroup && myGroup.stories?.length > 0);

  return (
    <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--theme-chat-bg, #181a20)', overflowY: 'auto' }}>
      {/* Top Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.07))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{ background: 'none', border: 'none', color: 'var(--text-main, #fff)', fontSize: 20, cursor: 'pointer', padding: 4 }}
              title="Back"
            >
              ←
            </button>
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-main, #fff)' }}>
              Status & Stories
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted, #9ca3af)' }}>
              Share photos, videos and text updates that disappear after 24 hours.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            background: 'var(--color-primary, var(--theme-primary, #7c3aed))',
            color: '#fff',
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 12px rgba(124, 58, 237, 0.35)'
          }}
        >
          <span>➕</span>
          <span>Add Status</span>
        </button>
      </div>

      <div style={{ maxWidth: 840, width: '100%', margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 28, boxSizing: 'border-box' }}>
        {/* ── My Status Card ── */}
        <div style={{ background: 'var(--bg-surface, #1e222b)', border: '1px solid var(--border-color, rgba(255,255,255,0.08))', borderRadius: 16, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: myHasStories ? 'pointer' : 'default' }}
              onClick={myHasStories ? () => handleOpenViewer(myGroup) : undefined}
            >
              <div className={`story-ring-wrapper ${myHasStories ? 'story-ring-my-active' : 'story-ring-none'}`} style={{ width: 56, height: 56 }}>
                <div className={myHasStories ? 'story-ring-inner' : ''}>
                  <UserAvatar
                    src={currentUser?.avatar}
                    name={currentUser?.fullName || currentUser?.username}
                    size={48}
                  />
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-main, #fff)' }}>
                  My Status
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>
                  {myHasStories
                    ? `${myGroup.stories.length} active update${myGroup.stories.length > 1 ? 's' : ''} • Latest at ${formatFullTime(myGroup.latestTimestamp)}`
                    : 'No active updates. Tap to share with your friends.'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {myHasStories && (
                <button
                  type="button"
                  onClick={() => handleOpenViewer(myGroup)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  View Status
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: 'var(--color-primary, var(--theme-primary, #7c3aed))',
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + New Update
              </button>
            </div>
          </div>
        </div>

        {/* ── Recent Updates (Unseen) ── */}
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary, #a855f7)', marginBottom: 12 }}>
            Recent Updates ({recentUpdates.length})
          </h3>

          {loading ? (
            <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 14 }}>Loading status updates...</p>
          ) : recentUpdates.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.08)' }}>
              <p style={{ color: 'var(--text-muted, #9ca3af)', margin: 0, fontSize: 14 }}>
                No new recent updates from your friends.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {recentUpdates.map((group) => {
                const author = group.user || {};
                const name = author.fullName || author.username || 'Friend';
                return (
                  <div
                    key={author._id || author.id}
                    onClick={() => handleOpenViewer(group)}
                    style={{
                      background: 'var(--bg-surface, #1e222b)',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                      borderRadius: 14,
                      padding: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'transform 0.18s ease, border-color 0.18s ease'
                    }}
                  >
                    <div className="story-ring-wrapper story-ring-unseen" style={{ width: 52, height: 52 }}>
                      <div className="story-ring-inner">
                        <UserAvatar src={author.avatar} name={name} size={44} />
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-main, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>
                        {formatFullTime(group.latestTimestamp)} • {group.stories.length} update{group.stories.length > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Viewed Updates ── */}
        {viewedUpdates.length > 0 && (
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #9ca3af)', marginBottom: 12 }}>
              Viewed Updates ({viewedUpdates.length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {viewedUpdates.map((group) => {
                const author = group.user || {};
                const name = author.fullName || author.username || 'Friend';
                return (
                  <div
                    key={author._id || author.id}
                    onClick={() => handleOpenViewer(group)}
                    style={{
                      background: 'var(--bg-surface, #1e222b)',
                      border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                      borderRadius: 14,
                      padding: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      opacity: 0.8
                    }}
                  >
                    <div className="story-ring-wrapper story-ring-seen" style={{ width: 52, height: 52 }}>
                      <div className="story-ring-inner">
                        <UserAvatar src={author.avatar} name={name} size={44} />
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-main, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>
                        {formatFullTime(group.latestTimestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create Status Modal */}
      <CreateStatusModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onStoryCreated={fetchFeed}
      />

      {/* Story Viewer */}
      {viewerOpen && viewerGroups.length > 0 && (
        <StoryViewer
          isOpen={viewerOpen}
          initialUserGroupIndex={selectedGroupIndex}
          userGroups={viewerGroups}
          currentUserId={currentUserId}
          onClose={() => setViewerOpen(false)}
          onStoryDeleted={fetchFeed}
        />
      )}
    </div>
  );
}

StatusPage.propTypes = {
  onBack: PropTypes.func
};
