const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const DirectMessage = require('../models/DirectMessage');
const Friendship = require('../models/Friendship');
const logger = require('../utils/logger');

const isDBConnected = () => mongoose.connection.readyState === 1;

const getUserId = (obj) => (obj && obj._id ? obj._id.toString() : obj && obj.id ? obj.id.toString() : null);

/**
 * Socket.IO Direct Messaging Handler
 * 
 * Enforces server-side authorization on every event:
 * - Checks user identity from verified JWT session
 * - Verifies membership in conversation
 * - Verifies underlying accepted friendship
 * 
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
module.exports = (io, socket) => {
  const currentUserId = getUserId(socket.user);

  // ── 1. Join Direct Conversation Room ────────────────────────────────
  socket.on('join_conversation', async ({ conversationId }, callback) => {
    if (!conversationId) {
      if (typeof callback === 'function') callback({ error: 'Conversation ID required' });
      return;
    }

    if (!currentUserId) {
      socket.emit('conversation_access_denied', { conversationId, message: 'Authentication required' });
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }

    try {
      if (isDBConnected() && mongoose.Types.ObjectId.isValid(conversationId)) {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          socket.emit('conversation_access_denied', { conversationId, message: 'Conversation not found' });
          if (typeof callback === 'function') callback({ error: 'Conversation not found' });
          return;
        }

        const isMember = conversation.participants.some(
          (p) => p.toString() === currentUserId
        );
        if (!isMember) {
          socket.emit('conversation_access_denied', { conversationId, message: 'You are not a participant in this conversation' });
          if (typeof callback === 'function') callback({ error: 'Unauthorized' });
          return;
        }

        const friendship = await Friendship.findOne({
          pairKey: conversation.pairKey,
          status: 'accepted'
        });
        if (!friendship) {
          socket.emit('conversation_access_denied', { conversationId, message: 'Direct messages require an active friendship' });
          if (typeof callback === 'function') callback({ error: 'Friendship required' });
          return;
        }

        socket.join(`conv:${conversationId}`);
        logger.socket(`User ${currentUserId} joined conversation room conv:${conversationId}`);
        if (typeof callback === 'function') callback({ success: true });
      } else {
        socket.join(`conv:${conversationId}`);
        if (typeof callback === 'function') callback({ success: true });
      }
    } catch (err) {
      logger.error(`[Socket DM] Error joining conversation: ${err.message}`);
      if (typeof callback === 'function') callback({ error: 'Server error joining conversation' });
    }
  });

  // ── 2. Leave Direct Conversation Room ───────────────────────────────
  socket.on('leave_conversation', ({ conversationId }) => {
    if (conversationId) {
      socket.leave(`conv:${conversationId}`);
      logger.socket(`User ${currentUserId} left conversation room conv:${conversationId}`);
    }
  });

  // ── 3. Send Direct Message via Socket ───────────────────────────────
  socket.on('send_direct_message', async (data, callback) => {
    if (!currentUserId) {
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }

    const { conversationId, content, fileUrl, fileType, fileName, fileSize, clientMsgId } = data || {};

    if (!conversationId) {
      if (typeof callback === 'function') callback({ error: 'Conversation ID is required' });
      return;
    }

    if (!content?.trim() && !fileUrl) {
      if (typeof callback === 'function') callback({ error: 'Message content or attachment required' });
      return;
    }

    try {
      if (isDBConnected() && mongoose.Types.ObjectId.isValid(conversationId)) {
        // Idempotency check
        if (clientMsgId) {
          const existing = await DirectMessage.findOne({ conversation: conversationId, clientMsgId })
            .populate('sender', 'publicId username avatar fullName')
            .populate('recipient', 'publicId username avatar fullName');

          if (existing) {
            if (typeof callback === 'function') callback({ success: true, message: existing });
            return;
          }
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (typeof callback === 'function') callback({ error: 'Conversation not found' });
          return;
        }

        const isMember = conversation.participants.some(
          (p) => p.toString() === currentUserId
        );
        if (!isMember) {
          if (typeof callback === 'function') callback({ error: 'Unauthorized' });
          return;
        }

        const friendship = await Friendship.findOne({
          pairKey: conversation.pairKey,
          status: 'accepted'
        });
        if (!friendship) {
          if (typeof callback === 'function') callback({ error: 'Direct messages require an active friendship' });
          return;
        }

        const recipientId = conversation.participants
          .find((p) => p.toString() !== currentUserId)
          .toString();

        // 1. Persist to MongoDB
        const message = await DirectMessage.create({
          conversation: conversationId,
          sender: currentUserId,
          recipient: recipientId,
          content: content?.trim() || '',
          fileUrl: fileUrl || null,
          fileType: fileType || null,
          fileName: fileName || null,
          fileSize: fileSize || null,
          clientMsgId: clientMsgId || null,
          isDelivered: true,
          deliveredAt: new Date()
        });

        await message.populate('sender', 'publicId username avatar fullName');
        await message.populate('recipient', 'publicId username avatar fullName');

        // 2. Update Conversation state & unread count
        const unread = conversation.unreadCounts?.get(recipientId) || 0;
        conversation.unreadCounts.set(recipientId, unread + 1);
        conversation.lastMessage = {
          content: content?.trim() || (fileType ? `Attachment: ${fileType}` : ''),
          sender: currentUserId,
          fileType: fileType || null,
          createdAt: message.createdAt,
          messageId: message._id
        };
        conversation.lastActivityAt = message.createdAt;
        await conversation.save();

        // 3. Emit real-time notification
        io.to(`conv:${conversationId}`).emit('direct_message_received', {
          conversationId,
          message
        });

        io.to(`user:${recipientId}`).emit('direct_message_received', {
          conversationId,
          message
        });

        io.to(`user:${recipientId}`).emit('conversation_updated', {
          conversationId,
          lastMessage: conversation.lastMessage,
          unreadCount: unread + 1,
          lastActivityAt: conversation.lastActivityAt
        });

        io.to(`user:${currentUserId}`).emit('conversation_updated', {
          conversationId,
          lastMessage: conversation.lastMessage,
          unreadCount: 0,
          lastActivityAt: conversation.lastActivityAt
        });

        if (typeof callback === 'function') {
          callback({ success: true, message });
        }
      } else {
        // Memory fallback
        const msg = {
          _id: 'mem_dm_' + Date.now(),
          conversation: conversationId,
          sender: socket.user,
          content: content?.trim() || '',
          fileUrl: fileUrl || null,
          isRead: false,
          createdAt: new Date().toISOString()
        };
        io.to(`conv:${conversationId}`).emit('direct_message_received', {
          conversationId,
          message: msg
        });
        if (typeof callback === 'function') callback({ success: true, message: msg });
      }
    } catch (err) {
      logger.error(`[Socket DM] Send error: ${err.message}`);
      if (typeof callback === 'function') callback({ error: 'Server error sending message' });
    }
  });

  // ── 4. Direct Typing Indicators ─────────────────────────────────────
  socket.on('direct_typing', ({ conversationId, isTyping }) => {
    if (!conversationId || !currentUserId) return;
    socket.to(`conv:${conversationId}`).emit('direct_user_typing', {
      conversationId,
      userId: currentUserId,
      isTyping: Boolean(isTyping)
    });
  });

  // ── 5. Mark Direct Messages Read ────────────────────────────────────
  socket.on('mark_direct_read', async ({ conversationId }, callback) => {
    if (!conversationId || !currentUserId) return;

    try {
      if (isDBConnected() && mongoose.Types.ObjectId.isValid(conversationId)) {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        const isMember = conversation.participants.some(
          (p) => p.toString() === currentUserId
        );
        if (!isMember) return;

        const now = new Date();

        await DirectMessage.updateMany(
          {
            conversation: conversationId,
            recipient: currentUserId,
            isRead: false
          },
          {
            $set: {
              isRead: true,
              readAt: now
            }
          }
        );

        if (conversation.unreadCounts) {
          conversation.unreadCounts.set(currentUserId, 0);
          await conversation.save();
        }

        const senderId = conversation.participants
          .find((p) => p.toString() !== currentUserId)
          ?.toString();

        if (senderId) {
          io.to(`user:${senderId}`).emit('direct_messages_read', {
            conversationId,
            readBy: currentUserId,
            readAt: now
          });
        }

        socket.to(`conv:${conversationId}`).emit('direct_messages_read', {
          conversationId,
          readBy: currentUserId,
          readAt: now
        });

        if (typeof callback === 'function') callback({ success: true });
      }
    } catch (err) {
      logger.error(`[Socket DM] Mark read error: ${err.message}`);
    }
  });
};

