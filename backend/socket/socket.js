const { Server } = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const User = require('../models/User');
const Room = require('../models/Room');
const CallHistory = require('../models/CallHistory');
const { memoryMessages } = require('../controllers/messageController');
const { memoryRooms } = require('../controllers/roomController');
const presenceHandler = require('./presenceHandler');
const callHandler = require('./callHandler');
const logger = require('../utils/logger');

let io;

/**
 * Check if MongoDB connection is active
 */
const isDBConnected = () => mongoose.connection.readyState === 1;

const getJwtSecret = () => process.env.JWT_SECRET || 'dev_only_insecure_secret';

const getUserId = (obj) => (obj && obj._id ? obj._id.toString() : obj && obj.id ? obj.id.toString() : null);

/**
 * Per-socket send rate limiter (anti-spam): max 20 messages / 10 seconds
 */
const sendRateLimiter = () => {
  const timestamps = [];
  return () => {
    const now = Date.now();
    while (timestamps.length && now - timestamps[0] > 10000) timestamps.shift();
    if (timestamps.length >= 20) return false;
    timestamps.push(now);
    return true;
  };
};

/**
 * Initialize Socket.io server with CORS and event listeners
 * @param {import('http').Server} server
 * @returns {Server}
 */
const initSocket = (server) => {
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim());

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || (typeof origin === 'string' && origin.endsWith('.vercel.app')) ||
            (typeof origin === 'string' && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')))) {
          callback(null, true);
        } else {
          callback(new Error(`[Socket CORS Error] Blocked origin ${origin}`));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
    // Reconnection-friendly: no forced disconnect on server restart beyond ping limits
    maxHttpBufferSize: 1e6
  });

  // ─── Socket Authentication Middleware ─────────────────────────────
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;
      if (!token && socket.request?.headers?.cookie) {
        const match = socket.request.headers.cookie
          .split(';').map((c) => c.trim())
          .find((c) => c.startsWith('token='));
        if (match) token = decodeURIComponent(match.split('=')[1]);
      }

      if (!token) {
        // Allow unauthenticated sockets in dev only (memory mode / local testing)
        if (process.env.NODE_ENV === 'production') {
          return next(new Error('Authentication required'));
        }
        socket.user = null;
        return next();
      }

      const decoded = jwt.verify(token, getJwtSecret());

      if (isDBConnected() && mongoose.Types.ObjectId.isValid(decoded.id)) {
        const user = await User.findById(decoded.id).select('-password');
        if (user) {
          socket.user = user;
          return next();
        }
      } else {
        // Memory mode: load from memory store
        const { memoryUsers } = require('../controllers/authController');
        const memUser = memoryUsers.get(decoded.id);
        if (memUser) {
          socket.user = memUser;
          return next();
        }
      }
      // Valid token but unknown user → reject in production
      if (process.env.NODE_ENV === 'production') {
        return next(new Error('User not found'));
      }
      socket.user = { id: decoded.id, username: 'Chatter', email: 'user@chatroom.com' };
      return next();
    } catch (err) {
      logger.warn(`[Socket Auth] ${err.message}`);
      if (process.env.NODE_ENV === 'production') {
        return next(new Error('Authentication failed'));
      }
      socket.user = null;
      return next();
    }
  });

  io.on('connection', (socket) => {
    logger.socket(`Client connected: ${socket.id}`);

    // Initialize Presence System for this socket
    presenceHandler(io, socket);

    // Initialize Multi-User SFU Call System for this socket
    callHandler(io, socket);

    const rateLimitSend = sendRateLimiter();

    // ── Room membership ──────────────────────────────────────────────
    socket.on('join_room', async ({ roomId }) => {
      if (!roomId) return;
      
      const user = socket.user;
      const userId = getUserId(user);
      
      // Validate room access for private rooms
      if (isDBConnected()) {
        const room = await Room.findById(roomId).select('isPrivate members').lean();
        if (room && room.isPrivate) {
          const memberIds = (room.members || []).map(m => m.toString());
          if (!memberIds.includes(userId.toString())) {
            logger.socket(`Private room access denied: ${user.username} (${userId}) not member of ${roomId}`);
            socket.emit('room_access_denied', { roomId, message: 'This is a private room. You are not a member.' });
            return;
          }
        }
      } else {
        const room = memoryRooms.get(roomId);
        if (room && room.isPrivate) {
          const memberIds = room.members || [];
          if (!memberIds.includes(userId)) {
            logger.socket(`Private room access denied: ${user.username} (${userId}) not member of ${roomId}`);
            socket.emit('room_access_denied', { roomId, message: 'This is a private room. You are not a member.' });
            return;
          }
        }
      }
      
      socket.roomId = roomId;
      socket.join(roomId);
      logger.socket(`User ${user.username} joined room: ${roomId}`);
      socket.to(roomId).emit('user_joined', { user, roomId });
    });

    socket.on('leave_room', ({ roomId }) => {
      if (roomId) {
        socket.leave(roomId);
        const user = socket.user || { username: socket.id };
        socket.to(roomId).emit('user_left', { user, roomId });
      }
      socket.roomId = null;
    });

    // ── Typing indicators ────────────────────────────────────────────
    socket.on('typing_start', ({ roomId }) => {
      const username = socket.user?.username || socket.id;
      socket.to(roomId).emit('user_typing', { username, roomId });
    });

    socket.on('typing_stop', ({ roomId }) => {
      const username = socket.user?.username || socket.id;
      socket.to(roomId).emit('user_stop_typing', { username, roomId });
    });

    // ── Send Message (Text + File attachments) ───────────────────────
    // SECURITY: sender is ALWAYS derived from the authenticated socket.user.
    // Client-provided `sender` is ignored to prevent impersonation.
    socket.on('send_message', async ({ roomId, content, fileUrl, fileType, fileName, replyToId, tempId }, ack) => {
      try {
        const sender = socket.user;
        if (!sender) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Not authenticated' });
          return;
        }
        if (!roomId) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Room id required' });
          return;
        }
        if (!rateLimitSend()) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Too many messages. Slow down.' });
          return;
        }

        const senderId = getUserId(sender);
        let msgObj;

        if (isDBConnected()) {
          const created = await Message.create({
            room: roomId,
            sender: senderId,
            content: typeof content === 'string' ? content.slice(0, 2000) : '',
            fileUrl: fileUrl || null,
            fileType: fileType || null,
            fileName: fileName ? String(fileName).slice(0, 255) : null,
            replyTo: replyToId || null,
            readBy: [senderId]
          });

          msgObj = await Message.findById(created._id)
            .populate('sender', 'username email avatar customStatus')
            .populate({
              path: 'replyTo',
              populate: { path: 'sender', select: 'username' }
            });
        } else {
          const msgId = 'mem_msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
          let replyObj = null;

          if (replyToId) {
            const parent = memoryMessages.get(replyToId);
            if (parent) {
              replyObj = {
                _id: parent._id,
                content: parent.content,
                sender: { username: parent.sender.username }
              };
            }
          }

          msgObj = {
            _id: msgId,
            room: roomId,
            sender: {
              _id: senderId,
              username: sender.username,
              email: sender.email,
              avatar: sender.avatar
            },
            content: typeof content === 'string' ? content.slice(0, 2000) : '',
            fileUrl: fileUrl || null,
            fileType: fileType || null,
            fileName: fileName || null,
            replyTo: replyObj,
            readBy: [senderId],
            isEdited: false,
            isDeleted: false,
            createdAt: new Date().toISOString()
          };

          memoryMessages.set(msgId, msgObj);
        }

        // Forward the client tempId (if any) so the sender can reconcile
        // queued/optimistic messages with the server-stored copy.
        io.to(roomId).emit('receive_message', tempId ? { ...msgObj, tempId } : msgObj);
        if (typeof ack === 'function') ack({ ok: true, message: tempId ? { ...msgObj, tempId } : msgObj });
      } catch (err) {
        logger.error(`[Socket] Failed to send message: ${err.message}`);
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed to send message' });
      }
    });

    // ── Edit Message (ownership enforced) ────────────────────────────
    socket.on('edit_message', async ({ messageId, roomId, newContent }) => {
      try {
        const senderId = getUserId(socket.user);
        if (!senderId) return;

        if (isDBConnected()) {
          const msg = await Message.findById(messageId);
          if (!msg || msg.sender.toString() !== senderId) return; // not owner → ignore
          const updated = await Message.findByIdAndUpdate(
            messageId,
            { content: String(newContent || '').slice(0, 2000), isEdited: true },
            { new: true }
          ).populate('sender', 'username email avatar');

          io.to(roomId).emit('message_edited', updated);
        } else {
          const msg = memoryMessages.get(messageId);
          if (msg && (msg.sender._id === senderId || msg.sender.id === senderId)) {
            msg.content = String(newContent || '').slice(0, 2000);
            msg.isEdited = true;
            io.to(roomId).emit('message_edited', msg);
          }
        }
      } catch (err) {
        logger.error(`[Socket] Failed to edit message: ${err.message}`);
      }
    });

    // ── Delete Message (ownership enforced) ──────────────────────────
    socket.on('delete_message', async ({ messageId, roomId }) => {
      try {
        const senderId = getUserId(socket.user);
        if (!senderId) return;

        if (isDBConnected()) {
          const msg = await Message.findById(messageId);
          if (!msg || msg.sender.toString() !== senderId) return; // not owner → ignore
          const deleted = await Message.findByIdAndUpdate(
            messageId,
            { content: 'This message was deleted', isDeleted: true, fileUrl: null },
            { new: true }
          ).populate('sender', 'username email avatar');

          io.to(roomId).emit('message_deleted', deleted);
        } else {
          const msg = memoryMessages.get(messageId);
          if (msg && (msg.sender._id === senderId || msg.sender.id === senderId)) {
            msg.content = 'This message was deleted';
            msg.fileUrl = null;
            msg.isDeleted = true;
            io.to(roomId).emit('message_deleted', msg);
          }
        }
      } catch (err) {
        logger.error(`[Socket] Failed to delete message: ${err.message}`);
      }
    });

    // ── Mark Read + Delivery receipts ────────────────────────────────
    socket.on('mark_read', async ({ roomId, userId }) => {
      socket.to(roomId).emit('messages_read', { roomId, userId });
      const readerId = getUserId(socket.user);
      if (isDBConnected() && readerId && roomId) {
        try {
          await Message.updateMany(
            { room: roomId, sender: { $ne: readerId }, deliveredTo: { $ne: readerId } },
            { $addToSet: { deliveredTo: readerId } }
          );
        } catch (err) {
          logger.error(`[Socket] mark_read delivery receipt error: ${err.message}`);
        }
      }
    });

    // ── Custom Status Update ─────────────────────────────────────────
    socket.on('update_status', async (statusData) => {
      try {
        const userId = getUserId(socket.user);
        if (isDBConnected() && userId) {
          const user = await User.findById(userId);
          if (user) {
            user.customStatus = {
              text: String(statusData?.text || '').slice(0, 100),
              emoji: String(statusData?.emoji || '').slice(0, 10),
              expiresAt: statusData?.expiresAt || null
            };
            await user.save();
            io.emit('status_updated', { userId, customStatus: user.customStatus });
          }
        }
      } catch (err) {
        logger.error(`[Socket] Failed to update status: ${err.message}`);
      }
    });

    // ── Toggle Message Reaction ──────────────────────────────────────
    socket.on('toggle_reaction', async ({ messageId, roomId, emoji }) => {
      try {
        const userId = getUserId(socket.user);
        if (!isDBConnected() || !userId) return;
        if (!emoji || typeof emoji !== 'string' || emoji.length > 8) return; // validate emoji

        const message = await Message.findById(messageId);
        if (!message) return;

        const reactionIndex = message.reactions.findIndex((r) => r.emoji === emoji);

        if (reactionIndex > -1) {
          const userIndex = message.reactions[reactionIndex].users.indexOf(userId);
          if (userIndex > -1) {
            message.reactions[reactionIndex].users.splice(userIndex, 1);
            if (message.reactions[reactionIndex].users.length === 0) {
              message.reactions.splice(reactionIndex, 1);
            }
          } else {
            message.reactions[reactionIndex].users.push(userId);
          }
        } else {
          message.reactions.push({ emoji, users: [userId] });
        }

        const updatedMessage = await message.save();
        const populatedMessage = await Message.findById(updatedMessage._id).populate('sender', 'username email avatar');

        io.to(roomId).emit('message_reaction_updated', populatedMessage);
      } catch (err) {
        logger.error(`[Socket] Failed to toggle reaction: ${err.message}`);
      }
    });

    // ── Star / Bookmark message ──────────────────────────────────────
    socket.on('star_message', async ({ messageId, roomId }) => {
      try {
        const userId = getUserId(socket.user);
        if (!userId) return;
        const msg = isDBConnected()
          ? await Message.findByIdAndUpdate(messageId, { $addToSet: { starredBy: userId } }, { new: true })
          : memoryMessages.get(messageId);

        if (!msg) return;
        if (!isDBConnected()) {
          msg.starredBy = msg.starredBy || [];
          if (!msg.starredBy.includes(userId)) msg.starredBy.push(userId);
        }
        io.to(roomId).emit('message_starred', { messageId, userId, starred: true });
      } catch (err) {
        logger.error(`[Socket] Failed to star message: ${err.message}`);
      }
    });

    socket.on('unstar_message', async ({ messageId, roomId }) => {
      try {
        const userId = getUserId(socket.user);
        if (!userId) return;
        const msg = isDBConnected()
          ? await Message.findByIdAndUpdate(messageId, { $pull: { starredBy: userId } }, { new: true })
          : memoryMessages.get(messageId);

        if (!msg) return;
        if (!isDBConnected()) {
          msg.starredBy = (msg.starredBy || []).filter((u) => u !== userId);
        }
        io.to(roomId).emit('message_unstarred', { messageId, userId, starred: false });
      } catch (err) {
        logger.error(`[Socket] Failed to unstar message: ${err.message}`);
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // WebRTC Voice Calling Signaling
    // All P2P signaling routes to a specific target socket ID (not broadcast)
    // ═══════════════════════════════════════════════════════════════════

    socket.on('call_user', async ({ toRoom, toSocketId, offer, caller }) => {
      logger.socket(`Voice call from ${caller?.username || socket.id} → room ${toRoom}`);

      try {
        // Dedupe: only create a 'missed' record if none exists for this room in last 10 min
        if (isDBConnected() && socket.user) {
          const existing = await CallHistory.findOne({
            room: toRoom,
            type: 'voice',
            status: 'missed',
            createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
          }).sort({ createdAt: -1 });
          if (!existing) {
            await CallHistory.create({
              caller: getUserId(socket.user),
              room: toRoom,
              type: 'voice',
              status: 'missed'
            });
          }
        }
      } catch (err) {
        logger.error(`[CallHistory] voice call_user error: ${err.message}`);
      }

      if (toSocketId) {
        socket.to(toSocketId).emit('call_incoming', { offer, caller: socket.user, fromSocket: socket.id });
      } else {
        socket.to(toRoom).emit('call_incoming', { offer, caller: socket.user, fromSocket: socket.id });
      }
    });

    socket.on('answer_call', async ({ toSocketId, toRoom, answer }) => {
      logger.socket(`Voice answer from ${socket.id} → ${toSocketId || toRoom}`);

      try {
        if (isDBConnected()) {
          const call = await CallHistory.findOne({ room: toRoom, status: 'missed', type: 'voice' }).sort({ createdAt: -1 });
          if (call) {
            call.status = 'ongoing';
            call.receiver = getUserId(socket.user);
            await call.save();
          }
        }
      } catch (err) {
        logger.error(`[CallHistory] voice answer error: ${err.message}`);
      }

      if (toSocketId) {
        socket.to(toSocketId).emit('call_answered', { answer, fromSocket: socket.id });
      } else {
        socket.to(toRoom).emit('call_answered', { answer, fromSocket: socket.id });
      }
    });

    socket.on('ice_candidate', ({ toSocketId, toRoom, candidate }) => {
      if (toSocketId) {
        socket.to(toSocketId).emit('ice_candidate', { candidate });
      } else {
        socket.to(toRoom).emit('ice_candidate', { candidate });
      }
    });

    socket.on('toggle_audio', ({ toRoom, muted, username }) => {
      socket.to(toRoom).emit('audio_toggled', { muted, username });
    });

    socket.on('end_call', async ({ toRoom }) => {
      logger.socket(`Call ended in room ${toRoom} by ${socket.id}`);

      try {
        if (isDBConnected()) {
          const call = await CallHistory.findOne({ room: toRoom, type: 'voice' }).sort({ createdAt: -1 });
          if (call && (call.status === 'ongoing' || call.status === 'missed')) {
            if (call.status === 'ongoing') {
              call.status = 'completed';
              call.endTime = new Date();
              call.duration = Math.round((call.endTime - call.startTime) / 1000);
            }
            await call.save();

            // Create system message
            const msg = await Message.create({
              room: toRoom,
              sender: call.caller,
              content: JSON.stringify({ type: 'voice', status: call.status, duration: call.duration }),
              fileType: 'call'
            });
            const populatedMsg = await Message.findById(msg._id).populate('sender', 'username email avatar customStatus');
            io.to(toRoom).emit('receive_message', populatedMsg);
          }
        }
      } catch (err) {
        logger.error(`[CallHistory] voice end error: ${err.message}`);
      }

      socket.to(toRoom).emit('call_ended');
    });

    // ═══════════════════════════════════════════════════════════════════
    // WebRTC Video Calling & Screen Sharing Signaling
    // ═══════════════════════════════════════════════════════════════════

    socket.on('video_call_user', async ({ toRoom, toSocketId, offer, caller }) => {
      logger.socket(`Video call from ${caller?.username || socket.id} → room ${toRoom}`);

      try {
        if (isDBConnected() && socket.user) {
          const existing = await CallHistory.findOne({
            room: toRoom,
            type: 'video',
            status: 'missed',
            createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
          }).sort({ createdAt: -1 });
          if (!existing) {
            await CallHistory.create({
              caller: getUserId(socket.user),
              room: toRoom,
              type: 'video',
              status: 'missed'
            });
          }
        }
      } catch (err) {
        logger.error(`[CallHistory] video call_user error: ${err.message}`);
      }

      if (toSocketId) {
        socket.to(toSocketId).emit('video_call_incoming', { offer, caller: socket.user, fromSocket: socket.id });
      } else {
        socket.to(toRoom).emit('video_call_incoming', { offer, caller: socket.user, fromSocket: socket.id });
      }
    });

    socket.on('video_call_answer', async ({ toSocketId, toRoom, answer }) => {
      logger.socket(`Video answer from ${socket.id} → ${toSocketId || toRoom}`);

      try {
        if (isDBConnected()) {
          const call = await CallHistory.findOne({ room: toRoom, status: 'missed', type: 'video' }).sort({ createdAt: -1 });
          if (call) {
            call.status = 'ongoing';
            call.receiver = getUserId(socket.user);
            await call.save();
          }
        }
      } catch (err) {
        logger.error(`[CallHistory] video answer error: ${err.message}`);
      }

      if (toSocketId) {
        socket.to(toSocketId).emit('video_call_answered', { answer, fromSocket: socket.id });
      } else {
        socket.to(toRoom).emit('video_call_answered', { answer, fromSocket: socket.id });
      }
    });

    socket.on('toggle_camera', ({ toRoom, cameraOff, username }) => {
      socket.to(toRoom).emit('camera_toggled', { cameraOff, username });
    });

    socket.on('screen_share_start', ({ toRoom, username }) => {
      logger.socket(`Screen sharing started in room ${toRoom} by ${username}`);
      socket.to(toRoom).emit('screen_share_started', { username });
    });

    socket.on('screen_share_stop', ({ toRoom, username }) => {
      logger.socket(`Screen sharing stopped in room ${toRoom} by ${username}`);
      socket.to(toRoom).emit('screen_share_stopped', { username });
    });

    socket.on('end_video_call', async ({ toRoom }) => {
      logger.socket(`Video call ended in room ${toRoom}`);

      try {
        if (isDBConnected()) {
          const call = await CallHistory.findOne({ room: toRoom, type: 'video' }).sort({ createdAt: -1 });
          if (call && (call.status === 'ongoing' || call.status === 'missed')) {
            if (call.status === 'ongoing') {
              call.status = 'completed';
              call.endTime = new Date();
              call.duration = Math.round((call.endTime - call.startTime) / 1000);
            }
            await call.save();

            const msg = await Message.create({
              room: toRoom,
              sender: call.caller,
              content: JSON.stringify({ type: 'video', status: call.status, duration: call.duration }),
              fileType: 'call'
            });
            const populatedMsg = await Message.findById(msg._id).populate('sender', 'username email avatar customStatus');
            io.to(toRoom).emit('receive_message', populatedMsg);
          }
        }
      } catch (err) {
        logger.error(`[CallHistory] video end error: ${err.message}`);
      }

      socket.to(toRoom).emit('video_call_ended');
    });

    // ── Disconnect Cleanup ───────────────────────────────────────────
    socket.on('disconnect', () => {
      if (socket.roomId) {
        const user = socket.user || { username: socket.id };
        socket.to(socket.roomId).emit('call_ended');
        socket.to(socket.roomId).emit('video_call_ended');
        socket.to(socket.roomId).emit('user_left', { user, roomId: socket.roomId });
        socket.to(socket.roomId).emit('user_stop_typing', { username: user.username, roomId: socket.roomId });
      }
      logger.socket(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

module.exports = { initSocket };
