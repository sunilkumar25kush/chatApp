import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import UserAvatar from '../common/UserAvatar';
import storyService from '../../services/storyService';
import StoryPrivacySelector from './StoryPrivacySelector';
import { socket } from '../../services/socket';
import { toast } from '../../utils/toast';
import './stories.css';

function formatStoryTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffSecs = Math.floor((now - d) / 1000);
  if (diffSecs < 60) return 'Just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return 'Yesterday';
}

export default function StoryViewer({
  isOpen,
  initialUserGroupIndex = 0,
  userGroups = [],
  currentUserId,
  onClose,
  onStoryDeleted
}) {
  const [userIndex, setUserIndex] = useState(initialUserGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState(false);
  const [showViewersDrawer, setShowViewersDrawer] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [liveStoryUpdates, setLiveStoryUpdates] = useState({});

  const videoRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });

  const activeGroup = userGroups[userIndex] || null;
  const currentStories = activeGroup?.stories || [];
  const activeStory = currentStories[storyIndex] || null;
  const isMe = activeGroup?.user?._id?.toString() === currentUserId || activeGroup?.isMe;

  const isImageStory = Boolean(
    activeStory &&
    (activeStory.mediaType === 'image' ||
      activeStory.mediaType === 'photo' ||
      (!activeStory.mediaType && activeStory.mediaUrl))
  );
  const isVideoStory = Boolean(activeStory && activeStory.mediaType === 'video');
  const isTextStory = Boolean(activeStory && activeStory.mediaType === 'text');

  const liveUpdate = activeStory?._id ? liveStoryUpdates[activeStory._id] : null;
  const viewersList = liveUpdate?.viewers || activeStory?.viewers || [];
  const viewsCount = liveUpdate?.viewsCount ?? (activeStory?.viewsCount || viewersList.length);

  // Sync initial user group when opened
  useEffect(() => {
    if (isOpen) {
      setUserIndex(initialUserGroupIndex);
      setStoryIndex(0);
      setProgress(0);
      setIsPaused(false);
      setMediaError(false);
      setShowViewersDrawer(false);
    }
  }, [isOpen, initialUserGroupIndex]);

  // Reset media loading & error state whenever active story changes
  useEffect(() => {
    if (!activeStory) return;
    setMediaError(false);
    if (activeStory.mediaType === 'text') {
      setMediaLoading(false);
    } else {
      setMediaLoading(true);
    }
  }, [activeStory?._id, activeStory?.mediaType]);

  // Mark active story as viewed
  useEffect(() => {
    if (isOpen && activeStory && !isMe) {
      try {
        const p = storyService.viewStory(activeStory._id);
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }
  }, [isOpen, activeStory?._id, isMe]);

  // Auto-progress timer
  const advanceToNext = useCallback(() => {
    if (storyIndex < currentStories.length - 1) {
      // Next story of same user
      setStoryIndex((prev) => prev + 1);
      setProgress(0);
      setMediaLoading(true);
      setMediaError(false);
    } else if (userIndex < userGroups.length - 1) {
      // Advance to next user's stories
      setUserIndex((prev) => prev + 1);
      setStoryIndex(0);
      setProgress(0);
      setMediaLoading(true);
      setMediaError(false);
    } else {
      // Reached the end of all stories
      onClose();
    }
  }, [storyIndex, currentStories.length, userIndex, userGroups.length, onClose]);

  const goToPrev = useCallback(() => {
    if (storyIndex > 0) {
      // Previous story of same user
      setStoryIndex((prev) => prev - 1);
      setProgress(0);
      setMediaLoading(true);
      setMediaError(false);
    } else if (userIndex > 0) {
      // Previous user's last story
      const prevUser = userGroups[userIndex - 1];
      setUserIndex((prev) => prev - 1);
      setStoryIndex(Math.max(0, (prevUser?.stories?.length || 1) - 1));
      setProgress(0);
      setMediaLoading(true);
      setMediaError(false);
    }
  }, [storyIndex, userIndex, userGroups]);

  // Real-time synchronization for active story views, deletion, and expiration
  useEffect(() => {
    if (!isOpen || !activeStory?._id) return;

    const handleRealtimeView = (data = {}) => {
      if (data.storyId === activeStory._id && data.viewer && isMe) {
        setLiveStoryUpdates((prev) => {
          const currentEntry = prev[data.storyId] || {
            viewers: activeStory.viewers || [],
            viewsCount: activeStory.viewsCount || 0
          };
          const viewerId = data.viewer.user?._id || data.viewer.user?.id;
          const exists = currentEntry.viewers.some(
            (v) => (v.user?._id || v.user?.id) === viewerId
          );
          const newViewers = exists ? currentEntry.viewers : [...currentEntry.viewers, data.viewer];
          return {
            ...prev,
            [data.storyId]: {
              viewers: newViewers,
              viewsCount: data.totalViews || newViewers.length
            }
          };
        });
      }
    };

    const handleStoryRemoved = (data = {}) => {
      if (data.storyId === activeStory._id) {
        toast.info('This status update has expired or was removed');
        onStoryDeleted?.(data.storyId);
        if (currentStories.length <= 1) {
          onClose();
        } else {
          advanceToNext();
        }
      }
    };

    socket.on('story:viewed', handleRealtimeView);
    socket.on('story_viewed', handleRealtimeView);
    socket.on('story:deleted', handleStoryRemoved);
    socket.on('story_deleted', handleStoryRemoved);
    socket.on('story:expired', handleStoryRemoved);
    socket.on('story_expired', handleStoryRemoved);

    return () => {
      socket.off('story:viewed', handleRealtimeView);
      socket.off('story_viewed', handleRealtimeView);
      socket.off('story:deleted', handleStoryRemoved);
      socket.off('story_deleted', handleStoryRemoved);
      socket.off('story:expired', handleStoryRemoved);
      socket.off('story_expired', handleStoryRemoved);
    };
  }, [isOpen, activeStory?._id, isMe, currentStories.length, advanceToNext, onClose, onStoryDeleted]);

  // Manage progress bar animation
  useEffect(() => {
    if (!isOpen || !activeStory || isPaused || mediaLoading || mediaError || showViewersDrawer || showPrivacyModal) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    const durationSec = activeStory.duration || 5;
    const intervalMs = 50;
    const step = (100 / (durationSec * 1000)) * intervalMs;

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          clearInterval(progressIntervalRef.current);
          advanceToNext();
          return 100;
        }
        return prev + step;
      });
    }, intervalMs);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isOpen, activeStory, isPaused, mediaLoading, mediaError, showViewersDrawer, advanceToNext]);

  // Keyboard navigation listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        advanceToNext();
      } else if (e.key === 'ArrowLeft') {
        goToPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, advanceToNext, goToPrev, onClose]);

  // Touch swipe gestures
  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    setIsPaused(true);
  };

  const handleTouchEnd = (e) => {
    setIsPaused(false);
    const t = e.changedTouches[0];
    const diffX = t.clientX - touchStartRef.current.x;
    const diffY = t.clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;

    // Swipe down to close
    if (diffY > 80 && Math.abs(diffX) < 80) {
      onClose();
      return;
    }

    // Horizontal swipe: left to advance, right to prev
    if (Math.abs(diffX) > 60 && Math.abs(diffY) < 60) {
      if (diffX < 0) {
        advanceToNext();
      } else {
        goToPrev();
      }
      return;
    }

    // Short tap
    if (elapsed < 250 && Math.abs(diffX) < 15 && Math.abs(diffY) < 15) {
      const halfWidth = window.innerWidth / 2;
      if (t.clientX < halfWidth) {
        goToPrev();
      } else {
        advanceToNext();
      }
    }
  };

  // Delete own story
  const handleDeleteCurrentStory = async () => {
    if (!activeStory?._id) return;
    if (!window.confirm('Delete this status update?')) return;

    try {
      await storyService.deleteStory(activeStory._id);
      toast.success('Status deleted');
      onStoryDeleted?.(activeStory._id);

      // If this was the only story, close viewer
      if (currentStories.length <= 1) {
        onClose();
      } else {
        advanceToNext();
      }
    } catch {
      toast.error('Failed to delete story');
    }
  };

  if (!isOpen || !activeGroup || !activeStory) return null;

  const author = activeGroup.user || {};
  const authorName = author.fullName || author.username || 'User';

  return (
    <div className="story-viewer-overlay" role="dialog" aria-modal="true" aria-label="Story Viewer">
      {/* Desktop Prev Chevron */}
      {userIndex > 0 && (
        <button
          type="button"
          className="story-desktop-chevron story-desktop-chevron-left"
          onClick={goToPrev}
          aria-label="Previous story"
        >
          ‹
        </button>
      )}

      {/* Main Story Box */}
      <div
        className="story-viewer-modal"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
      >
        {/* ── Top Segmented Progress Bar ── */}
        <div className="story-progress-container">
          {currentStories.map((st, idx) => {
            let fillWidth = '0%';
            if (idx < storyIndex) fillWidth = '100%';
            else if (idx === storyIndex) fillWidth = `${progress}%`;

            return (
              <div key={st._id || idx} className="story-progress-segment">
                <div className="story-progress-fill" style={{ width: fillWidth }} />
              </div>
            );
          })}
        </div>

        {/* ── Header ── */}
        <div className="story-viewer-header">
          <div className="story-viewer-user">
            <UserAvatar
              src={author.avatar}
              name={authorName}
              size={36}
            />
            <div>
              <span className="story-viewer-username">{authorName}</span>
              <span className="story-viewer-timestamp">
                {formatStoryTime(activeStory.createdAt)}
              </span>
            </div>
          </div>

          <div className="story-viewer-controls">
            {/* Play/Pause toggle */}
            <button
              type="button"
              className="story-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsPaused(!isPaused);
              }}
              title={isPaused ? 'Resume' : 'Pause'}
              aria-label={isPaused ? 'Resume story' : 'Pause story'}
            >
              {isPaused ? '▶' : '⏸'}
            </button>

            {/* Mute toggle for video */}
            {isVideoStory && (
              <button
                type="button"
                className="story-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMuted(!isMuted);
                }}
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute video' : 'Mute video'}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
            )}

            {/* Privacy settings (owner only) */}
            {isMe && (
              <button
                type="button"
                className="story-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPaused(true);
                  setShowPrivacyModal(true);
                }}
                title="Change status privacy"
                aria-label="Change status privacy"
              >
                🔒
              </button>
            )}

            {/* Delete button (owner only) */}
            {isMe && (
              <button
                type="button"
                className="story-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCurrentStory();
                }}
                title="Delete this status"
                aria-label="Delete status"
              >
                🗑️
              </button>
            )}

            {/* Close button */}
            <button
              type="button"
              className="story-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Close"
              aria-label="Close story viewer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Left & Right Tap Zones (Desktop mouse clicks) ── */}
        <div
          className="story-tap-zone story-tap-zone-left"
          onClick={(e) => {
            e.stopPropagation();
            goToPrev();
          }}
          aria-label="Previous story zone"
        />
        <div
          className="story-tap-zone story-tap-zone-right"
          onClick={(e) => {
            e.stopPropagation();
            advanceToNext();
          }}
          aria-label="Next story zone"
        />

        {/* ── Media Content ── */}
        <div className="story-media-container">
          {mediaLoading && !mediaError && (
            <div style={{ position: 'absolute', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#ffffff', animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}

          {mediaError && (
            <div style={{ padding: 20, textAlign: 'center', color: '#ef4444' }}>
              <p style={{ fontSize: 16, fontWeight: 600 }}>Failed to load media</p>
              <button
                type="button"
                onClick={advanceToNext}
                style={{ padding: '6px 14px', borderRadius: 6, background: '#374151', color: '#fff', border: 'none', cursor: 'pointer', marginTop: 8 }}
              >
                Skip Story
              </button>
            </div>
          )}

          {/* Photo / Image Story */}
          {isImageStory && (
            <img
              src={activeStory.mediaUrl}
              alt={activeStory.caption || 'Story photo'}
              className="story-media-image"
              onLoad={() => setMediaLoading(false)}
              onError={() => {
                setMediaLoading(false);
                setMediaError(true);
              }}
            />
          )}

          {/* Video Story */}
          {isVideoStory && (
            <video
              ref={videoRef}
              src={activeStory.mediaUrl}
              className="story-media-video"
              autoPlay
              playsInline
              muted={isMuted}
              onLoadedData={() => setMediaLoading(false)}
              onError={() => {
                setMediaLoading(false);
                setMediaError(true);
              }}
              onEnded={advanceToNext}
            />
          )}

          {/* Text Story */}
          {isTextStory && (
            <div
              className="story-text-container"
              style={{
                background: activeStory.textConfig?.background || 'linear-gradient(135deg, #6366f1, #a855f7)',
                justifyContent:
                  activeStory.textConfig?.textAlign === 'left'
                    ? 'flex-start'
                    : activeStory.textConfig?.textAlign === 'right'
                    ? 'flex-end'
                    : 'center'
              }}
            >
              <span
                className="story-text-content"
                style={{
                  color: activeStory.textConfig?.textColor || '#ffffff',
                  textAlign: activeStory.textConfig?.textAlign || 'center'
                }}
              >
                {activeStory.textConfig?.text}
              </span>
            </div>
          )}
        </div>

        {/* ── Caption Overlay ── */}
        {activeStory.caption && (
          <div className="story-caption-bar">
            {activeStory.caption}
          </div>
        )}

        {/* ── Viewers Count Button (Owner Only) ── */}
        {isMe && (
          <button
            type="button"
            className="story-viewers-bar"
            onClick={(e) => {
              e.stopPropagation();
              setShowViewersDrawer(!showViewersDrawer);
            }}
          >
            <span>👁</span>
            <span>{viewsCount} views</span>
          </button>
        )}

        {/* ── Viewers Drawer ── */}
        {showViewersDrawer && (
          <div className="story-viewers-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff' }}>
                Viewed by ({viewsCount})
              </h4>
              <button
                type="button"
                className="story-icon-btn"
                style={{ width: 26, height: 26, fontSize: 12 }}
                onClick={() => setShowViewersDrawer(false)}
              >
                ✕
              </button>
            </div>

            {(!viewersList || viewersList.length === 0) ? (
              <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', margin: '20px 0' }}>
                No views yet
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {viewersList.map((v, i) => {
                  const viewer = v.user || {};
                  return (
                    <div key={viewer._id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <UserAvatar
                          src={viewer.avatar}
                          name={viewer.fullName || viewer.username || 'User'}
                          size={32}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                          {viewer.fullName || viewer.username}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {formatStoryTime(v.viewedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop Next Chevron */}
      {userIndex < userGroups.length - 1 && (
        <button
          type="button"
          className="story-desktop-chevron story-desktop-chevron-right"
          onClick={advanceToNext}
          aria-label="Next story"
        >
          ›
        </button>
      )}

      {/* Story Privacy Modal */}
      {showPrivacyModal && activeStory && (
        <StoryPrivacySelector
          isOpen={showPrivacyModal}
          onClose={() => {
            setShowPrivacyModal(false);
            setIsPaused(false);
          }}
          initialPrivacy={{
            visibility: activeStory.visibility || 'friends',
            allowedViewers: activeStory.allowedViewers || [],
            excludedViewers: activeStory.excludedViewers || []
          }}
          onSave={async (updatedPrivacy) => {
            await storyService.updateStoryPrivacy(activeStory._id, updatedPrivacy);
            activeStory.visibility = updatedPrivacy.visibility;
            activeStory.allowedViewers = updatedPrivacy.allowedViewers;
            activeStory.excludedViewers = updatedPrivacy.excludedViewers;
          }}
          title="Edit Status Privacy"
        />
      )}
    </div>
  );
}

StoryViewer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  initialUserGroupIndex: PropTypes.number,
  userGroups: PropTypes.array,
  currentUserId: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onStoryDeleted: PropTypes.func
};
