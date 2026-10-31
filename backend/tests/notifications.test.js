const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const http = require('http');

const BACKEND_DIR = path.join(__dirname, '..');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { createNotification } = require('../controllers/notificationController');

function testMongoUri() {
  const envPath = path.join(BACKEND_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^MONGO_URI=(.+)$/m);
    if (match) {
      return match[1].trim().replace(/\/([^/?]+)(\?|$)/, '/chatroom_test$2');
    }
  }
  return 'mongodb://localhost:27017/chatroom_test';
}

const MONGO_URI = testMongoUri();

before(async () => {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await Notification.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
});

test('Notification Model: persists notification and enforces partial dedupKey uniqueness', async () => {
  const userA = new mongoose.Types.ObjectId();
  const dedupKey = 'dedup_test_' + Date.now();

  const notif1 = await Notification.create({
    recipient: userA,
    type: 'friend_request',
    title: 'New Friend Request',
    message: 'User B sent you a friend request',
    link: { screen: 'friends', tab: 'pending' },
    dedupKey
  });

  assert.ok(notif1._id);
  assert.equal(notif1.isRead, false);
  assert.equal(notif1.type, 'friend_request');

  // Attempting duplicate with same recipient and dedupKey must fail with 11000
  await assert.rejects(
    async () => {
      await Notification.create({
        recipient: userA,
        type: 'friend_request',
        title: 'Duplicate',
        message: 'Duplicate msg',
        link: { screen: 'friends' },
        dedupKey
      });
    },
    (err) => err.code === 11000
  );

  // Different recipient with same dedupKey succeeds
  const userB = new mongoose.Types.ObjectId();
  const notif2 = await Notification.create({
    recipient: userB,
    type: 'friend_request',
    title: 'New Friend Request',
    message: 'Different recipient',
    link: { screen: 'friends' },
    dedupKey
  });

  assert.ok(notif2._id);
});

test('createNotification: gracefully handles duplicate dedupKey and returns existing record', async () => {
  const user = new mongoose.Types.ObjectId();
  const dedupKey = 'room_approval_unique_' + Date.now();

  const first = await createNotification({
    recipient: user,
    type: 'room_join_approved',
    title: 'Room Request Approved',
    message: 'Welcome to the room!',
    link: { screen: 'room', id: 'room123' },
    dedupKey
  });

  assert.ok(first);
  assert.equal(first.title, 'Room Request Approved');

  // Second call with same dedupKey returns the existing notification without error
  const second = await createNotification({
    recipient: user,
    type: 'room_join_approved',
    title: 'Room Request Approved',
    message: 'Welcome to the room!',
    link: { screen: 'room', id: 'room123' },
    dedupKey
  });

  assert.ok(second);
  assert.equal(second._id.toString(), first._id.toString());
});
