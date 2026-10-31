const mongoose = require('mongoose');
const Message = require('../models/Message');
const Room = require('../models/Room');
const { checkRoomAccess } = require('../utils/roomAccess');
const { memoryRooms } = require('./roomController');

// In-memory fallback message store
const memoryMessages = new Map();

/**
 * Check if MongoDB connection is active
 */
const isDBConnected = () => mongoose.connection.readyState === 1;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const getUserId = (req) => (req.user?._id ? req.user._id.toString() : req.user?.id?.toString());

/**
 * Seed initial sample messages for fallback mode
 */
const seedMemoryMessages = (roomId) => {
  const roomMsgs = Array.from(memoryMessages.values()).filter((m) => m.room === roomId);
  if (roomMsgs.length === 0) {
    const defaultMsg = {
      _id: 'msg_welcome_' + roomId,
      room: roomId,
      sender: {
        _id: 'system_user',
        username: 'ChatRoom Bot',
        email: 'bot@chatroom.com',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatBot'
      },
      content: 'Welcome to this room! Send a message to start real-time chatting.',
      replyTo: null,
      readBy: [],
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString()
    };
    memoryMessages.set(defaultMsg._id, defaultMsg);
  }
};

/**
 * @desc    Get historical messages for a room (paginated, enforcing privacy)
 * @route   GET /api/messages/:roomId?page=1&limit=50
 * @access  Private
 */
const getRoomMessages = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const userId = getUserId(req);

    if (!isValidObjectId(roomId) && !roomId.startsWith('mem_room_')) {
      return res.status(400).json({ message: 'Invalid room id' });
    }

    // Clamp pagination values (performance + abuse protection)
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    if (isDBConnected() && isValidObjectId(roomId) && !roomId.startsWith('mem_room_')) {
      const room = await Room.findById(roomId);
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

      const [messages, total] = await Promise.all([
        Message.find({ room: roomId })
          .populate('sender', 'username email avatar customStatus')
          .populate({
            path: 'replyTo',
            populate: { path: 'sender', select: 'username' }
          })
          .populate('reactions.users', 'username avatar')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Message.countDocuments({ room: roomId })
      ]);

      return res.json({
        messages: messages.reverse(),
        page,
        limit,
        total,
        hasMore: skip + messages.length < total
      });
    }

    const memRoom = memoryRooms.get(roomId);
    if (memRoom) {
      const access = checkRoomAccess(memRoom, userId);
      if (!access.allowed) {
        return res.status(access.status || 403).json({
          message: access.reason || 'This is a private room. You are not an authorized member.',
          code: access.code || 'ROOM_ACCESS_DENIED'
        });
      }
    }

    seedMemoryMessages(roomId);
    const allMsgs = Array.from(memoryMessages.values())
      .filter((m) => m.room === roomId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const paginatedMsgs = allMsgs.slice(skip, skip + limit).reverse();
    return res.json({
      messages: paginatedMsgs,
      page,
      limit,
      total: allMsgs.length,
      hasMore: skip + paginatedMsgs.length < allMsgs.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Search messages inside a room (enforcing privacy)
 * @route   GET /api/messages/:roomId/search?q=term&page=1&limit=30
 * @access  Private
 */
const searchRoomMessages = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const userId = getUserId(req);
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ message: 'Search query is required' });
    if (q.length < 2) return res.status(400).json({ message: 'Search query must be at least 2 characters' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 30));
    const skip = (page - 1) * limit;

    if (!isDBConnected() || !isValidObjectId(roomId) || roomId.startsWith('mem_room_')) {
      const memRoom = memoryRooms.get(roomId);
      if (memRoom) {
        const access = checkRoomAccess(memRoom, userId);
        if (!access.allowed) {
          return res.status(access.status || 403).json({
            message: access.reason || 'This is a private room. You are not an authorized member.',
            code: access.code || 'ROOM_ACCESS_DENIED'
          });
        }
      }

      const results = Array.from(memoryMessages.values())
        .filter((m) => m.room === roomId && !m.isDeleted && m.content && m.content.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json({
        messages: results.slice(skip, skip + limit),
        total: results.length,
        page,
        hasMore: skip + limit < results.length
      });
    }

    const room = await Room.findById(roomId);
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

    // Prefer regex (with escaped term) over text index for partial-match UX
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const [messages, total] = await Promise.all([
      Message.find({ room: roomId, isDeleted: false, content: { $regex: escaped, $options: 'i' } })
        .populate('sender', 'username email avatar')
        .populate('reactions.users', 'username avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ room: roomId, isDeleted: false, content: { $regex: escaped, $options: 'i' } })
    ]);

    return res.json({ messages, total, page, hasMore: skip + messages.length < total });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark messages in a room as read (enforcing privacy)
 * @route   POST /api/messages/:roomId/read
 * @access  Private
 */
const markMessagesAsRead = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const userId = getUserId(req);

    if (!isValidObjectId(roomId) && !roomId.startsWith('mem_room_')) {
      return res.status(400).json({ message: 'Invalid room id' });
    }

    if (isDBConnected() && isValidObjectId(roomId) && !roomId.startsWith('mem_room_')) {
      const room = await Room.findById(roomId);
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

      await Message.updateMany(
        { room: roomId, readBy: { $ne: userId } },
        { $addToSet: { readBy: userId } }
      );
      return res.json({ message: 'Messages marked as read' });
    }

    const memRoom = memoryRooms.get(roomId);
    if (memRoom) {
      const access = checkRoomAccess(memRoom, userId);
      if (!access.allowed) {
        return res.status(access.status || 403).json({
          message: access.reason || 'This is a private room. You are not an authorized member.',
          code: access.code || 'ROOM_ACCESS_DENIED'
        });
      }
    }

    for (const msg of memoryMessages.values()) {
      if (msg.room === roomId && !msg.readBy.includes(userId)) {
        msg.readBy.push(userId);
      }
    }
    return res.json({ message: 'Messages marked as read' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Star (bookmark) or unstar a message for the current user
 * @route   POST /api/messages/:messageId/star
 * @access  Private
 */
const toggleStarMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = getUserId(req);

    if (!isValidObjectId(messageId) && !messageId.startsWith('mem_msg_')) {
      return res.status(400).json({ message: 'Invalid message id' });
    }

    if (!isDBConnected()) {
      const msg = memoryMessages.get(messageId);
      if (!msg) return res.status(404).json({ message: 'Message not found' });
      msg.starredBy = msg.starredBy || [];
      const idx = msg.starredBy.indexOf(userId);
      if (idx > -1) msg.starredBy.splice(idx, 1);
      else msg.starredBy.push(userId);
      return res.json({ starred: idx === -1 });
    }

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    const idx = msg.starredBy.indexOf(userId);
    if (idx > -1) msg.starredBy.splice(idx, 1);
    else msg.starredBy.push(userId);
    await msg.save();

    return res.json({ starred: idx === -1 });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    "Delete for me" — hides the message for this user only
 * @route   POST /api/messages/:messageId/delete-for-me
 * @access  Private
 */
const deleteForMe = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = getUserId(req);

    if (!isValidObjectId(messageId) && !messageId.startsWith('mem_msg_')) {
      return res.status(400).json({ message: 'Invalid message id' });
    }

    if (!isDBConnected()) {
      const msg = memoryMessages.get(messageId);
      if (!msg) return res.status(404).json({ message: 'Message not found' });
      msg.deletedFor = msg.deletedFor || [];
      if (!msg.deletedFor.includes(userId)) msg.deletedFor.push(userId);
      return res.json({ message: 'Message hidden for you' });
    }

    const msg = await Message.findByIdAndUpdate(
      messageId,
      { $addToSet: { deletedFor: userId } },
      { new: true }
    );
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    return res.json({ message: 'Message hidden for you' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add or remove an emoji reaction to a message (toggle)
 * @route   POST /api/messages/:messageId/react
 * @access  Private
 */
const toggleReaction = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { emoji, roomId } = req.body;
    const userId = getUserId(req);

    if (!emoji || !emoji.trim()) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    if (!isDBConnected() || !isValidObjectId(messageId)) {
      const msg = memoryMessages.get(messageId);
      if (!msg) return res.status(404).json({ message: 'Message not found' });

      msg.reactions = msg.reactions || [];
      const reactionGroup = msg.reactions.find((r) => r.emoji === emoji);

      if (reactionGroup) {
        const uIdx = reactionGroup.users.findIndex((u) => (u._id || u.id || u).toString() === userId.toString());
        if (uIdx > -1) {
          reactionGroup.users.splice(uIdx, 1);
          reactionGroup.count = reactionGroup.users.length;
          if (reactionGroup.count === 0) {
            msg.reactions = msg.reactions.filter((r) => r.emoji !== emoji);
          }
        } else {
          reactionGroup.users.push(req.user);
          reactionGroup.count = reactionGroup.users.length;
        }
      } else {
        msg.reactions.push({
          emoji,
          count: 1,
          users: [req.user]
        });
      }

      const io = req.app?.get('io');
      const targetRoomId = (roomId || msg.room)?.toString();
      if (io && targetRoomId) {
        io.to(targetRoomId).emit('message_reaction_updated', msg);
      }

      return res.json(msg);
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    let reactionGroup = message.reactions.find((r) => r.emoji === emoji);

    if (reactionGroup) {
      const userIndex = reactionGroup.users.indexOf(userId);
      if (userIndex > -1) {
        reactionGroup.users.splice(userIndex, 1);
        reactionGroup.count = reactionGroup.users.length;
        if (reactionGroup.count === 0) {
          message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
        }
      } else {
        reactionGroup.users.push(userId);
        reactionGroup.count = reactionGroup.users.length;
      }
    } else {
      message.reactions.push({
        emoji,
        count: 1,
        users: [userId]
      });
    }

    await message.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username email avatar customStatus')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'username' }
      })
      .populate('reactions.users', 'username avatar');

    const io = req.app?.get('io');
    const targetRoomId = (roomId || populatedMessage.room?._id || populatedMessage.room || message.room)?.toString();
    if (io && targetRoomId) {
      io.to(targetRoomId).emit('message_reaction_updated', populatedMessage);
    }

    return res.json(populatedMessage);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRoomMessages,
  searchRoomMessages,
  markMessagesAsRead,
  toggleStarMessage,
  deleteForMe,
  toggleReaction,
  memoryMessages
};
