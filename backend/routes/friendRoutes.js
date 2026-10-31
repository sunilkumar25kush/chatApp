const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  sendFriendRequest,
  getIncomingRequests,
  getOutgoingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  getFriends,
  removeFriend,
  getRelationshipStatus
} = require('../controllers/friendController');
const { protect } = require('../middleware/authMiddleware');

// Rate limiter for sending friend requests (prevents abuse / request spamming)
const friendRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 friend requests per 15 min per IP
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many friend requests sent. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ── Friend Request Endpoints ──────────────────────────────────────────────
router.post('/request', protect, friendRequestLimiter, sendFriendRequest);
router.get('/requests/incoming', protect, getIncomingRequests);
router.get('/requests/outgoing', protect, getOutgoingRequests);
router.put('/requests/:id/accept', protect, acceptFriendRequest);
router.put('/requests/:id/reject', protect, rejectFriendRequest);
router.delete('/requests/:id', protect, cancelFriendRequest);

// ── Relationship & Friends Endpoints ──────────────────────────────────────
router.get('/', protect, getFriends);
router.get('/status/:targetId', protect, getRelationshipStatus);
router.delete('/:friendId', protect, removeFriend);

module.exports = router;

