const User = require('../models/User');
const { createNotification } = require('../controllers/notificationController');
const { disconnectUserSockets } = require('./adminRealtimeService');
const logger = require('../utils/logger');

const notifyUser = async (userId, { title, message, data = {}, link = { screen: 'friends' } }) => {
  try {
    return await createNotification({
      recipient: userId,
      type: 'system',
      title,
      message,
      link,
      data
    });
  } catch (err) {
    logger.error(`[Moderation] Failed to notify user ${userId}: ${err.message}`);
    return null;
  }
};

/**
 * Increment the user's token version so every existing JWT is rejected,
 * then drop any live sockets. Accepts an already-updated user document.
 */
const revokeUserSessions = async (userId) => {
  const updated = await User.findByIdAndUpdate(
    userId,
    { $inc: { tokenVersion: 1 } },
    { new: true }
  );
  disconnectUserSockets(userId, { reason: 'session_revoked' });
  return updated;
};

const suspendUser = async ({ userId, reason, note = '', adminId, durationHours = null }) => {
  const suspendedUntil = durationHours
    ? new Date(Date.now() + Math.max(1, Math.min(Number(durationHours), 24 * 365)) * 60 * 60 * 1000)
    : null;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        accountStatus: 'suspended',
        suspendedUntil,
        'moderation.action': 'suspend',
        'moderation.reason': reason,
        'moderation.note': note,
        'moderation.by': adminId,
        'moderation.at': new Date()
      },
      $inc: { tokenVersion: 1 }
    },
    { new: true, runValidators: true }
  );
  if (user) {
    disconnectUserSockets(user._id, { reason: 'account_suspended' });
    await notifyUser(user._id, {
      title: 'Account suspended',
      message: reason
        ? `Your account has been suspended. Reason: ${reason}`
        : 'Your account has been suspended by a platform administrator.',
      data: { action: 'suspend', suspendedUntil }
    });
  }
  return user;
};

const banUser = async ({ userId, reason, note = '', adminId }) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        accountStatus: 'banned',
        suspendedUntil: null,
        'moderation.action': 'ban',
        'moderation.reason': reason,
        'moderation.note': note,
        'moderation.by': adminId,
        'moderation.at': new Date()
      },
      $inc: { tokenVersion: 1 }
    },
    { new: true, runValidators: true }
  );
  if (user) {
    disconnectUserSockets(user._id, { reason: 'account_banned' });
    await notifyUser(user._id, {
      title: 'Account banned',
      message: reason
        ? `Your account has been banned. Reason: ${reason}`
        : 'Your account has been banned by a platform administrator.',
      data: { action: 'ban' }
    });
  }
  return user;
};

const restoreUser = async ({ userId, reason, note = '', adminId }) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        accountStatus: 'active',
        suspendedUntil: null,
        'moderation.action': 'restore',
        'moderation.reason': reason || '',
        'moderation.note': note,
        'moderation.by': adminId,
        'moderation.at': new Date()
      },
      $inc: { tokenVersion: 1 }
    },
    { new: true, runValidators: true }
  );
  if (user) {
    await notifyUser(user._id, {
      title: 'Account restored',
      message: 'Your account has been restored. You can sign in again.',
      data: { action: 'restore' }
    });
  }
  return user;
};

/**
 * Controlled soft-deletion: personal identifiers are anonymised while
 * message/room references stay intact. This is intentionally not a hard delete
 * so moderation evidence and referential integrity are preserved.
 */
const deleteUser = async ({ userId, reason, note = '', adminId }) => {
  const user = await User.findById(userId);
  if (!user) return null;
  const suffix = user._id.toString();
  user.username = `deleted_${suffix}`;
  user.email = `deleted_${suffix}@removed.local`;
  user.fullName = '';
  user.bio = '';
  user.phone = '';
  user.location = '';
  user.website = '';
  user.github = '';
  user.linkedin = '';
  user.avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=deleted-${suffix}`;
  user.accountStatus = 'deleted';
  user.suspendedUntil = null;
  user.deletedAt = new Date();
  user.deletedBy = adminId;
  user.moderation = {
    action: 'delete',
    reason,
    note,
    by: adminId,
    at: new Date()
  };
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  disconnectUserSockets(user._id, { reason: 'account_deleted' });
  return user;
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete obj.password;
  return obj;
};

module.exports = {
  notifyUser,
  revokeUserSessions,
  suspendUser,
  banUser,
  restoreUser,
  deleteUser,
  sanitizeUser
};
