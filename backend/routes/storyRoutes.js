const express = require('express');
const router = express.Router();
const {
  createStory,
  getStoriesFeed,
  getUserStories,
  getStoryById,
  recordStoryView,
  getStoryViews,
  updateStoryPrivacy,
  deleteStory
} = require('../controllers/storyController');
const { protect } = require('../middleware/authMiddleware');

// All story routes require authentication
router.use(protect);

router.route('/')
  .post(createStory)
  .get(getStoriesFeed);

router.get('/feed', getStoriesFeed);
router.get('/user/:userId', getUserStories);

router.route('/:storyId')
  .get(getStoryById)
  .delete(deleteStory);

router.route('/:storyId/view')
  .post(recordStoryView);

router.route('/:storyId/views')
  .get(getStoryViews);

router.route('/:storyId/privacy')
  .put(updateStoryPrivacy);

module.exports = router;
