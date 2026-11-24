import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import UserAvatar from '../common/UserAvatar';
import StoryViewer from './StoryViewer';
import CreateStatusModal from './CreateStatusModal';
import storyService from '../../services/storyService';
import { socket } from '../../services/socket';
import './stories.css';

function formatTrayTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffSecs = Math.floor((now - d) / 1000);
  if (diffSecs < 60) return 'now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return '1d';
}

export default function StoriesTray({ currentUser }) {
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

  // Real-time socket events for new stories, views, and deletions
  useEffect(() => {
    const handleNewStory = () => {
      fetchFeed();
    };
    const handleStoryViewed = () => {
      fetchFeed();
    };
    const handleStoryDeleted = () => {
      fetchFeed();
    };

    socket.on('story_new', handleNewStory);
    socket.on('story_viewed', handleStoryViewed);
    socket.on('story_deleted', handleStoryDeleted);

    return () => {
      socket.off('story_new', handleNewStory);
      socket.off('story_viewed', handleStoryViewed);
      socket.off('story_deleted', handleStoryDeleted);
    };
  }, [fetchFeed]);

  // Combined viewer groups: my stories (if exists) at index 0, followed by friends
  const viewerGroups = useMemo(() => {
    const list = [];
    if (myGroup && myGroup.stories && myGroup.stories.length > 0) {
      list.push({ ...myGroup, isMe: true });
    }
    (friendGroups || []).forEach((fg) => {
      if (fg.stories && fg.stories.length > 0) {
        list.push(fg);
      }
    });
    return list;
  }, [myGroup, friendGroups]);

  const handleOpenMyStories = () => {
    if (myGroup && myGroup.stories && myGroup.stories.length > 0) {
      setSelectedGroupIndex(0);
      setViewerOpen(true);
    } else {
      setIsCreateModalOpen(true);
    }
  };

  const handleOpenFriendStories = (friendGroup) => {
    const idx = viewerGroups.findIndex(
      (g) => (g.user?._id || g.user?.id) === (friendGroup.user?._id || friendGroup.user?.id)
    );
    if (idx !== -1) {
      setSelectedGroupIndex(idx);
      setViewerOpen(true);
    }
  };

  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();
  const myHasStories = Boolean(myGroup && myGroup.stories && myGroup.stories.length > 0);

  return (
    <div className="stories-tray-container" aria-label="Stories and Status Tray">
      <div className="stories-tray-header">
        <span className="stories-tray-title">
          <span className="stories-tray-title-dot" />
          Status
        </span>
        <button
          type="button"
          className="stories-tray-add-btn"
          onClick={() => setIsCreateModalOpen(true)}
          title="Add Status"
        >
          + Add
        </button>
      </div>

      <div className="stories-scroll-row" role="list">
        {/* ── 1. Current User Item (Always First) ── */}
        <div
          className="story-bubble-item"
          role="listitem"
          onClick={handleOpenMyStories}
          title={myHasStories ? 'View your status' : 'Add a status update'}
        >
          <div
            className={`story-ring-wrapper ${
              myHasStories ? 'story-ring-my-active' : 'story-ring-none'
            }`}
          >
            <div className={myHasStories ? 'story-ring-inner' : ''}>
              <UserAvatar
                src={currentUser?.avatar}
                name={currentUser?.fullName || currentUser?.username || 'You'}
                size={myHasStories ? 48 : 52}
              />
            </div>
            {/* Plus button to quickly trigger create modal */}
            <span
              className="story-add-badge"
              title="Add status update"
              onClick={(e) => {
                e.stopPropagation();
                setIsCreateModalOpen(true);
              }}
            >
              +
            </span>
          </div>
          <span className="story-bubble-label">Your Status</span>
          <span className="story-bubble-time">
            {myHasStories
              ? `${myGroup.stories.length} update${myGroup.stories.length > 1 ? 's' : ''}`
              : 'Tap to add'}
          </span>
        </div>

        {/* ── Skeleton Loading Placeholders ── */}
        {loading && (
          <>
            {[1, 2, 3].map((n) => (
              <div key={n} className="story-bubble-item" style={{ opacity: 0.5 }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    background: 'var(--border-color, rgba(255,255,255,0.08))',
                    animation: 'pulse 1.5s infinite ease-in-out'
                  }}
                />
                <span style={{ width: 44, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginTop: 4 }} />
              </div>
            ))}
          </>
        )}

        {/* ── 2. Friends' Stories ── */}
        {!loading &&
          friendGroups.map((group) => {
            const author = group.user || {};
            const displayName = author.fullName || author.username || 'Friend';
            const ringClass = group.hasUnseen ? 'story-ring-unseen' : 'story-ring-seen';

            return (
              <button
                key={author._id || author.id || author.username}
                type="button"
                className="story-bubble-item"
                role="listitem"
                onClick={() => handleOpenFriendStories(group)}
                title={`${displayName}'s status`}
              >
                <div className={`story-ring-wrapper ${ringClass}`}>
                  <div className="story-ring-inner">
                    <UserAvatar
                      src={author.avatar}
                      name={displayName}
                      size={48}
                    />
                  </div>
                </div>
                <span className="story-bubble-label">{displayName}</span>
                <span className="story-bubble-time">
                  {formatTrayTime(group.latestTimestamp)}
                </span>
              </button>
            );
          })}
      </div>

      {/* ── Create Status Modal ── */}
      <CreateStatusModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onStoryCreated={fetchFeed}
      />

      {/* ── Full-Screen Story Viewer ── */}
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

StoriesTray.propTypes = {
  currentUser: PropTypes.object
};
