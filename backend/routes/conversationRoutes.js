const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getOrCreateConversation,
  getConversations,
  getConversationMessages,
  sendDirectMessage,
  markConversationAsRead,
  editDirectMessage,
  deleteDirectMessage
} = require('../controllers/conversationController');
const { protect } = require('../middleware/authMiddleware');

// Message sending rate limiter (prevents automated flooding / spam)
const directMessageLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 30, // 30 messages per 10 seconds per IP
  message: {
    success: false,
    message: 'Too many messages sent. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ── Conversation Endpoints ──────────────────────────────────────────
router.post('/', protect, getOrCreateConversation);
router.get('/', protect, getConversations);
router.get('/:id/messages', protect, getConversationMessages);
router.post('/:id/messages', protect, directMessageLimiter, sendDirectMessage);
router.put('/:id/read', protect, markConversationAsRead);

// ── Direct Message Management ───────────────────────────────────────
router.put('/messages/:messageId', protect, editDirectMessage);
router.delete('/messages/:messageId', protect, deleteDirectMessage);

module.exports = router;

