/**
 * Centralized Room Access Control and Authorization Utilities
 */

const normalizeId = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val._id) return val._id.toString();
  if (val.id) return val.id.toString();
  if (typeof val.toString === 'function') return val.toString();
  return String(val);
};

/**
 * Determine if a room is private
 * @param {Object} room
 * @returns {boolean}
 */
const isPrivateRoom = (room) => {
  if (!room) return false;
  return room.visibility === 'private' || Boolean(room.isPrivate);
};

/**
 * Check if the user is the owner of the room
 * @param {Object} room
 * @param {string|Object} userId
 * @returns {boolean}
 */
const isRoomOwner = (room, userId) => {
  if (!room || !userId) return false;
  const uid = normalizeId(userId);
  const ownerId = normalizeId(room.owner);
  return uid === ownerId;
};

/**
 * Check if the user is an admin or owner of the room
 * @param {Object} room
 * @param {string|Object} userId
 * @returns {boolean}
 */
const isRoomAdmin = (room, userId) => {
  if (!room || !userId) return false;
  if (isRoomOwner(room, userId)) return true;
  const uid = normalizeId(userId);
  const admins = Array.isArray(room.admins) ? room.admins.map(normalizeId) : [];
  return admins.includes(uid);
};

/**
 * Check if the user is an authorized member (or owner/admin) of the room
 * @param {Object} room
 * @param {string|Object} userId
 * @returns {boolean}
 */
const isRoomMember = (room, userId) => {
  if (!room || !userId) return false;
  if (isRoomOwner(room, userId)) return true;
  const uid = normalizeId(userId);
  const admins = Array.isArray(room.admins) ? room.admins.map(normalizeId) : [];
  if (admins.includes(uid)) return true;
  const members = Array.isArray(room.members) ? room.members.map(normalizeId) : [];
  return members.includes(uid);
};

/**
 * Centralized permission checker for room access
 * @param {Object} room
 * @param {string|Object} userId
 * @returns {{ allowed: boolean, status?: number, code?: string, reason?: string, isOwner?: boolean, isAdmin?: boolean, isMember?: boolean }}
 */
const checkRoomAccess = (room, userId) => {
  if (!room || room.isDeleted) {
    return {
      allowed: false,
      status: 404,
      code: 'ROOM_NOT_FOUND',
      reason: 'Room not found'
    };
  }

  const uid = normalizeId(userId);
  const owner = isRoomOwner(room, uid);
  const admin = isRoomAdmin(room, uid);
  const member = isRoomMember(room, uid);

  if (!isPrivateRoom(room)) {
    return {
      allowed: true,
      isOwner: owner,
      isAdmin: admin,
      isMember: member
    };
  }

  // Private room access check
  if (member || admin || owner) {
    return {
      allowed: true,
      isOwner: owner,
      isAdmin: admin,
      isMember: true
    };
  }

  return {
    allowed: false,
    status: 403,
    code: 'ROOM_ACCESS_DENIED',
    reason: 'This room is private. You are not an authorized member.'
  };
};

module.exports = {
  normalizeId,
  isPrivateRoom,
  isRoomOwner,
  isRoomAdmin,
  isRoomMember,
  checkRoomAccess
};

