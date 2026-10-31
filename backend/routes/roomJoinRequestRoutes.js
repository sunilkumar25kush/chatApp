const express = require('express');
const router = express.Router();
const {
  getRoomPreview,
  createJoinRequest,
  listRoomJoinRequests,
  listMyJoinRequests,
  cancelJoinRequest,
  approveJoinRequest,
  rejectJoinRequest
} = require('../controllers/roomJoinRequestController');
const { protect } = require('../middleware/authMiddleware');

router.get('/my', protect, listMyJoinRequests);
router.get('/:id/preview', protect, getRoomPreview);
router.post('/:id/request', protect, createJoinRequest);
router.get('/:id', protect, listRoomJoinRequests);
router.delete('/:id/:requestId', protect, cancelJoinRequest);
router.put('/:id/:requestId/cancel', protect, cancelJoinRequest);
router.post('/:id/:requestId/approve', protect, approveJoinRequest);
router.put('/:id/:requestId/approve', protect, approveJoinRequest);
router.post('/:id/:requestId/reject', protect, rejectJoinRequest);
router.put('/:id/:requestId/reject', protect, rejectJoinRequest);

module.exports = router;

