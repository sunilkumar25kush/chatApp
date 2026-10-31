const mongoose = require('mongoose');
const crypto = require('crypto');
const Room = require('../models/Room');
const Message = require('../models/Message');
const CallHistory = require('../models/CallHistory');
const {
  normalizeId,
  isPrivateRoom,
  isRoomOwner,
  isRoomAdmin,
  isRoomMember,
  checkRoomAccess
} = require('../utils/roomAccess');
const getSocketIO = () => {
  try {
    return require('../socket/socket').getIO();
  } catch {
    return null;
  }
};
const logger = require('../utils/logger');

// In-memory rooms fallback store
const memoryRooms = new Map();

/**
 * Check if MongoDB connection is active
 */
const isDBConnected = () => mongoose.connection.readyState === 1;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Generate a random 6-character room code (e.g. ROOM-8X2F)
 */
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let random = '';
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ROOM-${random}`;
};

const generateInviteCode = () => crypto.randomBytes(6).toString('base64url');

// Seed initial rooms in-memory if empty
const seedDefaultMemoryRooms = () => {
  if (memoryRooms.size === 0) {
    const defaults = [
      {
        _id: 'room_def_1',
        name: 'React Lounge',
        code: 'ROOM-REACT',
        category: 'Tech',
        description: 'Discuss React 18, Vite, Next.js, and frontend design architectures.',
        visibility: 'public',
        isPrivate: false,
        owner: 'system',
        admins: [],
        members: ['system'],
        createdAt: new Date().toISOString()
      },
      {
        _id: 'room_def_2',
        name: 'JavaScript Ninjas',
        code: 'ROOM-JS99',
        category: 'Tech',
        description: 'Async JS, Node.js backend patterns, Express, and performance tips.',
        visibility: 'public',
        isPrivate: false,
        owner: 'system',
        admins: [],
        members: ['system'],
        createdAt: new Date().toISOString()
      },
      {
        _id: 'room_def_3',
        name: 'Gaming Hub',
        code: 'ROOM-GAME',
        category: 'Gaming',
        description: 'Find squad mates, discuss PC & console gaming, and share highlights.',
        visibility: 'public',
        isPrivate: false,
        owner: 'system',
        admins: [],
        members: ['system'],
        createdAt: new Date().toISOString()
      },
      {
        _id: 'room_def_4',
        name: 'General Discussion',
        code: 'ROOM-GEN1',
        category: 'General',
        description: 'Casual conversations, daily check-ins, and community announcements.',
        visibility: 'public',
        isPrivate: false,
        owner: 'system',
        admins: [],
        members: ['system'],
        createdAt: new Date().toISOString()
      }
    ];

    defaults.forEach((r) => memoryRooms.set(r._id, r));
  }
};

seedDefaultMemoryRooms();

const getUserId = (req) => (req.user?._id ? req.user._id.toString() : req.user?.id);

/**
 * @desc    Create a new chat room
 * @route   POST /api/rooms
 * @access  Private
 */
const createRoom = async (req, res, next) => {
  try {
    const { name, category, description, isPrivate, visibility } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Room name is required' });
    }
    if (name.trim().length > 80) {
      return res.status(400).json({ message: 'Room name must be under 80 characters' });
    }

    const userId = getUserId(req);
    const resolvedVisibility = visibility ? visibility : (isPrivate ? 'private' : 'public');
    const resolvedIsPrivate = resolvedVisibility === 'private';

    if (isDBConnected()) {
      // Ensure unique room code (retry on collision)
      let roomCode = generateRoomCode();
      let attempts = 0;
      while (await Room.findOne({ code: roomCode })) {
        roomCode = generateRoomCode();
        if (++attempts > 5) break;
      }

      const room = await Room.create({
        name: name.trim(),
        code: roomCode,
        category: category || 'General',
        description: (description || '').slice(0, 300),
        visibility: resolvedVisibility,
        isPrivate: resolvedIsPrivate,
        owner: userId,
        createdBy: userId,
        admins: [userId],
        members: [userId],
        inviteCode: generateInviteCode()
      });

      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar')
        .populate('admins', 'username email avatar');

      return res.status(201).json(populated);
    }

    // In-memory fallback
    const roomId = 'mem_room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const roomObj = {
      _id: roomId,
      name: name.trim(),
      code: generateRoomCode(),
      category: category || 'General',
      description: description || '',
      visibility: resolvedVisibility,
      isPrivate: resolvedIsPrivate,
      owner: userId,
      createdBy: userId,
      createdByName: req.user?.username,
      admins: [userId],
      members: [userId],
      inviteCode: generateInviteCode(),
      createdAt: new Date().toISOString()
    };

    memoryRooms.set(roomId, roomObj);
    return res.status(201).json({
      ...roomObj,
      membersCount: 1
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all available rooms (paginated, excludes soft-deleted & hides private rooms from non-members)
 * @route   GET /api/rooms?page=1&limit=50&category=Tech
 * @access  Private
 */
const getAllRooms = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const category = req.query.category;
    const userId = getUserId(req);

    if (isDBConnected()) {
      // 🔒 SECURITY: Exclude soft-deleted rooms.
      // Private rooms are strictly hidden from non-members in public listings.
      const filter = {
        isDeleted: { $ne: true },
        $or: [
          { isPrivate: false, visibility: { $ne: 'private' } },
          { members: userId },
          { owner: userId },
          { admins: userId }
        ]
      };
      if (category && category !== 'All') filter.category = category;

      const [rooms, total] = await Promise.all([
        Room.find(filter)
          .populate('owner', 'username email avatar')
          .populate('createdBy', 'username email avatar')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Room.countDocuments(filter)
      ]);

      const formatted = rooms.map((r) => {
        const isMem = isRoomMember(r, userId);
        const isOwn = isRoomOwner(r, userId);
        const isPriv = isPrivateRoom(r);
        return {
          _id: r._id.toString(),
          id: r._id.toString(),
          name: r.name,
          // Only show room code if user has membership rights or if public
          code: isMem || isOwn || !isPriv ? r.code : undefined,
          category: r.category,
          description: r.description,
          visibility: r.visibility || (r.isPrivate ? 'private' : 'public'),
          isPrivate: isPriv,
          owner: r.owner,
          createdBy: r.createdBy || r.owner,
          isMember: isMem || isOwn,
          membersCount: r.members ? r.members.length : 0,
          createdAt: r.createdAt
        };
      });

      return res.json({ rooms: formatted, total: total || formatted.length, page, hasMore: skip + formatted.length < total });
    }

    seedDefaultMemoryRooms();
    const rooms = Array.from(memoryRooms.values())
      .filter((r) => !r.isDeleted && (category === undefined || category === 'All' || r.category === category))
      .filter((r) => {
        const isPriv = isPrivateRoom(r);
        if (!isPriv) return true;
        return isRoomMember(r, userId);
      })
      .map((r) => {
        const isMem = isRoomMember(r, userId);
        const isOwn = isRoomOwner(r, userId);
        const isPriv = isPrivateRoom(r);
        const { code, inviteCode, ...rest } = r;
        return {
          ...rest,
          id: r._id,
          visibility: r.visibility || (r.isPrivate ? 'private' : 'public'),
          isPrivate: isPriv,
          code: isMem || isOwn || !isPriv ? code : undefined,
          isMember: isMem || isOwn,
          membersCount: r.members ? r.members.length : 0
        };
      });
    return res.json({ rooms: rooms.slice(skip, skip + limit), total: rooms.length, page, hasMore: skip + limit < rooms.length });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get room details by ID (enforcing privacy)
 * @route   GET /api/rooms/:id
 * @access  Private
 */
const getRoomById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (isDBConnected()) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({ message: 'Invalid room id' });
      }

      const room = await Room.findOne({ _id: id, isDeleted: { $ne: true } })
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar')
        .populate('admins', 'username email avatar');

      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      const access = checkRoomAccess(room, userId);
      if (!access.allowed) {
        return res.status(access.status || 403).json({
          message: access.reason || 'This is a private room. You are not an authorized member.',
          code: access.code || 'ROOM_ACCESS_DENIED'
        });
      }

      const roomObj = room.toObject();
      const isOwnerOrAdmin = access.isOwner || access.isAdmin;
      if (!isOwnerOrAdmin) {
        delete roomObj.inviteCode;
      }
      return res.json({
        ...roomObj,
        visibility: roomObj.visibility || (roomObj.isPrivate ? 'private' : 'public')
      });
    }

    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const access = checkRoomAccess(room, userId);
    if (!access.allowed) {
      return res.status(access.status || 403).json({
        message: access.reason || 'This is a private room. You are not an authorized member.',
        code: access.code || 'ROOM_ACCESS_DENIED'
      });
    }

    const { inviteCode, ...safeRoom } = room;
    return res.json({
      ...safeRoom,
      id: room._id,
      visibility: room.visibility || (room.isPrivate ? 'private' : 'public'),
      membersCount: room.members ? room.members.length : 0
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get room by unique room code
 * @route   GET /api/rooms/code/:code
 * @access  Private
 */
const getRoomByCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const searchCode = code.toUpperCase().trim();
    const userId = getUserId(req);

    if (isDBConnected()) {
      const room = await Room.findOne({ code: searchCode, isDeleted: { $ne: true } })
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');

      if (!room) {
        return res.status(404).json({ message: 'Room not found with that code' });
      }

      // Check access if private room
      const access = checkRoomAccess(room, userId);
      if (!access.allowed) {
        return res.status(403).json({
          message: 'This room is private. Details cannot be viewed with code alone.',
          code: 'ROOM_ACCESS_DENIED'
        });
      }

      const { inviteCode, ...safeRoom } = room.toObject();
      return res.json({
        ...safeRoom,
        visibility: safeRoom.visibility || (safeRoom.isPrivate ? 'private' : 'public')
      });
    }

    seedDefaultMemoryRooms();
    let found = null;
    for (const r of memoryRooms.values()) {
      if (!r.isDeleted && (r.code.toUpperCase() === searchCode || r._id === code || r.name.toLowerCase() === code.toLowerCase())) {
        found = r;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ message: 'Room not found with that code' });
    }

    const access = checkRoomAccess(found, userId);
    if (!access.allowed) {
      return res.status(403).json({
        message: 'This room is private. Details cannot be viewed with code alone.',
        code: 'ROOM_ACCESS_DENIED'
      });
    }

    const { inviteCode, ...safeFound } = found;
    return res.json({
      ...safeFound,
      id: found._id,
      visibility: found.visibility || (found.isPrivate ? 'private' : 'public'),
      membersCount: found.members ? found.members.length : 0
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Join a room using room code (public rooms only; private rooms require invite)
 * @route   POST /api/rooms/join
 * @access  Private
 */
const joinRoomByCode = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ message: 'Room code is required' });
    }

    const inputCode = code.trim();
    const searchCode = inputCode.toUpperCase();
    const isValidFormat =
      /^ROOM-[A-Z0-9]{4}$/.test(searchCode) ||
      /^[A-Z0-9]{4,12}$/.test(searchCode) ||
      isValidObjectId(inputCode);

    if (!isValidFormat) {
      return res.status(400).json({ message: 'Invalid room code or ID format' });
    }

    const userId = getUserId(req);

    if (isDBConnected()) {
      let room = null;
      if (isValidObjectId(inputCode)) {
        room = await Room.findOne({ _id: inputCode, isDeleted: { $ne: true } });
      }
      if (!room) {
        room = await Room.findOne({ code: searchCode, isDeleted: { $ne: true } });
      }

      if (!room) {
        return res.status(404).json({ message: 'Invalid room code or ID' });
      }

      // 🔒 SECURITY: If the room is private, unauthorized non-members cannot join
      // via room code or room ID. Joining requires direct addition or invite link.
      if (isPrivateRoom(room)) {
        const isMember = isRoomMember(room, userId);
        if (!isMember) {
          return res.status(403).json({
            message: 'This room is private. Unauthorized joins using room code are not permitted. Please use an invitation link or ask the owner to add you.',
            code: 'ROOM_ACCESS_DENIED'
          });
        }
      }

      // Duplicate join prevention
      if (!room.members.some((m) => m.toString() === userId.toString())) {
        room.members.push(userId);
        await room.save();
      }

      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');

      const { inviteCode, ...safePopulated } = populated.toObject();
      return res.json({
        ...safePopulated,
        visibility: safePopulated.visibility || (safePopulated.isPrivate ? 'private' : 'public')
      });
    }

    seedDefaultMemoryRooms();
    let found = null;
    for (const r of memoryRooms.values()) {
      if (r.code.toUpperCase() === searchCode || r._id === code || r.name.toLowerCase() === code.toLowerCase()) {
        found = r;
        break;
      }
    }

    if (!found) {
      found = {
        _id: 'mem_room_' + Date.now(),
        name: code,
        code: searchCode,
        category: 'Custom',
        description: `Custom channel ${searchCode}`,
        visibility: 'public',
        isPrivate: false,
        owner: userId,
        admins: [userId],
        members: [userId],
        inviteCode: generateInviteCode(),
        createdAt: new Date().toISOString()
      };
      memoryRooms.set(found._id, found);
    } else {
      if (isPrivateRoom(found) && !isRoomMember(found, userId)) {
        return res.status(403).json({
          message: 'This room is private. Unauthorized joins using room code are not permitted.',
          code: 'ROOM_ACCESS_DENIED'
        });
      }
      if (!found.members.includes(userId)) {
        found.members.push(userId);
      }
    }

    return res.json({
      ...found,
      id: found._id,
      visibility: found.visibility || (found.isPrivate ? 'private' : 'public'),
      membersCount: found.members.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to evict non-members from a room's socket channel when made private
 */
const evictUnauthorizedSocketsFromRoom = async (room) => {
  const io = getSocketIO();
  if (!io) return;
  const roomIdStr = room._id ? room._id.toString() : room.id;
  try {
    const authorizedIds = new Set((room.members || []).map(normalizeId));
    if (room.owner) authorizedIds.add(normalizeId(room.owner));
    (room.admins || []).forEach((a) => authorizedIds.add(normalizeId(a)));

    const socketsInRoom = await io.in(roomIdStr).fetchSockets();
    for (const s of socketsInRoom) {
      const sockUserId = s.user ? normalizeId(s.user._id || s.user.id) : null;
      if (!sockUserId || !authorizedIds.has(sockUserId)) {
        logger.info(`[Room Visibility] Revoking access for socket ${s.id} (user: ${sockUserId}) from private room ${roomIdStr}`);
        s.leave(roomIdStr);
        s.roomId = null;
        s.emit('room_access_revoked', {
          roomId: roomIdStr,
          message: 'This room has been made private. You are no longer a member.'
        });
      }
    }
  } catch (socketErr) {
    logger.error(`[Room Visibility] Error evicting sockets: ${socketErr.message}`);
  }
};

/**
 * @desc    Convert room visibility between public and private (owner/admins only)
 * @route   PUT /api/rooms/:id/visibility (or PUT /api/rooms/:id/privacy)
 * @access  Private (owner/admins)
 */
const updateRoomVisibility = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { visibility, isPrivate } = req.body;

    let targetVisibility;
    if (visibility !== undefined) {
      if (!['public', 'private'].includes(visibility)) {
        return res.status(400).json({ message: 'Visibility must be either "public" or "private"' });
      }
      targetVisibility = visibility;
    } else if (isPrivate !== undefined) {
      targetVisibility = Boolean(isPrivate) ? 'private' : 'public';
    } else {
      return res.status(400).json({ message: 'Must provide "visibility" or "isPrivate"' });
    }

    const targetIsPrivate = targetVisibility === 'private';

    if (isDBConnected()) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({ message: 'Invalid room id' });
      }

      const room = await Room.findById(id);
      if (!room || room.isDeleted) {
        return res.status(404).json({ message: 'Room not found' });
      }

      // Authorization: owner or admins only
      if (!isRoomAdmin(room, userId)) {
        return res.status(403).json({
          message: 'Only the room owner or admins can change room visibility',
          code: 'FORBIDDEN'
        });
      }

      room.visibility = targetVisibility;
      room.isPrivate = targetIsPrivate;
      await room.save();

      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar')
        .populate('admins', 'username email avatar');

      // ── Socket.IO Real-Time Privacy Enforcement ──────────────────────
      const io = getSocketIO();
      if (io) {
        const roomIdStr = room._id.toString();

        if (targetIsPrivate) {
          await evictUnauthorizedSocketsFromRoom(room);
        }

        // Notify room members
        io.to(roomIdStr).emit('room_visibility_changed', {
          roomId: roomIdStr,
          visibility: targetVisibility,
          isPrivate: targetIsPrivate,
          name: room.name
        });

        // Broadcast to all clients so public room listings and tabs update in real time
        io.emit('room_updated', {
          _id: roomIdStr,
          id: roomIdStr,
          name: room.name,
          category: room.category,
          visibility: targetVisibility,
          isPrivate: targetIsPrivate
        });
      }

      const { inviteCode, ...safePopulated } = populated.toObject();
      return res.json({
        ...safePopulated,
        visibility: targetVisibility,
        isPrivate: targetIsPrivate
      });
    }

    // Memory fallback
    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!isRoomAdmin(room, userId)) {
      return res.status(403).json({
        message: 'Only the room owner or admins can change room visibility',
        code: 'FORBIDDEN'
      });
    }

    room.visibility = targetVisibility;
    room.isPrivate = targetIsPrivate;

    const io = getSocketIO();
    if (io) {
      io.to(id).emit('room_visibility_changed', {
        roomId: id,
        visibility: targetVisibility,
        isPrivate: targetIsPrivate,
        name: room.name
      });
      io.emit('room_updated', {
        _id: id,
        id: id,
        name: room.name,
        category: room.category,
        visibility: targetVisibility,
        isPrivate: targetIsPrivate
      });
    }

    const { inviteCode, ...safeRoom } = room;
    return res.json({
      ...safeRoom,
      id: room._id,
      visibility: targetVisibility,
      isPrivate: targetIsPrivate,
      membersCount: room.members ? room.members.length : 0
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Join a room via invite link code
 * @route   POST /api/rooms/invite/:inviteCode
 * @access  Private
 */
const joinRoomByInvite = async (req, res, next) => {
  try {
    const { inviteCode } = req.params;
    const userId = getUserId(req);

    if (!isDBConnected()) {
      for (const r of memoryRooms.values()) {
        if (r.inviteCode === inviteCode) {
          if (!r.members.includes(userId)) r.members.push(userId);
          return res.json({
            ...r,
            id: r._id,
            visibility: r.visibility || (r.isPrivate ? 'private' : 'public'),
            membersCount: r.members.length
          });
        }
      }
      return res.status(404).json({ message: 'Invalid invite link' });
    }

    const room = await Room.findOne({ inviteCode, isDeleted: { $ne: true } });
    if (!room) return res.status(404).json({ message: 'Invalid invite link' });

    if (!room.members.some((m) => m.toString() === userId.toString())) {
      room.members.push(userId);
      await room.save();
    }

    const populated = await Room.findById(room._id)
      .populate('owner', 'username email avatar')
      .populate('members', 'username email avatar');

    const { inviteCode: _inviteCode, ...safePopulated } = populated.toObject();
    return res.json({
      ...safePopulated,
      visibility: safePopulated.visibility || (safePopulated.isPrivate ? 'private' : 'public')
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Leave a room (owner → transfers ownership to first admin/member)
 * @route   POST /api/rooms/:id/leave
 * @access  Private
 */
const leaveRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (isDBConnected()) {
      const room = await Room.findById(id);
      if (!room || room.isDeleted) {
        return res.status(404).json({ message: 'Room not found' });
      }

      room.members = room.members.filter((m) => m.toString() !== userId);
      room.admins = room.admins.filter((m) => m.toString() !== userId);

      // If owner leaves, transfer ownership to the first remaining admin/member
      if (room.owner.toString() === userId) {
        const nextOwner = room.admins[0] || room.members[0];
        if (nextOwner) {
          room.owner = nextOwner;
          if (!room.admins.includes(nextOwner)) room.admins.push(nextOwner);
        }
      }

      await room.save();

      // Evict user socket from room and broadcast member update
      const io = getSocketIO();
      if (io) {
        try {
          const socketsInRoom = await io.in(id.toString()).fetchSockets();
          for (const s of socketsInRoom) {
            const sockUserId = s.user ? normalizeId(s.user._id || s.user.id) : null;
            if (sockUserId === normalizeId(userId)) {
              s.leave(id.toString());
              s.roomId = null;
              s.emit('room_access_revoked', {
                roomId: id.toString(),
                message: 'You have left the room.'
              });
            }
          }
          io.to(id.toString()).emit('user_left', { roomId: id, userId });
        } catch (e) {
          logger.error(`[leaveRoom] Socket eviction error: ${e.message}`);
        }
      }

      return res.json({ message: 'Successfully left room', roomId: id });
    }

    const room = memoryRooms.get(id);
    if (room) {
      room.members = room.members.filter((m) => m !== userId);
      room.admins = (room.admins || []).filter((m) => m !== userId);
      if (room.owner === userId && room.members[0]) {
        room.owner = room.members[0];
        if (!room.admins.includes(room.owner)) room.admins.push(room.owner);
      }
      const io = getSocketIO();
      if (io) {
        try {
          const socketsInRoom = await io.in(id.toString()).fetchSockets();
          for (const s of socketsInRoom) {
            const sockUserId = s.user ? normalizeId(s.user._id || s.user.id) : null;
            if (sockUserId === normalizeId(userId)) {
              s.leave(id.toString());
              s.roomId = null;
            }
          }
          io.to(id.toString()).emit('user_left', { roomId: id, userId });
        } catch (e) {}
      }
    }
    return res.json({ message: 'Successfully left room', roomId: id });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete room (owner/admin only) — hard-cascades messages & call history
 * @route   DELETE /api/rooms/:id
 * @access  Private (owner/admins)
 */
const deleteRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (isDBConnected()) {
      const room = await Room.findById(id);
      if (!room || room.isDeleted) return res.status(404).json({ message: 'Room not found' });

      if (!isRoomAdmin(room, userId)) {
        return res.status(403).json({ message: 'Only the room owner or admins can delete this room' });
      }

      // Soft-delete the room (keeps FK integrity), hard-delete its messages
      room.isDeleted = true;
      room.deletedAt = new Date();
      room.name = `${room.name} (deleted)`;
      await room.save();

      await Promise.all([
        Message.deleteMany({ room: id }),
        CallHistory.deleteMany({ room: id })
      ]);

      const io = getSocketIO();
      if (io) {
        try {
          const socketsInRoom = await io.in(id.toString()).fetchSockets();
          for (const s of socketsInRoom) {
            s.leave(id.toString());
            s.roomId = null;
            s.emit('room_access_revoked', {
              roomId: id.toString(),
              message: 'This room has been deleted.'
            });
          }
          io.emit('room_deleted', { roomId: id });
        } catch (e) {
          logger.error(`[deleteRoom] Socket eviction error: ${e.message}`);
        }
      }

      return res.json({ message: 'Room deleted', roomId: id });
    }

    const room = memoryRooms.get(id);
    if (room) {
      if (!isRoomAdmin(room, userId)) {
        return res.status(403).json({ message: 'Only the room owner or admins can delete this room' });
      }
      room.isDeleted = true;
      const io = getSocketIO();
      if (io) {
        try {
          const socketsInRoom = await io.in(id.toString()).fetchSockets();
          for (const s of socketsInRoom) {
            s.leave(id.toString());
            s.roomId = null;
          }
          io.emit('room_deleted', { roomId: id });
        } catch (e) {}
      }
    }
    return res.json({ message: 'Room deleted', roomId: id });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update room (name / icon / description / category / privacy) — owner/admins only
 * @route   PUT /api/rooms/:id
 * @access  Private (owner/admins)
 */
const updateRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { name, description, category, icon, isPrivate, visibility } = req.body;

    if (isDBConnected()) {
      const room = await Room.findById(id);
      if (!room || room.isDeleted) return res.status(404).json({ message: 'Room not found' });

      if (!isRoomAdmin(room, userId)) {
        return res.status(403).json({ message: 'Only the room owner or admins can update this room' });
      }

      if (name !== undefined) {
        if (!name.trim()) return res.status(400).json({ message: 'Room name is required' });
        room.name = name.trim().slice(0, 80);
      }
      if (description !== undefined) room.description = String(description).slice(0, 300);
      if (category !== undefined && ['General', 'Tech', 'Gaming', 'Music', 'Random', 'Custom'].includes(category)) {
        room.category = category;
      }
      if (icon !== undefined) room.icon = String(icon).slice(0, 500);
      if (visibility !== undefined) {
        room.visibility = visibility;
        room.isPrivate = visibility === 'private';
      } else if (isPrivate !== undefined) {
        room.isPrivate = Boolean(isPrivate);
        room.visibility = room.isPrivate ? 'private' : 'public';
      }

      await room.save();

      if (visibility !== undefined || isPrivate !== undefined) {
        if (room.isPrivate) {
          await evictUnauthorizedSocketsFromRoom(room);
        }
        const io = getSocketIO();
        if (io) {
          const roomIdStr = room._id.toString();
          io.to(roomIdStr).emit('room_visibility_changed', {
            roomId: roomIdStr,
            visibility: room.visibility,
            isPrivate: room.isPrivate,
            name: room.name
          });
          io.emit('room_updated', {
            _id: roomIdStr,
            id: roomIdStr,
            name: room.name,
            category: room.category,
            visibility: room.visibility,
            isPrivate: room.isPrivate
          });
        }
      }

      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');
      return res.json(populated);
    }

    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) return res.status(404).json({ message: 'Room not found' });
    if (!isRoomAdmin(room, userId)) {
      return res.status(403).json({ message: 'Only the room owner or admins can update this room' });
    }
    if (name !== undefined) room.name = name.trim();
    if (description !== undefined) room.description = description;
    if (category !== undefined) room.category = category;
    if (icon !== undefined) room.icon = icon;
    if (visibility !== undefined) {
      room.visibility = visibility;
      room.isPrivate = visibility === 'private';
    } else if (isPrivate !== undefined) {
      room.isPrivate = Boolean(isPrivate);
      room.visibility = room.isPrivate ? 'private' : 'public';
    }
    return res.json({ ...room, id: room._id, membersCount: room.members.length });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add member to room (admin can invite by userId)
 * @route   POST /api/rooms/:id/members
 * @access  Private (owner/admins)
 */
const addMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId: targetId } = req.body;
    const requesterId = getUserId(req);

    if (!isValidObjectId(targetId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    if (isDBConnected()) {
      const room = await Room.findById(id);
      if (!room || room.isDeleted) return res.status(404).json({ message: 'Room not found' });

      if (!isRoomAdmin(room, requesterId)) {
        return res.status(403).json({ message: 'Only the room owner or admins can add members' });
      }

      if (room.members.length >= (room.maxMembers || 500)) {
        return res.status(400).json({ message: 'Room has reached its member limit' });
      }

      if (!room.members.some((m) => m.toString() === targetId.toString())) {
        room.members.push(targetId);
      }
      await room.save();

      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');
      return res.json(populated);
    }

    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) return res.status(404).json({ message: 'Room not found' });
    if (!isRoomAdmin(room, requesterId)) {
      return res.status(403).json({ message: 'Only the room owner or admins can add members' });
    }
    if (!room.members.includes(targetId)) room.members.push(targetId);
    return res.json({ ...room, id: room._id, membersCount: room.members.length });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove member from room (owner/admins; admins can't remove owner)
 * @route   DELETE /api/rooms/:id/members/:userId
 * @access  Private (owner/admins)
 */
const removeMember = async (req, res, next) => {
  try {
    const { id, userId: targetId } = req.params;
    const requesterId = getUserId(req);

    if (isDBConnected()) {
      const room = await Room.findById(id);
      if (!room || room.isDeleted) return res.status(404).json({ message: 'Room not found' });

      if (!isRoomAdmin(room, requesterId)) {
        return res.status(403).json({ message: 'Only the room owner or admins can remove members' });
      }
      if (room.owner.toString() === targetId) {
        return res.status(400).json({ message: 'Cannot remove the room owner' });
      }

      room.members = room.members.filter((m) => m.toString() !== targetId);
      room.admins = room.admins.filter((m) => m.toString() !== targetId);
      await room.save();

      // If room is private, evict socket if currently connected
      if (isPrivateRoom(room)) {
        const io = getSocketIO();
        if (io) {
          io.in(id.toString()).fetchSockets().then((sockets) => {
            sockets.forEach((s) => {
              const sockUserId = s.user ? normalizeId(s.user._id || s.user.id) : null;
              if (sockUserId === targetId) {
                s.leave(id.toString());
                s.roomId = null;
                s.emit('room_access_revoked', {
                  roomId: id.toString(),
                  message: 'You have been removed from this private room.'
                });
              }
            });
          }).catch((e) => logger.error(`[RemoveMember Eviction] ${e.message}`));
        }
      }

      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');
      return res.json(populated);
    }

    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) return res.status(404).json({ message: 'Room not found' });
    if (!isRoomAdmin(room, requesterId)) {
      return res.status(403).json({ message: 'Only the room owner or admins can remove members' });
    }
    if (room.owner === targetId) return res.status(400).json({ message: 'Cannot remove the room owner' });
    room.members = room.members.filter((m) => m !== targetId);
    room.admins = (room.admins || []).filter((m) => m !== targetId);
    return res.json({ ...room, id: room._id, membersCount: room.members.length });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Promote a member to admin (owner only)
 * @route   POST /api/rooms/:id/admins
 * @access  Private (owner)
 */
const promoteMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId: targetId } = req.body;
    const requesterId = getUserId(req);

    if (isDBConnected()) {
      const room = await Room.findById(id);
      if (!room || room.isDeleted) return res.status(404).json({ message: 'Room not found' });
      if (!isRoomOwner(room, requesterId)) {
        return res.status(403).json({ message: 'Only the room owner can promote members' });
      }
      if (!room.members.some((m) => m.toString() === targetId)) {
        return res.status(400).json({ message: 'User is not a member of this room' });
      }
      if (!room.admins.some((a) => a.toString() === targetId)) room.admins.push(targetId);
      await room.save();
      return res.json({ message: 'Member promoted to admin' });
    }

    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) return res.status(404).json({ message: 'Room not found' });
    if (!isRoomOwner(room, requesterId)) return res.status(403).json({ message: 'Only the room owner can promote members' });
    room.admins = room.admins || [];
    if (!room.admins.includes(targetId)) room.admins.push(targetId);
    return res.json({ message: 'Member promoted to admin' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get room members list (enforcing privacy)
 * @route   GET /api/rooms/:id/members
 * @access  Private
 */
const getRoomMembers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (isDBConnected()) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({ message: 'Invalid room id' });
      }
      const room = await Room.findById(id).populate('members', 'username email avatar createdAt status');
      if (!room || room.isDeleted) {
        return res.status(404).json({ message: 'Room not found' });
      }

      const access = checkRoomAccess(room, userId);
      if (!access.allowed) {
        return res.status(access.status || 403).json({
          message: access.reason || 'This is a private room. You are not an authorized member.',
          code: access.code || 'ROOM_ACCESS_DENIED'
        });
      }

      return res.json({ members: room.members, owner: room.owner, admins: room.admins });
    }

    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const access = checkRoomAccess(room, userId);
    if (!access.allowed) {
      return res.status(access.status || 403).json({
        message: access.reason || 'This is a private room. You are not an authorized member.',
        code: access.code || 'ROOM_ACCESS_DENIED'
      });
    }

    const membersList = room.members.map((mId) => ({
      _id: mId,
      username: mId === req.user._id || mId === req.user.id ? req.user.username : 'Chat Member',
      email: mId === req.user._id || mId === req.user.id ? req.user.email : 'member@chatroom.com',
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${mId}`
    }));

    return res.json({ members: membersList, owner: room.owner, admins: room.admins || [] });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Search rooms by name/code/description (hides private rooms from non-members)
 * @route   GET /api/rooms/search?q=term
 * @access  Private
 */
const searchRooms = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ message: 'Search query is required' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const userId = getUserId(req);

    if (!isDBConnected()) {
      const results = Array.from(memoryRooms.values())
        .filter((r) => !r.isDeleted && (r.name.toLowerCase().includes(q.toLowerCase()) || (r.code || '').toLowerCase().includes(q.toLowerCase())))
        .filter((r) => !isPrivateRoom(r) || isRoomMember(r, userId))
        .slice(0, limit);
      return res.json({ rooms: results, total: results.length });
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = {
      isDeleted: { $ne: true },
      $and: [
        {
          $or: [
            { isPrivate: false, visibility: { $ne: 'private' } },
            { members: userId },
            { owner: userId },
            { admins: userId }
          ]
        },
        {
          $or: [
            { name: { $regex: escaped, $options: 'i' } },
            { code: { $regex: escaped, $options: 'i' } },
            { description: { $regex: escaped, $options: 'i' } }
          ]
        }
      ]
    };
    const [rooms, total] = await Promise.all([
      Room.find(filter)
        .populate('owner', 'username email avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Room.countDocuments(filter)
    ]);
    return res.json({ rooms, total });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRoom,
  getAllRooms,
  getRoomById,
  getRoomByCode,
  joinRoomByCode,
  joinRoomByInvite,
  updateRoomVisibility,
  leaveRoom,
  deleteRoom,
  updateRoom,
  addMember,
  removeMember,
  promoteMember,
  getRoomMembers,
  searchRooms,
  memoryRooms
};
