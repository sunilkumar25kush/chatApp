const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const DirectMessage = require('../models/DirectMessage');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { isValidPublicId, normalizePublicId } = require('../utils/publicId');
const { memoryUsers } = require('./authController');
const logger = require('../utils/logger');

// In-memory fallback stores when MongoDB is not connected
const memoryConversations = new Map();
const memoryDirectMessages = new Map();

const isDBConnected = () => mongoose.connection.readyState === 1;

const getUserId = (req) => (req.user?._id ? req.user._id.toString() : req.user?.id?.toString());

const PUBLIC_PROFILE_FIELDS = 'publicId username fullName avatar bio status customStatus lastSeen createdAt';

const sanitizeUser = (user) => {
  if (!user) return null;
  return {
    _id: user._id?.toString() || user.id?.toString(),
    publicId: user.publicId,
    username: user.username,
    fullName: user.fullName || '',
    avatar: user.avatar,
    bio: user.bio || '',
    status: user.status || 'offline',
    customStatus: user.customStatus || { text: '', emoji: '' },
    lastSeen: user.lastSeen,
    createdAt: user.createdAt
  };
};

/**
 * @desc    Start or retrieve a canonical direct conversation with an accepted friend
 * @route   POST /api/conversations
 * @access  Private
 */
const getOrCreateConversation = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { friendPublicId, friendId } = req.body;

    if (!friendPublicId && !friendId) {
      return res.status(400).json({
        success: false,
        message: 'Target friend identifier (public ID or user ID) is required'
      });
    }

    let targetUser = null;

    if (friendPublicId) {
      if (!isValidPublicId(friendPublicId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid public ID format. Expected format: SKY-XXXXXX'
        });
      }
      const normalized = normalizePublicId(friendPublicId);
      if (isDBConnected()) {
        targetUser = await User.findOne({ publicId: normalized });
      }
      if (!targetUser && memoryUsers) {
        for (const u of memoryUsers.values()) {
          if (u.publicId === normalized) {
            targetUser = u;
            break;
          }
        }
      }
    } else if (friendId) {
      if (isDBConnected() && mongoose.Types.ObjectId.isValid(friendId)) {
        targetUser = await User.findById(friendId);
      }
      if (!targetUser && memoryUsers) {
        targetUser = memoryUsers.get(String(friendId));
      }
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Friend not found with the provided identifier'
      });
    }

    const resolvedTargetId = targetUser._id ? targetUser._id.toString() : targetUser.id.toString();

    // Prevent direct conversation with self
    if (resolvedTargetId === currentUserId) {
      return res.status(400).json({
        success: false,
        code: 'SELF_CONVERSATION',
        message: 'You cannot create a direct conversation with yourself'
      });
    }

    const pairKey = Conversation.makePairKey(currentUserId, resolvedTargetId);

    // Business Rule 1: Verify accepted friendship!
    if (isDBConnected()) {
      const friendship = await Friendship.findOne({ pairKey, status: 'accepted' });
      if (!friendship) {
        return res.status(403).json({
          success: false,
          code: 'FRIENDSHIP_REQUIRED',
          message: 'Direct messaging is only available between accepted friends'
        });
      }

      // Find or create the canonical conversation for this pair
      let conversation = await Conversation.findOne({ pairKey })
        .populate('participants', PUBLIC_PROFILE_FIELDS);

      if (!conversation) {
        try {
          conversation = await Conversation.create({
            pairKey,
            participants: [currentUserId, resolvedTargetId],
            friendship: friendship._id,
            unreadCounts: { [currentUserId]: 0, [resolvedTargetId]: 0 }
          });
          await conversation.populate('participants', PUBLIC_PROFILE_FIELDS);
        } catch (err) {
          if (err.code === 11000) {
            // Concurrent creation caught by unique pairKey
            conversation = await Conversation.findOne({ pairKey })
              .populate('participants', PUBLIC_PROFILE_FIELDS);
          } else {
            throw err;
          }
        }
      }

      const otherParticipant = conversation.participants.find(
        (p) => p._id.toString() === resolvedTargetId
      );

      return res.status(200).json({
        success: true,
        conversation: {
          _id: conversation._id,
          pairKey: conversation.pairKey,
          friend: sanitizeUser(otherParticipant),
          lastMessage: conversation.lastMessage,
          lastActivityAt: conversation.lastActivityAt,
          unreadCount: conversation.unreadCounts?.get(currentUserId) || 0,
          createdAt: conversation.createdAt
        }
      });
    } else {
      // Memory fallback mode
      let conversation = memoryConversations.get(pairKey);
      if (!conversation) {
        const id = 'mem_conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        conversation = {
          _id: id,
          pairKey,
          participants: [sanitizeUser(req.user), sanitizeUser(targetUser)],
          friend: sanitizeUser(targetUser),
          lastMessage: { content: '', sender: null, createdAt: null },
          lastActivityAt: new Date().toISOString(),
          unreadCount: 0,
          createdAt: new Date().toISOString()
        };
        memoryConversations.set(pairKey, conversation);
      }

      return res.status(200).json({
        success: true,
        conversation
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List all direct conversations for current user
 * @route   GET /api/conversations
 * @access  Private
 */
const getConversations = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (isDBConnected()) {
      const conversations = await Conversation.find({
        participants: currentUserId
      })
        .populate('participants', PUBLIC_PROFILE_FIELDS)
        .sort({ lastActivityAt: -1 });

      // Verify accepted friendship for each conversation (filter out revoked/deleted friendships)
      const validConversations = [];
      for (const conv of conversations) {
        const friendship = await Friendship.findOne({ pairKey: conv.pairKey, status: 'accepted' });
        if (!friendship) continue;

        const otherUser = conv.participants.find(
          (p) => p._id.toString() !== currentUserId
        );

        if (otherUser) {
          validConversations.push({
            _id: conv._id,
            pairKey: conv.pairKey,
            friend: sanitizeUser(otherUser),
            lastMessage: conv.lastMessage,
            lastActivityAt: conv.lastActivityAt,
            unreadCount: conv.unreadCounts?.get(currentUserId) || 0,
            createdAt: conv.createdAt
          });
        }
      }

      return res.json({
        success: true,
        count: validConversations.length,
        conversations: validConversations
      });
    } else {
      const list = [];
      for (const conv of memoryConversations.values()) {
        list.push(conv);
      }
      return res.json({ success: true, count: list.length, conversations: list });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get paginated direct messages for a conversation (cursor-based)
 * @route   GET /api/conversations/:id/messages
 * @access  Private
 */
const getConversationMessages = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { id } = req.params;
    const { cursor, limit = 30 } = req.query;

    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid conversation ID' });
      }

      const conversation = await Conversation.findById(id);
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      // Authorization Rule: Never authorize access by client-supplied ID alone
      const isMember = conversation.participants.some(
        (p) => p.toString() === currentUserId
      );
      if (!isMember) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'You are not a participant in this conversation'
        });
      }

      // Verify accepted friendship
      const friendship = await Friendship.findOne({
        pairKey: conversation.pairKey,
        status: 'accepted'
      });
      if (!friendship) {
        return res.status(403).json({
          success: false,
          code: 'FRIENDSHIP_REQUIRED',
          message: 'Direct messages are only accessible between accepted friends'
        });
      }

      // Cursor-based pagination query
      const query = { conversation: id };
      if (cursor) {
        const cursorDate = new Date(cursor);
        if (!isNaN(cursorDate.getTime())) {
          query.createdAt = { $lt: cursorDate };
        }
      }

      // Fetch one extra to determine if next page exists
      const messages = await DirectMessage.find(query)
        .sort({ createdAt: -1 })
        .limit(pageSize + 1)
        .populate('sender', 'publicId username avatar fullName')
        .populate('recipient', 'publicId username avatar fullName');

      const hasMore = messages.length > pageSize;
      if (hasMore) {
        messages.pop();
      }

      const nextCursor = messages.length > 0
        ? messages[messages.length - 1].createdAt.toISOString()
        : null;

      // Reverse to chronological order (oldest -> newest) for client rendering
      messages.reverse();

      return res.json({
        success: true,
        count: messages.length,
        hasMore,
        nextCursor,
        messages
      });
    } else {
      const messages = [];
      for (const msg of memoryDirectMessages.values()) {
        if (msg.conversation === id) {
          messages.push(msg);
        }
      }
      return res.json({ success: true, count: messages.length, hasMore: false, nextCursor: null, messages });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send a direct message in a conversation
 * @route   POST /api/conversations/:id/messages
 * @access  Private
 */
const sendDirectMessage = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { id } = req.params;
    const { content, fileUrl, fileType, fileName, fileSize, clientMsgId } = req.body;

    if (!content?.trim() && !fileUrl) {
      return res.status(400).json({
        success: false,
        message: 'Message must contain text content or an attachment'
      });
    }

    if (content && content.length > 4000) {
      return res.status(400).json({
        success: false,
        message: 'Message content cannot exceed 4000 characters'
      });
    }

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid conversation ID' });
      }

      // Deduplication check if clientMsgId was provided
      if (clientMsgId) {
        const existing = await DirectMessage.findOne({ conversation: id, clientMsgId });
        if (existing) {
          return res.status(200).json({ success: true, message: existing });
        }
      }

      const conversation = await Conversation.findById(id);
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      const isMember = conversation.participants.some(
        (p) => p.toString() === currentUserId
      );
      if (!isMember) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'You are not a participant in this conversation'
        });
      }

      // Verify active friendship
      const friendship = await Friendship.findOne({
        pairKey: conversation.pairKey,
        status: 'accepted'
      });
      if (!friendship) {
        return res.status(403).json({
          success: false,
          code: 'FRIENDSHIP_REQUIRED',
          message: 'Direct messages can only be sent between accepted friends'
        });
      }

      const recipientId = conversation.participants
        .find((p) => p.toString() !== currentUserId)
        .toString();

      // Persist direct message to MongoDB
      const message = await DirectMessage.create({
        conversation: id,
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

      // Update Conversation lastMessage & unread count
      const currentUnread = conversation.unreadCounts?.get(recipientId) || 0;
      conversation.unreadCounts.set(recipientId, currentUnread + 1);
      conversation.lastMessage = {
        content: content?.trim() || (fileType ? `Attachment: ${fileType}` : ''),
        sender: currentUserId,
        fileType: fileType || null,
        createdAt: message.createdAt,
        messageId: message._id
      };
      conversation.lastActivityAt = message.createdAt;
      await conversation.save();

      // Real-time Socket.IO emission to recipient and conversation room
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${recipientId}`).emit('direct_message_received', {
          conversationId: id,
          message
        });
        io.to(`conv:${id}`).emit('direct_message_received', {
          conversationId: id,
          message
        });
        io.to(`user:${recipientId}`).emit('conversation_updated', {
          conversationId: id,
          lastMessage: conversation.lastMessage,
          unreadCount: currentUnread + 1,
          lastActivityAt: conversation.lastActivityAt
        });
        io.to(`user:${currentUserId}`).emit('conversation_updated', {
          conversationId: id,
          lastMessage: conversation.lastMessage,
          unreadCount: 0,
          lastActivityAt: conversation.lastActivityAt
        });
      }

      return res.status(201).json({
        success: true,
        message
      });
    } else {
      // Memory mode
      const msgId = 'mem_dm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const message = {
        _id: msgId,
        conversation: id,
        sender: sanitizeUser(req.user),
        content: content?.trim() || '',
        fileUrl: fileUrl || null,
        fileType: fileType || null,
        isRead: false,
        createdAt: new Date().toISOString()
      };
      memoryDirectMessages.set(msgId, message);

      const io = req.app.get('io');
      if (io) {
        io.to(`conv:${id}`).emit('direct_message_received', { conversationId: id, message });
      }

      return res.status(201).json({ success: true, message });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all messages in a direct conversation as read
 * @route   PUT /api/conversations/:id/read
 * @access  Private
 */
const markConversationAsRead = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { id } = req.params;

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid conversation ID' });
      }

      const conversation = await Conversation.findById(id);
      if (!conversation) {
        return res.status(404).json({ success: false, message: 'Conversation not found' });
      }

      const isMember = conversation.participants.some(
        (p) => p.toString() === currentUserId
      );
      if (!isMember) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const now = new Date();

      // Mark unread messages sent to current user as read
      await DirectMessage.updateMany(
        {
          conversation: id,
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

      // Reset unread count for current user
      if (conversation.unreadCounts) {
        conversation.unreadCounts.set(currentUserId, 0);
        await conversation.save();
      }

      const senderId = conversation.participants
        .find((p) => p.toString() !== currentUserId)
        ?.toString();

      // Notify the sender that messages were read
      const io = req.app.get('io');
      if (io && senderId) {
        io.to(`user:${senderId}`).emit('direct_messages_read', {
          conversationId: id,
          readBy: currentUserId,
          readAt: now
        });
        io.to(`conv:${id}`).emit('direct_messages_read', {
          conversationId: id,
          readBy: currentUserId,
          readAt: now
        });
      }

      return res.json({ success: true, message: 'Messages marked as read' });
    } else {
      return res.json({ success: true, message: 'Messages marked as read' });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Edit a direct message
 * @route   PUT /api/conversations/messages/:messageId
 * @access  Private
 */
const editDirectMessage = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ success: false, message: 'Content cannot be empty' });
    }

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(400).json({ success: false, message: 'Invalid message ID' });
      }

      const message = await DirectMessage.findById(messageId);
      if (!message) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }

      if (message.sender.toString() !== currentUserId) {
        return res.status(403).json({ success: false, message: 'You can only edit your own messages' });
      }

      if (message.isDeleted) {
        return res.status(400).json({ success: false, message: 'Cannot edit a deleted message' });
      }

      message.content = content.trim();
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();

      const io = req.app.get('io');
      if (io) {
        io.to(`conv:${message.conversation}`).emit('direct_message_edited', {
          messageId: message._id,
          content: message.content,
          isEdited: true,
          editedAt: message.editedAt
        });
        io.to(`user:${message.recipient}`).emit('direct_message_edited', {
          messageId: message._id,
          content: message.content,
          isEdited: true,
          editedAt: message.editedAt
        });
      }

      return res.json({ success: true, message });
    } else {
      return res.json({ success: true });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a direct message (soft delete)
 * @route   DELETE /api/conversations/messages/:messageId
 * @access  Private
 */
const deleteDirectMessage = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { messageId } = req.params;

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(400).json({ success: false, message: 'Invalid message ID' });
      }

      const message = await DirectMessage.findById(messageId);
      if (!message) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }

      if (message.sender.toString() !== currentUserId) {
        return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
      }

      message.isDeleted = true;
      message.content = 'This message was deleted';
      message.fileUrl = null;
      message.fileName = null;
      await message.save();

      const io = req.app.get('io');
      if (io) {
        io.to(`conv:${message.conversation}`).emit('direct_message_deleted', {
          messageId: message._id,
          conversationId: message.conversation
        });
        io.to(`user:${message.recipient}`).emit('direct_message_deleted', {
          messageId: message._id,
          conversationId: message.conversation
        });
      }

      return res.json({ success: true, message: 'Message deleted' });
    } else {
      return res.json({ success: true, message: 'Message deleted' });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrCreateConversation,
  getConversations,
  getConversationMessages,
  sendDirectMessage,
  markConversationAsRead,
  editDirectMessage,
  deleteDirectMessage,
  memoryConversations,
  memoryDirectMessages
};

