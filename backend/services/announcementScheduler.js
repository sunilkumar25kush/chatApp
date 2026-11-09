const Announcement = require('../models/Announcement');
const { processDueAnnouncements } = require('./announcementService');
const logger = require('../utils/logger');

let timer = null;

/**
 * Recover announcements that were claimed for sending but crashed mid-dispatch.
 * They are returned to the scheduled queue after a grace period.
 */
const recoverStuckAnnouncements = async () => {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  await Announcement.updateMany(
    { status: 'sending', updatedAt: { $lte: cutoff } },
    { $set: { status: 'scheduled' } }
  );
};

const tick = async () => {
  try {
    await recoverStuckAnnouncements();
    await processDueAnnouncements();
  } catch (error) {
    logger.error(`[AnnouncementScheduler] ${error.message}`);
  }
};

const startAnnouncementScheduler = () => {
  if (timer) return timer;
  // Run shortly after boot, then every minute.
  setTimeout(tick, 5000);
  timer = setInterval(tick, 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
};

const stopAnnouncementScheduler = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { startAnnouncementScheduler, stopAnnouncementScheduler };
