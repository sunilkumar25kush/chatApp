const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const Story = require('../models/Story');
const StoryView = require('../models/StoryView');
const logger = require('../utils/logger');

let cleanupTimer = null;

// Initialize Cloudinary if credentials are present
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

/**
 * Delete media file associated with a story from either Cloudinary or local disk
 * @param {string} mediaUrl 
 */
const deleteStoryMedia = async (mediaUrl) => {
  if (!mediaUrl || typeof mediaUrl !== 'string') return;

  try {
    // 1. Check if it is a local upload
    if (mediaUrl.includes('/uploads/')) {
      const parts = mediaUrl.split('/uploads/');
      const filename = parts[parts.length - 1];
      if (filename) {
        const localFilePath = path.join(__dirname, '../uploads', filename);
        if (fs.existsSync(localFilePath)) {
          await fs.promises.unlink(localFilePath);
          logger.info(`[StoryCleanup] Deleted local story media: ${filename}`);
        }
      }
      return;
    }

    // 2. Check if it is a Cloudinary asset
    if (mediaUrl.includes('res.cloudinary.com') && process.env.CLOUDINARY_CLOUD_NAME) {
      // Extract public_id from Cloudinary URL (e.g., .../upload/v12345/chatroom_uploads/sample.jpg)
      const matches = mediaUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
      if (matches && matches[1]) {
        const publicId = matches[1];
        // Attempt destroy as image, then as video if not found
        try {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
          logger.info(`[StoryCleanup] Destroyed Cloudinary image: ${publicId}`);
        } catch {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
          logger.info(`[StoryCleanup] Destroyed Cloudinary video: ${publicId}`);
        }
      }
    }
  } catch (err) {
    logger.warn(`[StoryCleanup] Failed to delete media ${mediaUrl}: ${err.message}`);
  }
};

/**
 * Find and clean up expired stories and their associated media and view records
 */
const cleanupExpiredStories = async (maxRetries = 2) => {
  if (mongoose.connection.readyState !== 1) return;

  const now = new Date();
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      // Find stories that have expired
      const expiredStories = await Story.find({
        expiresAt: { $lte: now }
      }).limit(100);

      if (!expiredStories.length) {
        return;
      }

      logger.info(`[StoryCleanup] Found ${expiredStories.length} expired stories to clean up.`);

      for (const story of expiredStories) {
        // Delete media from storage
        if (story.mediaUrl) {
          await deleteStoryMedia(story.mediaUrl);
        }
        if (story.thumbnailUrl) {
          await deleteStoryMedia(story.thumbnailUrl);
        }

        // Delete all associated StoryView records
        await StoryView.deleteMany({ storyId: story._id });

        // Delete the story document itself
        await Story.findByIdAndDelete(story._id);
      }

      logger.info(`[StoryCleanup] Successfully purged ${expiredStories.length} expired stories and views.`);
      return;
    } catch (err) {
      attempt++;
      logger.error(`[StoryCleanup] Cleanup attempt ${attempt} failed: ${err.message}`);
      if (attempt > maxRetries) {
        logger.error('[StoryCleanup] Max retries exceeded for expired stories cleanup.');
      } else {
        // Wait 3 seconds before retry
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }
};

/**
 * Start the recurring scheduled cleanup job for expired stories
 */
const startStoryCleanupScheduler = () => {
  if (cleanupTimer) return cleanupTimer;

  // Run first check 10 seconds after server startup, then every 30 minutes
  setTimeout(() => cleanupExpiredStories().catch(() => {}), 10000);
  cleanupTimer = setInterval(() => cleanupExpiredStories().catch(() => {}), 30 * 60 * 1000);

  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
  return cleanupTimer;
};

/**
 * Stop the cleanup timer
 */
const stopStoryCleanupScheduler = () => {
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = null;
};

module.exports = {
  cleanupExpiredStories,
  deleteStoryMedia,
  startStoryCleanupScheduler,
  stopStoryCleanupScheduler
};
