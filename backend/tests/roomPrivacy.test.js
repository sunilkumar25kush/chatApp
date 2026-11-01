const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Room = require('../models/Room');
const {
  isPrivateRoom,
  isRoomOwner,
  isRoomAdmin,
  isRoomMember,
  checkRoomAccess
} = require('../utils/roomAccess');

test('Room Model: hydrates legacy document with isPrivate: true and asserts it remains private', async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const legacyRoom = Room.hydrate({
    _id: new mongoose.Types.ObjectId(),
    name: 'Legacy Private Room',
    code: 'ROOM-LEGACY',
    owner: ownerId,
    isPrivate: true
  });
  await legacyRoom.validate();
  assert.equal(legacyRoom.isPrivate, true);
  assert.equal(legacyRoom.visibility, 'private');
});

test('Room Model: synchronizes visibility and isPrivate bidirectionally', async () => {
  const ownerId = new mongoose.Types.ObjectId();

  // 1. Create with visibility: 'private' -> isPrivate should be true
  const room1 = new Room({
    name: 'Private Room 1',
    code: 'ROOM-PRV1',
    owner: ownerId,
    visibility: 'private'
  });
  await room1.validate();
  assert.equal(room1.visibility, 'private');
  assert.equal(room1.isPrivate, true);

  // 2. Create with isPrivate: false -> visibility should be 'public'
  const room2 = new Room({
    name: 'Public Room 2',
    code: 'ROOM-PUB2',
    owner: ownerId,
    isPrivate: false
  });
  await room2.validate();
  assert.equal(room2.visibility, 'public');
  assert.equal(room2.isPrivate, false);

  // 3. Create with isPrivate: true -> visibility should be 'private'
  const room3 = new Room({
    name: 'Private Room 3',
    code: 'ROOM-PRV3',
    owner: ownerId,
    isPrivate: true
  });
  await room3.validate();
  assert.equal(room3.visibility, 'private');
  assert.equal(room3.isPrivate, true);

  // 4. Default should be 'public' / isPrivate: false
  const room4 = new Room({
    name: 'Default Room 4',
    code: 'ROOM-DEF4',
    owner: ownerId
  });
  await room4.validate();
  assert.equal(room4.visibility, 'public');
  assert.equal(room4.isPrivate, false);
});

test('roomAccess: correctly evaluates public vs private room permissions', () => {
  const ownerId = new mongoose.Types.ObjectId().toString();
  const adminId = new mongoose.Types.ObjectId().toString();
  const memberId = new mongoose.Types.ObjectId().toString();
  const strangerId = new mongoose.Types.ObjectId().toString();

  const publicRoom = {
    _id: 'room_pub',
    name: 'Public Chat',
    visibility: 'public',
    isPrivate: false,
    owner: ownerId,
    admins: [adminId],
    members: [ownerId, adminId, memberId]
  };

  const privateRoom = {
    _id: 'room_priv',
    name: 'Private Secret Chat',
    visibility: 'private',
    isPrivate: true,
    owner: ownerId,
    admins: [adminId],
    members: [ownerId, adminId, memberId]
  };

  // Public room checks
  assert.equal(isPrivateRoom(publicRoom), false);
  const pubAccessOwner = checkRoomAccess(publicRoom, ownerId);
  assert.equal(pubAccessOwner.allowed, true);
  assert.equal(pubAccessOwner.isOwner, true);

  const pubAccessStranger = checkRoomAccess(publicRoom, strangerId);
  assert.equal(pubAccessStranger.allowed, true); // Anyone can access public room
  assert.equal(pubAccessStranger.isMember, false);

  // Private room checks
  assert.equal(isPrivateRoom(privateRoom), true);
  assert.equal(isRoomOwner(privateRoom, ownerId), true);
  assert.equal(isRoomOwner(privateRoom, strangerId), false);

  assert.equal(isRoomAdmin(privateRoom, adminId), true);
  assert.equal(isRoomAdmin(privateRoom, strangerId), false);

  assert.equal(isRoomMember(privateRoom, memberId), true);
  assert.equal(isRoomMember(privateRoom, strangerId), false);

  // Private room: owner allowed
  const privAccessOwner = checkRoomAccess(privateRoom, ownerId);
  assert.equal(privAccessOwner.allowed, true);

  // Private room: member allowed
  const privAccessMember = checkRoomAccess(privateRoom, memberId);
  assert.equal(privAccessMember.allowed, true);

  // Private room: stranger DENIED
  const privAccessStranger = checkRoomAccess(privateRoom, strangerId);
  assert.equal(privAccessStranger.allowed, false);
  assert.equal(privAccessStranger.status, 403);
  assert.equal(privAccessStranger.code, 'ROOM_ACCESS_DENIED');
});

