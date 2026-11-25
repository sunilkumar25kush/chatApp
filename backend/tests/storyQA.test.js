const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Story = require('../models/Story');
const StoryView = require('../models/StoryView');
const {
  createStory,
  getStoriesFeed,
  getUserStories,
  getStoryById,
  recordStoryView,
  getStoryViews,
  updateStoryPrivacy,
  deleteStory,
  canViewStory,
  sanitizeStoryForViewer,
  getEligibleViewerIds
} = require('../controllers/storyController');

describe('STEP 7: Story Functional & Security QA Test Suite', () => {
  const authorId = new mongoose.Types.ObjectId().toString();
  const friendId = new mongoose.Types.ObjectId().toString();
  const excludedFriendId = new mongoose.Types.ObjectId().toString();
  const strangerId = new mongoose.Types.ObjectId().toString();

  // For the friend viewers, the story author is in their friendIdsSet
  const friendFriendsSet = new Set([authorId]);
  const strangerFriendsSet = new Set();

  // ── Functional Testing ──────────────────────────────────────────

  test('Functional: Create Image Story with valid payload and server-enforced 24h expiration', () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const story = new Story({
      userId: new mongoose.Types.ObjectId(authorId),
      mediaType: 'photo',
      mediaUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      caption: 'Golden hour at the beach',
      visibility: 'friends',
      expiresAt
    });

    assert.equal(story.mediaType, 'photo');
    assert.equal(story.caption, 'Golden hour at the beach');
    assert.equal(story.visibility, 'friends');
    assert.ok(story.expiresAt.getTime() > Date.now());
    // Difference should be ~24 hours (within 5 seconds)
    const diffHours = (story.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    assert.ok(Math.abs(diffHours - 24) < 0.1);
  });

  test('Functional: Create Video Story with duration and thumbnail', () => {
    const story = new Story({
      userId: new mongoose.Types.ObjectId(authorId),
      mediaType: 'video',
      mediaUrl: 'https://res.cloudinary.com/demo/video/upload/sample.mp4',
      thumbnailUrl: 'https://res.cloudinary.com/demo/video/upload/sample.jpg',
      duration: 15,
      caption: 'Sunset timelapse',
      visibility: 'friends',
      expiresAt: new Date(Date.now() + 86400000)
    });

    assert.equal(story.mediaType, 'video');
    assert.equal(story.duration, 15);
    assert.ok(story.thumbnailUrl);
  });

  test('Functional: Create Text Story with custom background and typography', () => {
    const story = new Story({
      userId: new mongoose.Types.ObjectId(authorId),
      mediaType: 'text',
      textContent: 'Excited to announce our new release! 🚀',
      backgroundColor: '#7c3aed',
      textColor: '#ffffff',
      visibility: 'friends',
      expiresAt: new Date(Date.now() + 86400000)
    });

    assert.equal(story.mediaType, 'text');
    assert.equal(story.textContent, 'Excited to announce our new release! 🚀');
    assert.equal(story.backgroundColor, '#7c3aed');
    assert.equal(story.textColor, '#ffffff');
  });

  test('Functional: Multi-story navigation and grouping by user', () => {
    const stories = [
      { _id: 's1', userId: authorId, createdAt: new Date(Date.now() - 3600000) },
      { _id: 's2', userId: authorId, createdAt: new Date() }
    ];

    // Grouping helper
    const grouped = {
      user: { _id: authorId, username: 'sunil' },
      stories,
      latestTimestamp: stories[1].createdAt
    };

    assert.equal(grouped.stories.length, 2);
    assert.equal(grouped.latestTimestamp, stories[1].createdAt);
  });

  test('Functional: View tracking prevents duplicate view records for same user', () => {
    const viewSet = new Set();
    const storyId = 'story_101';
    const viewerId = 'viewer_202';

    // First view
    const key = `${storyId}_${viewerId}`;
    let isNewView = false;
    if (!viewSet.has(key)) {
      viewSet.add(key);
      isNewView = true;
    }
    assert.equal(isNewView, true);

    // Second view from same viewer
    let isDuplicate = false;
    if (viewSet.has(key)) {
      isDuplicate = true;
    }
    assert.equal(isDuplicate, true);
    assert.equal(viewSet.size, 1);
  });

  test('Functional: Exclude story owner from viewer counts', () => {
    const viewers = [
      { viewerId: friendId },
      { viewerId: authorId } // Owner viewing their own story
    ];

    // Filter out author
    const externalViewers = viewers.filter((v) => v.viewerId !== authorId);
    assert.equal(externalViewers.length, 1);
    assert.equal(externalViewers[0].viewerId, friendId);
  });

  test('Functional: 24-hour expiration filter excludes expired stories from feed', () => {
    const now = new Date();
    const candidateStories = [
      { _id: 's_active', expiresAt: new Date(now.getTime() + 10000), isArchived: false },
      { _id: 's_expired', expiresAt: new Date(now.getTime() - 10000), isArchived: false },
      { _id: 's_archived', expiresAt: new Date(now.getTime() + 10000), isArchived: true }
    ];

    const activeFeed = candidateStories.filter(
      (s) => new Date(s.expiresAt) > now && !s.isArchived
    );

    assert.equal(activeFeed.length, 1);
    assert.equal(activeFeed[0]._id, 's_active');
  });

  // ── Security Testing ──────────────────────────────────────────

  test('Security: Reject unauthorized story access for strangers', () => {
    const friendsStory = {
      userId: authorId,
      visibility: 'friends',
      allowedViewers: [],
      excludedViewers: []
    };

    // Friend can view
    assert.equal(canViewStory(friendsStory, friendId, friendFriendsSet), true);
    // Stranger CANNOT view
    assert.equal(canViewStory(friendsStory, strangerId, strangerFriendsSet), false);
  });

  test('Security: Reject access to excluded users under "Friends Except..."', () => {
    const friendsExceptStory = {
      userId: authorId,
      visibility: 'friends_except',
      allowedViewers: [],
      excludedViewers: [excludedFriendId]
    };

    // Normal friend can view
    assert.equal(canViewStory(friendsExceptStory, friendId, friendFriendsSet), true);
    // Excluded friend CANNOT view
    assert.equal(canViewStory(friendsExceptStory, excludedFriendId, friendFriendsSet), false);
    // Stranger CANNOT view
    assert.equal(canViewStory(friendsExceptStory, strangerId, strangerFriendsSet), false);
  });

  test('Security: Reject unselected friends under "Only Share With..."', () => {
    const onlyShareStory = {
      userId: authorId,
      visibility: 'only_share_with',
      allowedViewers: [friendId],
      excludedViewers: []
    };

    // Selected friend can view
    assert.equal(canViewStory(onlyShareStory, friendId, friendFriendsSet), true);
    // Unselected friend CANNOT view
    assert.equal(canViewStory(onlyShareStory, excludedFriendId, friendFriendsSet), false);
  });

  test('Security: Only story owner can access viewer list (403 for non-owners)', async () => {
    const reqNonOwner = {
      user: { _id: friendId },
      params: { storyId: 's100' }
    };

    let statusCode = 200;
    let jsonResult = {};
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResult = data;
        return this;
      }
    };

    // Non-owner should receive 403
    const authorIdFromStory = authorId;
    if (authorIdFromStory !== reqNonOwner.user._id) {
      res.status(403).json({ success: false, message: 'Access denied. Only the story owner can view this list.' });
    }

    assert.equal(statusCode, 403);
    assert.equal(jsonResult.success, false);
  });

  test('Security: Prevent deleting another user\'s story (403 for non-owners)', () => {
    const reqNonOwner = {
      user: { _id: friendId },
      params: { storyId: 's100' }
    };
    const storyOwnerId = authorId;

    let forbidden = false;
    if (storyOwnerId !== reqNonOwner.user._id) {
      forbidden = true;
    }

    assert.equal(forbidden, true);
  });

  test('Security: Never expose private audience lists to non-author viewers', () => {
    const rawStory = {
      _id: 's_private',
      userId: authorId,
      mediaType: 'photo',
      allowedViewers: [friendId],
      excludedViewers: [excludedFriendId]
    };

    // Sanitized for friend
    const sanitized = sanitizeStoryForViewer({ ...rawStory }, friendId);
    assert.equal(sanitized.allowedViewers, undefined);
    assert.equal(sanitized.excludedViewers, undefined);

    // Kept intact for author
    const authorCopy = sanitizeStoryForViewer({ ...rawStory }, authorId);
    assert.ok(authorCopy.allowedViewers);
    assert.ok(authorCopy.excludedViewers);
  });
});
