const mongoose = require('mongoose');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { getOnlineUserIds } = require('./adminRealtimeService');
const logger = require('../utils/logger');

const CHUNK_SIZE = 500;

const resolveRecipients = async (announcement) => {
  if (announcement.audience === 'selected') {
    const ids = (announcement.userIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length) return [];
    return User.find({ _id: { $in: ids }, accountStatus: { $ne: 'deleted' } }).select('_id').lean();
  }

  if (announcement.audience === 'online') {
    const online = getOnlineUserIds().filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!online.length) return [];
    return User.find({ _id: { $in: online }, accountStatus: { $ne: 'deleted' } }).select('_id').lean();
  }

  return User.find({ accountStatus: { $ne: 'deleted' } }).select('_id').lean();
};

const dispatchAnnouncement = async (announcement) => {
  const recipients = await resolveRecipients(announcement);
  const recipientIds = recipients.map((r) => r._id);
  let delivered = 0;
  let failed = 0;

  const online = new Set(getOnlineUserIds());
  let io = null;
  try {
    const { getIO } = require('../socket/socket');
    io = getIO();
  } catch {
    io = null;
  }

  for (let i = 0; i < recipientIds.length; i += CHUNK_SIZE) {
    const chunk = recipientIds.slice(i, i + CHUNK_SIZE);
    const docs = chunk.map((recipientId) => ({
      recipient: recipientId,
      type: 'system',
      title: announcement.title,
      message: announcement.message,
      link: { screen: 'friends' },
      data: {
        announcementId: announcement._id.toString(),
        kind: 'platform_announcement'
      }
    }));
    try {
      const inserted = await Notification.insertMany(docs, { ordered: false });
      delivered += inserted.length;
      if (io) {
        inserted.forEach((notif) => {
          if (online.has(String(notif.recipient))) {
            io.to(`user:${notif.recipient}`).emit('notification_received', notif);
          }
        });
      }
    } catch (err) {
      failed += chunk.length;
      logger.error(`[Announcement] Batch delivery failed: ${err.message}`);
    }
  }

  const updated = await Announcement.findByIdAndUpdate(
    announcement._id,
    {
      $set: {
        status: failed > 0 && delivered === 0 ? 'failed' : 'sent',
        sentAt: new Date(),
        'stats.recipients': recipientIds.length,
        'stats.delivered': delivered,
        'stats.failed': failed,
        failureReason: failed > 0 && delivered === 0 ? 'Delivery failed' : ''
      }
    },
    { new: true }
  );
  return updated;
};

const sendAnnouncementNow = async (announcementId) => {
  const claimed = await Announcement.findOneAndUpdate(
    { _id: announcementId, status: { $in: ['draft', 'scheduled'] } },
    { $set: { status: 'sending' } },
    { new: true }
  );
  if (!claimed) return null;
  return dispatchAnnouncement(claimed);
};

const processDueAnnouncements = async () => {
  const due = await Announcement.find({
    status: 'scheduled',
    scheduledFor: { $lte: new Date() }
  }).select('_id').lean();

  for (const item of due) {
    const claimed = await Announcement.findOneAndUpdate(
      { _id: item._id, status: 'scheduled' },
      { $set: { status: 'sending' } },
      { new: true }
    );
    if (!claimed) continue;
    try {
      await dispatchAnnouncement(claimed);
    } catch (err) {
      logger.error(`[Announcement] Scheduled dispatch failed: ${err.message}`);
      await Announcement.findByIdAndUpdate(item._id, {
        $set: { status: 'failed', failureReason: err.message.slice(0, 500) }
      });
    }
  }
  return due.length;
};

module.exports = {
  sendAnnouncementNow,
  processDueAnnouncements
};
