const express = require('express');
const router = express.Router();
const { getCallHistory } = require('../controllers/callController');
const {
  getCallToken,
  getActiveCall,
  endCallSession,
  getRoomCallHistory
} = require('../controllers/callSessionController');
const { protect } = require('../middleware/authMiddleware');

// ── Multi-User SFU Call Endpoints ──────────────────────────────────────────
// Issue signed SFU access token with server-side room authorization
router.post('/token', protect, getCallToken);

// Query active call session for a conversation room
router.get('/room/:roomId/active', protect, getActiveCall);

// Query call history for a conversation room
router.get('/room/:roomId/history', protect, getRoomCallHistory);

// Explicitly end a call session
router.post('/:callId/end', protect, endCallSession);

// ── Existing User Call History ─────────────────────────────────────────────
router.get('/', protect, getCallHistory);

module.exports = router;
