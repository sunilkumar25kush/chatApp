const express = require('express');
const router = express.Router();
const { getRoomMessages, markMessagesAsRead, searchRoomMessages, toggleStarMessage, deleteForMe, toggleReaction } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:roomId/search', protect, searchRoomMessages);
router.get('/:roomId', protect, getRoomMessages);
router.post('/:roomId/read', protect, markMessagesAsRead);
router.post('/:messageId/star', protect, toggleStarMessage);
router.post('/:messageId/delete-for-me', protect, deleteForMe);
router.post('/:messageId/reaction', protect, toggleReaction);

module.exports = router;
