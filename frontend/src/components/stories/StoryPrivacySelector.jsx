import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import UserAvatar from '../common/UserAvatar';
import friendService from '../../services/friendService';
import storyService from '../../services/storyService';
import { toast } from '../../utils/toast';
import './stories.css';

/**
 * StoryPrivacySelector
 * Modal / dialog for selecting story audience:
 * 1. My Contacts / Friends (all accepted friends)
 * 2. Friends Except... (exclude specific friends)
 * 3. Only Share With... (allow specific friends)
 */
export default function StoryPrivacySelector({
  isOpen,
  onClose,
  initialPrivacy,
  onSave,
  title = 'Status Privacy',
  isDefaultSetting = false
}) {
  const [visibility, setVisibility] = useState('friends');
  const [excludedViewers, setExcludedViewers] = useState([]);
  const [allowedViewers, setAllowedViewers] = useState([]);
  const [setAsDefault, setSetAsDefault] = useState(false);

  // Friends roster state
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialize privacy from props or default
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    if (initialPrivacy) {
      let vis = initialPrivacy.visibility || 'friends';
      if (vis === 'custom') vis = 'only_share_with';
      setVisibility(vis);

      const normExcluded = (initialPrivacy.excludedViewers || []).map((u) =>
        typeof u === 'string' ? u : (u._id || u.id)
      ).filter(Boolean);
      const normAllowed = (initialPrivacy.allowedViewers || []).map((u) =>
        typeof u === 'string' ? u : (u._id || u.id)
      ).filter(Boolean);

      setExcludedViewers(normExcluded);
      setAllowedViewers(normAllowed);
    } else {
      // Fetch default privacy from backend
      storyService.getDefaultPrivacy()
        .then((res) => {
          if (isCancelled) return;
          if (res?.storyPrivacy) {
            let vis = res.storyPrivacy.visibility || 'friends';
            if (vis === 'custom') vis = 'only_share_with';
            setVisibility(vis);
            setExcludedViewers((res.storyPrivacy.excludedViewers || []).map((u) => u._id || u));
            setAllowedViewers((res.storyPrivacy.allowedViewers || []).map((u) => u._id || u));
          }
        })
        .catch(() => {
          if (!isCancelled) setVisibility('friends');
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, initialPrivacy]);

  // Load accepted friends list
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingFriends(true);

    friendService.getFriends()
      .then((res) => {
        if (!isMounted) return;
        const list = (res.friends || []).map((item) => item.friend || item);
        setFriends(list);
      })
      .catch((err) => {
        console.error('Failed to load friends for privacy selector:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingFriends(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Filter friends by search query
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const q = searchQuery.toLowerCase().trim();
    return friends.filter((f) => {
      const name = (f.fullName || '').toLowerCase();
      const username = (f.username || '').toLowerCase();
      const pubId = (f.publicId || '').toLowerCase();
      return name.includes(q) || username.includes(q) || pubId.includes(q);
    });
  }, [friends, searchQuery]);

  if (!isOpen) return null;

  // Toggle user in excluded list
  const toggleExcluded = (userId) => {
    setExcludedViewers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Toggle user in allowed list
  const toggleAllowed = (userId) => {
    setAllowedViewers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Bulk select / deselect
  const handleSelectAll = () => {
    const allIds = friends.map((f) => f._id || f.id);
    if (visibility === 'friends_except') {
      setExcludedViewers(allIds);
    } else if (visibility === 'only_share_with') {
      setAllowedViewers(allIds);
    }
  };

  const handleClearAll = () => {
    if (visibility === 'friends_except') {
      setExcludedViewers([]);
    } else if (visibility === 'only_share_with') {
      setAllowedViewers([]);
    }
  };

  // Handle Save
  const handleSave = async () => {
    setSaving(true);
    try {
      const privacyPayload = {
        visibility: visibility === 'only_share_with' ? 'only_share_with' : visibility,
        allowedViewers: visibility === 'only_share_with' ? allowedViewers : [],
        excludedViewers: visibility === 'friends_except' ? excludedViewers : []
      };

      if (onSave) {
        await onSave(privacyPayload);
      }

      // If user checked "Set as default for future stories", save to account settings
      if (setAsDefault && !isDefaultSetting) {
        try {
          await storyService.updateDefaultPrivacy(privacyPayload);
        } catch (e) {
          console.warn('Could not update default story privacy:', e);
        }
      }

      toast.success('Privacy settings updated');
      onClose();
    } catch (err) {
      console.error('Failed to save story privacy:', err);
      toast.error(err.response?.data?.message || 'Failed to update privacy settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="create-status-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      style={{ zIndex: 3200 }}
    >
      <div
        className="create-status-modal story-privacy-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="create-status-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
          <div>
            <h3 className="create-status-title" style={{ fontSize: 18, margin: 0 }}>{title}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted, #9ca3af)' }}>
              Who can see your status updates
            </p>
          </div>
          <button
            type="button"
            className="create-status-close-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Options Radios */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Option 1: My Contacts / Friends */}
            <div
              data-testid="option-friends"
              role="button"
              tabIndex={0}
              className={`story-privacy-option-card ${visibility === 'friends' ? 'active' : ''}`}
              onClick={() => setVisibility('friends')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                borderRadius: 12,
                cursor: 'pointer',
                background: visibility === 'friends' ? 'rgba(240, 136, 44, 0.12)' : 'var(--bg-input, rgba(255,255,255,0.04))',
                border: visibility === 'friends' ? '1.5px solid var(--theme-primary, #F0882C)' : '1px solid var(--border-color, rgba(255,255,255,0.08))',
                transition: 'all 0.15s ease'
              }}
            >
              <input
                type="radio"
                name="story_visibility"
                data-testid="radio-friends"
                checked={visibility === 'friends'}
                onChange={() => setVisibility('friends')}
                style={{ accentColor: 'var(--theme-primary, #F0882C)', width: 18, height: 18, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-main, #f3f4f6)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>👥</span>
                  <span>My Contacts / Friends</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>
                  All accepted friends can see your status updates
                </div>
              </div>
            </div>

            {/* Option 2: Friends Except... */}
            <div
              data-testid="option-friends-except"
              role="button"
              tabIndex={0}
              className={`story-privacy-option-card ${visibility === 'friends_except' ? 'active' : ''}`}
              onClick={() => setVisibility('friends_except')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                borderRadius: 12,
                cursor: 'pointer',
                background: visibility === 'friends_except' ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-input, rgba(255,255,255,0.04))',
                border: visibility === 'friends_except' ? '1.5px solid #ef4444' : '1px solid var(--border-color, rgba(255,255,255,0.08))',
                transition: 'all 0.15s ease'
              }}
            >
              <input
                type="radio"
                name="story_visibility"
                data-testid="radio-friends-except"
                checked={visibility === 'friends_except'}
                onChange={() => setVisibility('friends_except')}
                style={{ accentColor: '#ef4444', width: 18, height: 18, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-main, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🚫</span>
                    <span>Friends Except...</span>
                  </div>
                  {excludedViewers.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                      {excludedViewers.length} excluded
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>
                  Share with all friends except people you select
                </div>
              </div>
            </div>

            {/* Option 3: Only Share With... */}
            <div
              data-testid="option-only-share-with"
              role="button"
              tabIndex={0}
              className={`story-privacy-option-card ${visibility === 'only_share_with' ? 'active' : ''}`}
              onClick={() => setVisibility('only_share_with')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                borderRadius: 12,
                cursor: 'pointer',
                background: visibility === 'only_share_with' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-input, rgba(255,255,255,0.04))',
                border: visibility === 'only_share_with' ? '1.5px solid #10b981' : '1px solid var(--border-color, rgba(255,255,255,0.08))',
                transition: 'all 0.15s ease'
              }}
            >
              <input
                type="radio"
                name="story_visibility"
                data-testid="radio-only-share-with"
                checked={visibility === 'only_share_with'}
                onChange={() => setVisibility('only_share_with')}
                style={{ accentColor: '#10b981', width: 18, height: 18, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-main, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⭐</span>
                    <span>Only Share With...</span>
                  </div>
                  {allowedViewers.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                      {allowedViewers.length} selected
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>
                  Only selected friends can view your status
                </div>
              </div>
            </div>
          </div>

          {/* Audience Multi-Select List (when Option 2 or Option 3 selected) */}
          {(visibility === 'friends_except' || visibility === 'only_share_with') && (
            <div
              style={{
                marginTop: 6,
                background: 'var(--bg-card, rgba(0,0,0,0.2))',
                border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              {/* Audience list header & search */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main, #fff)' }}>
                  {visibility === 'friends_except' ? 'Select Friends to Exclude' : 'Select Friends to Include'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    style={{ fontSize: 11, fontWeight: 600, background: 'none', border: 'none', color: 'var(--theme-primary, #F0882C)', cursor: 'pointer', padding: 0 }}
                  >
                    Select All
                  </button>
                  <span style={{ color: 'var(--text-muted, #6b7280)', fontSize: 11 }}>•</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    style={{ fontSize: 11, fontWeight: 600, background: 'none', border: 'none', color: 'var(--text-muted, #9ca3af)', cursor: 'pointer', padding: 0 }}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Search Friends Input */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search friends by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-input, rgba(255,255,255,0.06))',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                    color: 'var(--text-main, #fff)',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted, #9ca3af)',
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Friends Scrollable List */}
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
                {loadingFriends ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted, #9ca3af)', fontSize: 13 }}>
                    Loading friends...
                  </div>
                ) : filteredFriends.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted, #9ca3af)', fontSize: 13 }}>
                    {searchQuery ? 'No matching friends found' : 'No friends found. Add friends to manage audience.'}
                  </div>
                ) : (
                  filteredFriends.map((friend) => {
                    const fId = friend._id || friend.id;
                    const isSelected = visibility === 'friends_except'
                      ? excludedViewers.includes(fId)
                      : allowedViewers.includes(fId);

                    return (
                      <div
                        key={fId}
                        onClick={() => {
                          if (visibility === 'friends_except') toggleExcluded(fId);
                          else toggleAllowed(fId);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          background: isSelected
                            ? (visibility === 'friends_except' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)')
                            : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <UserAvatar
                            src={friend.avatar}
                            name={friend.fullName || friend.username}
                            size={34}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main, #fff)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {friend.fullName || friend.username}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>
                              @{friend.username}
                            </div>
                          </div>
                        </div>

                        {/* Custom Round Checkbox */}
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            border: isSelected
                              ? (visibility === 'friends_except' ? '2px solid #ef4444' : '2px solid #10b981')
                              : '2px solid var(--border-color, rgba(255,255,255,0.3))',
                            background: isSelected
                              ? (visibility === 'friends_except' ? '#ef4444' : '#10b981')
                              : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            fontSize: 12,
                            fontWeight: 700,
                            flexShrink: 0,
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {isSelected && '✓'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Option to set as default for future stories */}
          {!isDefaultSetting && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-main, #e5e7eb)', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                style={{ accentColor: 'var(--theme-primary, #F0882C)', width: 16, height: 16, cursor: 'pointer' }}
              />
              <span>Set as default for future status updates</span>
            </label>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="create-status-btn create-status-btn-secondary"
            style={{ padding: '8px 16px', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="create-status-btn create-status-btn-primary"
            style={{ padding: '8px 20px', fontSize: 13, minWidth: 100 }}
          >
            {saving ? 'Saving...' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}

StoryPrivacySelector.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  initialPrivacy: PropTypes.shape({
    visibility: PropTypes.string,
    allowedViewers: PropTypes.array,
    excludedViewers: PropTypes.array
  }),
  onSave: PropTypes.func,
  title: PropTypes.string,
  isDefaultSetting: PropTypes.bool
};
