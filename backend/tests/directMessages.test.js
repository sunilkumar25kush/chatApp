const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const BACKEND_DIR = path.join(__dirname, '..');
const Conversation = require('../models/Conversation');
const DirectMessage = require('../models/DirectMessage');
const Friendship = require('../models/Friendship');
const User = require('../models/User');

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
});

after(async () => {
  await mongoose.disconnect();
});

test('Conversation Model: enforces single canonical conversation per pair', async () => {
  const u1 = new mongoose.Types.ObjectId();
  const u2 = new mongoose.Types.ObjectId();

  const pairKey1 = Conversation.makePairKey(u1, u2);
  const pairKey2 = Conversation.makePairKey(u2, u1);
  assert.equal(pairKey1, pairKey2);

  const conv1 = await Conversation.create({
    pairKey: pairKey1,
    participants: [u1, u2]
  });
  assert.ok(conv1._id);

  // Attempt duplicate creation with reverse participant order
  const conv2 = new Conversation({
    pairKey: pairKey2,
    participants: [u2, u1]
  });

  await assert.rejects(
    async () => {
      await conv2.save();
    },
    (err) => err.code === 11000,
    'MongoDB unique index on pairKey must reject duplicate direct conversation'
  );

  // Clean up
  await Conversation.deleteOne({ _id: conv1._id });
});

test('DirectMessage Model: persists message with timestamps and indexes', async () => {
  const convId = new mongoose.Types.ObjectId();
  const senderId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();

  const dm = await DirectMessage.create({
    conversation: convId,
    sender: senderId,
    recipient: recipientId,
    content: 'Hello, this is a private test message',
    clientMsgId: 'client_msg_' + Date.now()
  });

  assert.ok(dm._id);
  assert.equal(dm.content, 'Hello, this is a private test message');
  assert.equal(dm.isRead, false);
  assert.equal(dm.isDelivered, true);
  assert.ok(dm.createdAt);

  // Clean up
  await DirectMessage.deleteOne({ _id: dm._id });
});

