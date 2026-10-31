const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const BACKEND_DIR = path.join(__dirname, '..');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { generatePublicId } = require('../utils/publicId');

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

test('Friendship Model: makePairKey is canonical and sort-invariant', () => {
  const id1 = new mongoose.Types.ObjectId();
  const id2 = new mongoose.Types.ObjectId();

  const pairKey1 = Friendship.makePairKey(id1, id2);
  const pairKey2 = Friendship.makePairKey(id2, id1);

  assert.equal(pairKey1, pairKey2, 'pairKey must be identical regardless of parameter order');
  assert.ok(pairKey1.includes('_'), 'pairKey must separate IDs with an underscore');
});

test('Friendship Model: rejects duplicate canonical relationship with code 11000', async () => {
  const stamp = Date.now();
  const user1 = await User.create({
    username: `fr_user1_${stamp}`,
    email: `fr_user1_${stamp}@test.com`,
    password: 'password123'
  });
  const user2 = await User.create({
    username: `fr_user2_${stamp}`,
    email: `fr_user2_${stamp}@test.com`,
    password: 'password123'
  });

  // User 1 requests User 2
  const fr1 = await Friendship.create({
    requester: user1._id,
    recipient: user2._id,
    status: 'pending'
  });
  assert.ok(fr1._id);
  assert.equal(fr1.pairKey, Friendship.makePairKey(user1._id, user2._id));

  // User 2 attempts to concurrently request User 1 (reverse order)
  const fr2 = new Friendship({
    requester: user2._id,
    recipient: user1._id,
    status: 'pending'
  });

  await assert.rejects(
    async () => {
      await fr2.save();
    },
    (err) => err.code === 11000,
    'Database unique index on pairKey must reject duplicate unordered relationship'
  );

  // Clean up test documents
  await Friendship.deleteOne({ _id: fr1._id });
  await User.deleteMany({ _id: { $in: [user1._id, user2._id] } });
});

