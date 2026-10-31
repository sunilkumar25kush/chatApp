const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');

const isDBConnected = () => mongoose.connection.readyState === 1;

let getSocketIO = () => {
  try {
    const { getIO } = require('../socket/socket');
    return getIO();
  } catch {
    return null;
  }
};

const getUserId = (req) =>
  req.user?._id ? req.user._id.toString() : req.user?.id ? req.user.id.toString() : null;

// In-memory fallback
const memoryNotifications = new Map();

/**
 * Concurrency-safe, deduplicated notification creator helper
 * Call this from friendController and roomJoinRequestController
 */
const createNotification = async ({
  recipient,
  sender = null,
  type,
  title,
  message,
  link = { screen: 'friends' },
  data = {},
  dedupKey = null
}) => {
  try {
    const recipientId = recipient?._id ? recipient._id.toString() : String(recipient);
    const senderId = sender?._id ? sender._id.toString() : sender ? String(sender) : null;

    if (isDBConnected() && mongoose.Types.ObjectId.isValid(recipientId)) {
      if (dedupKey) {
        const existing = await Notification.findOne({
          recipient: recipientId,
          dedupKey
        });
        if (existing) {
          return existing;
        }
      }

      let created;
      try {
        created = await Notification.create({
          recipient: recipientId,
          sender: senderId && mongoose.Types.ObjectId.isValid(senderId) ? senderId : null,
          type,
          title,
          message,
          link,
          data,
          dedupKey
        });
      } catch (err) {
        if (err.code === 11000) {
          // Handled duplicate via unique dedupKey
          return await Notification.findOne({ recipient: recipientId, dedupKey });
        }
        throw err;
      }

      const populated = await Notification.findById(created._id)
        .populate('sender', 'username fullName avatar publicId');

      // Real-time socket delivery
      const io = getSocketIO();
      if (io) {
        io.to(`user:${recipientId}`).emit('notification_received', populated);
      }

      return populated;
    }

    // In-memory fallback
    if (dedupKey) {
      for (const notif of memoryNotifications.values()) {
        if (String(notif.recipient) === recipientId && notif.dedupKey === dedupKey) {
          return notif;
        }
      }
    }

    const id = 'mem_notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const notifObj = {
      _id: id,
      id,
      recipient: recipientId,
      sender: sender ? { _id: senderId, username: sender.username || 'User', publicId: sender.publicId } : null,
      type,
      title,
      message,
      link,
      data,
      dedupKey,
      isRead: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    memoryNotifications.set(id, notifObj);

    const io = getSocketIO();
    if (io) {
      io.to(`user:${recipientId}`).emit('notification_received', notifObj);
    }

    return notifObj;
  } catch (error) {
    logger.error(`[Notification] Failed to create notification: ${error.message}`);
    return null;
  }
};

/**
 * @desc    Get current user's notifications
 * @route   GET /api/notifications
 * @access  Private
 */
const getNotifications = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (isDBConnected()) {
      const notifications = await Notification.find({ recipient: userId })
        .populate('sender', 'username fullName avatar publicId')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const unreadCount = await Notification.countDocuments({
        recipient: userId,
        isRead: false
      });

      return res.json({
        success: true,
        notifications,
        unreadCount
      });
    }

    // In-memory fallback
    const list = Array.from(memoryNotifications.values())
      .filter((n) => String(n.recipient) === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const unreadCount = list.filter((n) => !n.isRead).length;

    return res.json({
      success: true,
      notifications: list,
      unreadCount
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark a notification as read
 * @route   PUT /api/notifications/:id/read
 * @access  Private
 */
const markAsRead = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid notification ID' });
      }

      const notif = await Notification.findOneAndUpdate(
        { _id: id, recipient: userId },
        { isRead: true },
        { new: true }
      );

      if (!notif) {
        return res.status(404).json({ message: 'Notification not found' });
      }

      return res.json({ success: true, notification: notif });
    }

    // In-memory fallback
    const notif = memoryNotifications.get(id);
    if (!notif || String(notif.recipient) !== userId) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notif.isRead = true;
    notif.updatedAt = new Date().toISOString();

    return res.json({ success: true, notification: notif });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all user notifications as read
 * @route   PUT /api/notifications/read-all
 * @access  Private
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = getUserId(req);

    if (isDBConnected()) {
      await Notification.updateMany(
        { recipient: userId, isRead: false },
        { isRead: true }
      );
      return res.json({ success: true, message: 'All notifications marked as read' });
    }

    // In-memory fallback
    for (const notif of memoryNotifications.values()) {
      if (String(notif.recipient) === userId) {
        notif.isRead = true;
        notif.updatedAt = new Date().toISOString();
      }
    }

    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
const deleteNotification = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid notification ID' });
      }

      const notif = await Notification.findOneAndDelete({ _id: id, recipient: userId });
      if (!notif) {
        return res.status(404).json({ message: 'Notification not found' });
      }

      return res.json({ success: true, message: 'Notification deleted' });
    }

    // In-memory fallback
    const notif = memoryNotifications.get(id);
    if (!notif || String(notif.recipient) !== userId) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    memoryNotifications.delete(id);
    return res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  memoryNotifications
};
