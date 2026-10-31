const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const BACKEND_DIR = path.join(__dirname, '..');
const RoomJoinRequest = require('../models/RoomJoinRequest');
const Room = require('../models/Room');

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
  await RoomJoinRequest.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
});

test('RoomJoinRequest Model: enforces at most one pending request per user-room pair', async () => {
  const roomId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  const req1 = await RoomJoinRequest.create({
    room: roomId,
    user: userId,
    status: 'pending'
  });
  assert.ok(req1._id);
  assert.equal(req1.status, 'pending');

  // Attempt duplicate creation while req1 is pending -> must reject with code 11000
  await assert.rejects(
    async () => {
      await RoomJoinRequest.create({
        room: roomId,
        user: userId,
        status: 'pending'
      });
    },
    (err) => err && (err.code === 11000 || /duplicate/i.test(err.message))
  );

  // If req1 is cancelled, a new pending request can now be created
  req1.status = 'cancelled';
  await req1.save();

  const req2 = await RoomJoinRequest.create({
    room: roomId,
    user: userId,
    status: 'pending'
  });
  assert.ok(req2._id);
  assert.equal(req2.status, 'pending');

  // Clean up
  await RoomJoinRequest.deleteMany({ room: roomId, user: userId });
});

test('RoomJoinRequest Model: atomic membership update prevents duplicate member records', async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const requesterId = new mongoose.Types.ObjectId();

  const room = await Room.create({
    name: 'Atomic Test Room',
    code: 'ROOM-ATOM',
    owner: ownerId,
    visibility: 'private',
    isPrivate: true,
    members: [ownerId]
  });

  // Concurrency test: simulate two concurrent approvals calling $addToSet simultaneously
  await Promise.all([
    Room.updateOne({ _id: room._id }, { $addToSet: { members: requesterId } }),
    Room.updateOne({ _id: room._id }, { $addToSet: { members: requesterId } })
  ]);

  const updatedRoom = await Room.findById(room._id);
  const requesterOccurrences = updatedRoom.members.filter(
    (m) => m.toString() === requesterId.toString()
  );

  // Must have exactly 1 occurrence in members list
  assert.equal(requesterOccurrences.length, 1);

  // Clean up
  await Room.deleteOne({ _id: room._id });
});

