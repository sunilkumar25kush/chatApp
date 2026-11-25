const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  getEligibleViewerIds,
  canViewStory,
  sanitizeStoryForViewer
} = require('../controllers/storyController');

test('Story Realtime: getEligibleViewerIds calculates eligible audience correctly in memory mode', async () => {
  const authorId = new mongoose.Types.ObjectId().toString();
  const friend1Id = new mongoose.Types.ObjectId().toString();
  const friend2Id = new mongoose.Types.ObjectId().toString();
  const strangerId = new mongoose.Types.ObjectId().toString();

  // Populate memory friendships
  const { memoryFriendships } = require('../controllers/friendController');
  memoryFriendships.clear();

  memoryFriendships.set(`rel_${authorId}_${friend1Id}`, {
    _id: new mongoose.Types.ObjectId(),
    requester: authorId,
    recipient: friend1Id,
    status: 'accepted'
  });

  memoryFriendships.set(`rel_${authorId}_${friend2Id}`, {
    _id: new mongoose.Types.ObjectId(),
    requester: friend2Id,
    recipient: authorId,
    status: 'accepted'
  });

  // Stranger pending request - NOT accepted!
  memoryFriendships.set(`rel_${authorId}_${strangerId}`, {
    _id: new mongoose.Types.ObjectId(),
    requester: strangerId,
    recipient: authorId,
    status: 'pending'
  });

  // Case 1: friends visibility (default)
  const defaultStory = {
    userId: authorId,
    visibility: 'friends',
    allowedViewers: [],
    excludedViewers: []
  };
  const eligible1 = await getEligibleViewerIds(defaultStory, authorId);
  assert.equal(eligible1.length, 2);
  assert.ok(eligible1.includes(friend1Id));
  assert.ok(eligible1.includes(friend2Id));
  assert.ok(!eligible1.includes(strangerId), 'Pending friend must NOT be eligible');

  // Case 2: friends_except visibility
  const friendsExceptStory = {
    userId: authorId,
    visibility: 'friends_except',
    allowedViewers: [],
    excludedViewers: [friend2Id]
  };
  const eligible2 = await getEligibleViewerIds(friendsExceptStory, authorId);
  assert.equal(eligible2.length, 1);
  assert.ok(eligible2.includes(friend1Id));
  assert.ok(!eligible2.includes(friend2Id), 'Excluded friend must be filtered out');

  // Case 3: only_share_with visibility
  const onlyShareStory = {
    userId: authorId,
    visibility: 'only_share_with',
    allowedViewers: [friend2Id, strangerId],
    excludedViewers: []
  };
  const eligible3 = await getEligibleViewerIds(onlyShareStory, authorId);
  assert.equal(eligible3.length, 1);
  assert.ok(eligible3.includes(friend2Id), 'Selected friend must be eligible');
  assert.ok(!eligible3.includes(friend1Id), 'Unselected friend must NOT be eligible');
  assert.ok(!eligible3.includes(strangerId), 'Non-friend in allowed list must NOT be eligible');

  memoryFriendships.clear();
});

test('Story Realtime: sanitizeStoryForViewer strips private audience from non-authors', () => {
  const authorId = 'author_123';
  const viewerId = 'viewer_456';

  const storyWithAudience = {
    _id: 'story_789',
    userId: authorId,
    mediaType: 'photo',
    visibility: 'friends_except',
    allowedViewers: ['user_a'],
    excludedViewers: ['user_b', viewerId]
  };

  // Author sees everything
  const authorCopy = sanitizeStoryForViewer({ ...storyWithAudience }, authorId);
  assert.ok(authorCopy.allowedViewers);
  assert.ok(authorCopy.excludedViewers);

  // Viewer receives sanitized copy without private audience lists
  const viewerCopy = sanitizeStoryForViewer({ ...storyWithAudience }, viewerId);
  assert.equal(viewerCopy.allowedViewers, undefined, 'allowedViewers must be stripped for non-author');
  assert.equal(viewerCopy.excludedViewers, undefined, 'excludedViewers must be stripped for non-author');
  assert.equal(viewerCopy.visibility, 'friends_except');
  assert.equal(viewerCopy._id, 'story_789');
});
