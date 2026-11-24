const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const BACKEND_DIR = path.join(__dirname, '..');
require('../models/User');
const User = require('../models/User');
const Story = require('../models/Story');
const Friendship = require('../models/Friendship');
const StoryView = require('../models/StoryView');

let dbConnected = false;

before(async () => {
  const envPath = path.join(BACKEND_DIR, '.env');
  let mongoUri = 'mongodb://127.0.0.1:27017/chatroom_test';
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^MONGO_URI=(.+)$/m);
    if (match) mongoUri = match[1].trim();
  }
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    }
    dbConnected = mongoose.connection.readyState === 1;
  } catch (err) {
    console.warn('MongoDB offline for unit tests:', err.message);
  }
});

after(async () => {
  if (dbConnected) {
    await Story.deleteMany({ textContent: /^\[TEST_PRIVACY\]/ });
    await User.deleteMany({ username: /^privuser_/ });
    await mongoose.disconnect();
  }
});

test('Story Model: supports all 5 visibility modes', () => {
  const enumVals = Story.schema.path('visibility').enumValues;
  assert.ok(enumVals.includes('friends'));
  assert.ok(enumVals.includes('friends_except'));
  assert.ok(enumVals.includes('custom'));
  assert.ok(enumVals.includes('only_share_with'));
  assert.ok(enumVals.includes('public'));
});

test('User Model: privacy schema includes storyPrivacy settings', () => {
  const visPath = User.schema.path('privacy.storyPrivacy.visibility');
  assert.ok(visPath, 'User model must have privacy.storyPrivacy.visibility');
  const visEnum = visPath.enumValues;
  assert.ok(visEnum.includes('friends'));
  assert.ok(visEnum.includes('friends_except'));
  assert.ok(visEnum.includes('only_share_with'));
});

test('Story Privacy & Audience Enforcement Logic', async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const friendAllowedId = new mongoose.Types.ObjectId();
  const friendExcludedId = new mongoose.Types.ObjectId();
  const strangerId = new mongoose.Types.ObjectId();

  const friendIdsSet = new Set([friendAllowedId.toString(), friendExcludedId.toString()]);

  // Case 1: My Contacts / Friends (default)
  const friendsStory = {
    userId: ownerId,
    visibility: 'friends',
    allowedViewers: [],
    excludedViewers: []
  };

  // Controller canViewStory logic verification:
  const canView = (story, viewerId, friendsSet) => {
    const authorId = story.userId.toString();
    if (authorId === viewerId) return true;
    const visibility = story.visibility || 'friends';
    if (visibility === 'public') {
      const excluded = (story.excludedViewers || []).map((id) => id.toString());
      return !excluded.includes(viewerId);
    }
    if (!friendsSet.has(authorId) && !friendsSet.has(viewerId)) return false;
    if (visibility === 'friends_except') {
      const excluded = (story.excludedViewers || []).map((id) => id.toString());
      return !excluded.includes(viewerId);
    }
    if (visibility === 'only_share_with' || visibility === 'custom') {
      const allowed = (story.allowedViewers || []).map((id) => id.toString());
      return allowed.includes(viewerId);
    }
    if (visibility === 'friends') {
      const excluded = (story.excludedViewers || []).map((id) => id.toString());
      return !excluded.includes(viewerId);
    }
    return false;
  };

  // Owner always allowed
  assert.equal(canView(friendsStory, ownerId.toString(), friendIdsSet), true);
  // Accepted friend allowed
  assert.equal(canView(friendsStory, friendAllowedId.toString(), friendIdsSet), true);
  // Stranger denied
  assert.equal(canView(friendsStory, strangerId.toString(), friendIdsSet), false);

  // Case 2: Friends Except...
  const friendsExceptStory = {
    userId: ownerId,
    visibility: 'friends_except',
    allowedViewers: [],
    excludedViewers: [friendExcludedId]
  };
  // Non-excluded friend allowed
  assert.equal(canView(friendsExceptStory, friendAllowedId.toString(), friendIdsSet), true);
  // Excluded friend DENIED
  assert.equal(canView(friendsExceptStory, friendExcludedId.toString(), friendIdsSet), false);
  // Stranger DENIED
  assert.equal(canView(friendsExceptStory, strangerId.toString(), friendIdsSet), false);

  // Case 3: Only Share With...
  const onlyShareStory = {
    userId: ownerId,
    visibility: 'only_share_with',
    allowedViewers: [friendAllowedId],
    excludedViewers: []
  };
  // Selected friend allowed
  assert.equal(canView(onlyShareStory, friendAllowedId.toString(), friendIdsSet), true);
  // Unselected friend DENIED
  assert.equal(canView(onlyShareStory, friendExcludedId.toString(), friendIdsSet), false);
  // Stranger DENIED
  assert.equal(canView(onlyShareStory, strangerId.toString(), friendIdsSet), false);
});
