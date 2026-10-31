const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  updateProfile,
  getUserById,
  getMyPublicId,
  lookupByPublicId,
  updateTheme,
  updatePersonality,
  searchUsers,
  getStarredMessages
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// Rate limiter for looking up users by public ID (protects against scraping/enumeration)
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 lookups per 15 min per IP
  message: { success: false, message: 'Too many lookup requests. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Current user Public ID endpoints
router.get('/my-id', protect, getMyPublicId);
router.get('/me/id', protect, getMyPublicId);

// Public ID exact lookup (authenticated + rate-limited)
router.get('/lookup/:publicId', protect, lookupLimiter, lookupByPublicId);

router.put('/profile', protect, updateProfile);
router.put('/theme', protect, updateTheme);
router.put('/personality', protect, updatePersonality);
router.get('/search', protect, searchUsers);
router.get('/starred', protect, getStarredMessages);

// Must be last: /:id matches any string parameter
router.get('/:id', getUserById);

module.exports = router;
