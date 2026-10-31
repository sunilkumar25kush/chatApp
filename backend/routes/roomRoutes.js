const express = require('express');
const router = express.Router();
const {
  createRoom,
  getAllRooms,
  getRoomById,
  getRoomByCode,
  joinRoomByCode,
  joinRoomByInvite,
  updateRoomVisibility,
  leaveRoom,
  deleteRoom,
  updateRoom,
  addMember,
  removeMember,
  promoteMember,
  getRoomMembers,
  searchRooms
} = require('../controllers/roomController');
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

router.post('/', protect, createRoom);
router.get('/', protect, getAllRooms);
router.get('/search', protect, searchRooms);
router.get('/join-requests/my', protect, listMyJoinRequests);
router.get('/code/:code', protect, getRoomByCode);
router.post('/join', protect, joinRoomByCode);
router.post('/invite/:inviteCode', protect, joinRoomByInvite);
router.get('/:id/preview', protect, getRoomPreview);
router.post('/:id/join-requests', protect, createJoinRequest);
router.post('/:id/join-request', protect, createJoinRequest);
router.get('/:id/join-requests', protect, listRoomJoinRequests);
router.delete('/:id/join-requests/:requestId', protect, cancelJoinRequest);
router.put('/:id/join-requests/:requestId/cancel', protect, cancelJoinRequest);
router.post('/:id/join-requests/:requestId/approve', protect, approveJoinRequest);
router.put('/:id/join-requests/:requestId/approve', protect, approveJoinRequest);
router.post('/:id/join-requests/:requestId/reject', protect, rejectJoinRequest);
router.put('/:id/join-requests/:requestId/reject', protect, rejectJoinRequest);
router.get('/:id', protect, getRoomById);
router.put('/:id/visibility', protect, updateRoomVisibility);
router.put('/:id/privacy', protect, updateRoomVisibility);
router.post('/:id/leave', protect, leaveRoom);
router.get('/:id/members', protect, getRoomMembers);
router.post('/:id/members', protect, addMember);
router.delete('/:id/members/:userId', protect, removeMember);
router.post('/:id/admins', protect, promoteMember);
router.put('/:id', protect, updateRoom);
router.delete('/:id', protect, deleteRoom);

module.exports = router;
