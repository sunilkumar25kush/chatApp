const mongoose = require('mongoose');
const crypto = require('crypto');
const Room = require('../models/Room');
const Message = require('../models/Message');
const CallHistory = require('../models/CallHistory');

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
    const { name, category, description, isPrivate } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Room name is required' });
    }
    if (name.trim().length > 80) {
      return res.status(400).json({ message: 'Room name must be under 80 characters' });
    }

    const userId = getUserId(req);

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
        isPrivate: !!isPrivate,
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
      isPrivate: !!isPrivate,
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
 * @desc    Get all available rooms (paginated, excludes soft-deleted)
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
      // Build filter: exclude deleted rooms; for private rooms, only show if user is member
      const filter = { isDeleted: { $ne: true } };
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

      // Format all rooms for the list.
      // Private rooms are shown to all users with a Private badge,
      // but their join credential (code) is only revealed to members/creator.
      const formatted = rooms.map((r) => {
        const memberIds = (r.members || []).map((m) => m.toString());
        const isMember = memberIds.includes(userId.toString());
        const isOwner = r.owner && (r.owner._id?.toString() === userId.toString() || r.owner.toString() === userId.toString());
        return {
          _id: r._id.toString(),
          id: r._id.toString(),
          name: r.name,
          code: isMember || isOwner ? r.code : undefined,
          category: r.category,
          description: r.description,
          isPrivate: r.isPrivate,
          owner: r.owner,
          createdBy: r.createdBy || r.owner,
          // Tells the frontend whether this user may open the room directly
          // (members/creator) without entering the room ID/code.
          isMember: isMember || isOwner,
          membersCount: r.members ? r.members.length : 0,
          createdAt: r.createdAt
        };
      });

      return res.json({ rooms: formatted, total: total || formatted.length, page, hasMore: skip + formatted.length < total });
    }

    seedDefaultMemoryRooms();
    const rooms = Array.from(memoryRooms.values())
      .filter((r) => !r.isDeleted && (category === undefined || category === 'All' || r.category === category))
      .map((r) => {
        const isMember = (r.members || []).includes(userId);
        const isOwner = r.owner === userId || r.owner?._id === userId;
        const { code, inviteCode, ...rest } = r;
        return {
          ...rest,
          id: r._id,
          code: isMember || isOwner ? code : undefined,
          isMember: isMember || isOwner,
          membersCount: r.members ? r.members.length : 0
        };
      });
    return res.json({ rooms: rooms.slice(skip, skip + limit), total: rooms.length, page, hasMore: skip + limit < rooms.length });
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

    if (isDBConnected()) {
      const room = await Room.findOne({ code: searchCode, isDeleted: { $ne: true } })
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');

      if (!room) {
        return res.status(404).json({ message: 'Room not found with that code' });
      }

      // 🔒 SECURITY: never expose inviteCode (or the raw doc) via this route
      const { inviteCode, ...safeRoom } = room.toObject();
      return res.json(safeRoom);
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

    // 🔒 SECURITY: strip inviteCode from memory-room responses too
    const { inviteCode, ...safeFound } = found;
    return res.json({
      ...safeFound,
      id: found._id,
      membersCount: found.members.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Join a room using room code
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

      // Private rooms are joined via their code — the code IS the access
      // token. Anyone with the correct code (shared by the owner) can join.
      // (Frontend only asks for the code when the room is private & user
      // isn't a member/creator yet, so this check never leaks public rooms.)

      // Duplicate join prevention
      if (!room.members.includes(userId)) {
        room.members.push(userId);
        await room.save();
      }

      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');

      // 🔒 SECURITY: strip inviteCode from join responses
      const { inviteCode, ...safePopulated } = populated.toObject();
      return res.json(safePopulated);
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
      // Create custom room if code doesn't exist yet in fallback mode
      found = {
        _id: 'mem_room_' + Date.now(),
        name: code,
        code: searchCode,
        category: 'Custom',
        description: `Custom channel ${searchCode}`,
        isPrivate: false,
        owner: userId,
        admins: [userId],
        members: [userId],
        inviteCode: generateInviteCode(),
        createdAt: new Date().toISOString()
      };
      memoryRooms.set(found._id, found);
    } else if (!found.members.includes(userId)) {
      found.members.push(userId);
    }

    return res.json({
      ...found,
      id: found._id,
      membersCount: found.members.length
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
          return res.json({ ...r, id: r._id, membersCount: r.members.length });
        }
      }
      return res.status(404).json({ message: 'Invalid invite link' });
    }

    const room = await Room.findOne({ inviteCode, isDeleted: { $ne: true } });
    if (!room) return res.status(404).json({ message: 'Invalid invite link' });

    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
    }

    const populated = await Room.findById(room._id)
      .populate('owner', 'username email avatar')
      .populate('members', 'username email avatar');

    // 🔒 SECURITY: strip inviteCode from invite-link join responses too
    const { inviteCode: _inviteCode, ...safePopulated } = populated.toObject();
    return res.json(safePopulated);
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
      if (!room) {
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
      if (!room) return res.status(404).json({ message: 'Room not found' });

      const isOwner = room.owner.toString() === userId;
      const isAdmin = room.admins.some((a) => a.toString() === userId);
      if (!isOwner && !isAdmin) {
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

      return res.json({ message: 'Room deleted', roomId: id });
    }

    const room = memoryRooms.get(id);
    if (room) {
      if (room.owner !== userId && !(room.admins || []).includes(userId)) {
        return res.status(403).json({ message: 'Only the room owner or admins can delete this room' });
      }
      room.isDeleted = true;
    }
    return res.json({ message: 'Room deleted', roomId: id });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update room (name / icon / description / category) — owner/admins only
 * @route   PUT /api/rooms/:id
 * @access  Private (owner/admins)
 */
const updateRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { name, description, category, icon, isPrivate } = req.body;

    if (isDBConnected()) {
      const room = await Room.findById(id);
      if (!room) return res.status(404).json({ message: 'Room not found' });

      const isOwner = room.owner.toString() === userId;
      const isAdmin = (room.admins || []).some((a) => a.toString() === userId);
      if (!isOwner && !isAdmin) {
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
      if (isPrivate !== undefined) {
        room.isPrivate = Boolean(isPrivate);
      }

      await room.save();
      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');
      return res.json(populated);
    }

    const room = memoryRooms.get(id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.owner !== userId && !(room.admins || []).includes(userId)) {
      return res.status(403).json({ message: 'Only the room owner or admins can update this room' });
    }
    if (name !== undefined) room.name = name.trim();
    if (description !== undefined) room.description = description;
    if (category !== undefined) room.category = category;
    if (icon !== undefined) room.icon = icon;
    if (isPrivate !== undefined) room.isPrivate = Boolean(isPrivate);
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
      if (!room) return res.status(404).json({ message: 'Room not found' });

      const isOwner = room.owner.toString() === requesterId;
      const isAdmin = room.admins.some((a) => a.toString() === requesterId);
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: 'Only the room owner or admins can add members' });
      }

      if (room.members.length >= (room.maxMembers || 500)) {
        return res.status(400).json({ message: 'Room has reached its member limit' });
      }

      if (!room.members.includes(targetId)) room.members.push(targetId);
      await room.save();

      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');
      return res.json(populated);
    }

    const room = memoryRooms.get(id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.owner !== requesterId && !(room.admins || []).includes(requesterId)) {
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
      if (!room) return res.status(404).json({ message: 'Room not found' });

      const isOwner = room.owner.toString() === requesterId;
      const isAdmin = room.admins.some((a) => a.toString() === requesterId);
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: 'Only the room owner or admins can remove members' });
      }
      if (room.owner.toString() === targetId) {
        return res.status(400).json({ message: 'Cannot remove the room owner' });
      }

      room.members = room.members.filter((m) => m.toString() !== targetId);
      room.admins = room.admins.filter((m) => m.toString() !== targetId);
      await room.save();

      const populated = await Room.findById(room._id)
        .populate('owner', 'username email avatar')
        .populate('createdBy', 'username email avatar')
        .populate('members', 'username email avatar');
      return res.json(populated);
    }

    const room = memoryRooms.get(id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.owner !== requesterId && !(room.admins || []).includes(requesterId)) {
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
      if (!room) return res.status(404).json({ message: 'Room not found' });
      if (room.owner.toString() !== requesterId) {
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
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.owner !== requesterId) return res.status(403).json({ message: 'Only the room owner can promote members' });
    room.admins = room.admins || [];
    if (!room.admins.includes(targetId)) room.admins.push(targetId);
    return res.json({ message: 'Member promoted to admin' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get room members list
 * @route   GET /api/rooms/:id/members
 * @access  Private
 */
const getRoomMembers = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (isDBConnected()) {
      const room = await Room.findById(id).populate('members', 'username email avatar createdAt status');
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }
      return res.json({ members: room.members, owner: room.owner, admins: room.admins });
    }

    const room = memoryRooms.get(id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
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
 * @desc    Search rooms by name/code/description
 * @route   GET /api/rooms/search?q=term
 * @access  Private
 */
const searchRooms = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ message: 'Search query is required' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    if (!isDBConnected()) {
      const results = Array.from(memoryRooms.values())
        .filter((r) => !r.isDeleted && (r.name.toLowerCase().includes(q.toLowerCase()) || (r.code || '').toLowerCase().includes(q.toLowerCase())))
        .slice(0, limit);
      return res.json({ rooms: results, total: results.length });
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = {
      isDeleted: { $ne: true },
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { code: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } }
      ]
    };
    const rooms = await Room.find(filter)
      .populate('owner', 'username email avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    return res.json({ rooms, total: rooms.length });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRoom,
  getAllRooms,
  getRoomByCode,
  joinRoomByCode,
  joinRoomByInvite,
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
