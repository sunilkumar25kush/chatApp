const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  createStory,
  getStoriesFeed,
  getUserStories,
  getStoryById,
  recordStoryView,
  getStoryViews,
  updateStoryPrivacy,
  deleteStory,
  getDefaultStoryPrivacy,
  updateDefaultStoryPrivacy
} = require('../controllers/storyController');
const { protect } = require('../middleware/authMiddleware');

// Rate limiting for story creation: max 30 stories per 15 minutes
const storyCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many stories created. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting for story views: max 300 views per minute
const storyViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many story view requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false
});

// All story routes require authentication
router.use(protect);

router.route('/')
  .post(storyCreateLimiter, createStory)
  .get(getStoriesFeed);

router.get('/feed', getStoriesFeed);
router.get('/user/:userId', getUserStories);

// Default privacy preference endpoints (MUST be defined before /:storyId)
router.route('/privacy/default')
  .get(getDefaultStoryPrivacy)
  .put(updateDefaultStoryPrivacy);

router.route('/:storyId')
  .get(getStoryById)
  .delete(deleteStory);

router.route('/:storyId/view')
  .post(storyViewLimiter, recordStoryView);

router.route('/:storyId/views')
  .get(getStoryViews);

router.route('/:storyId/privacy')
  .put(updateStoryPrivacy);

module.exports = router;
