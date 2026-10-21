const mongoose = require('mongoose');
const Room = require('../models/Room');
const CallSession = require('../models/CallSession');
const { generateCallToken } = require('../services/livekitService');
const { memoryRooms } = require('./roomController');
const logger = require('../utils/logger');

// In-memory fallback map for call sessions when running without MongoDB
const memoryCallSessions = new Map();

const isDBConnected = () => mongoose.connection.readyState === 1;

/**
 * Check if a user is authorized to participate in calls for a given room.
 * For private rooms, the user must be the owner, an admin, or an approved member.
 */
const authorizeRoomAccess = async (roomId, user) => {
  if (!roomId) {
    return { authorized: false, error: 'Room ID is required.', statusCode: 400 };
  }

  const userIdStr = user?._id ? user._id.toString() : user?.id ? String(user.id) : null;
  if (!userIdStr) {
    return { authorized: false, error: 'User must be authenticated.', statusCode: 401 };
  }

  if (isDBConnected()) {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return { authorized: false, error: 'Invalid room/conversation ID format.', statusCode: 400 };
    }

    const room = await Room.findById(roomId).select('isPrivate owner admins members name deleted').lean();
    if (!room || room.deleted) {
      return { authorized: false, error: 'Room not found or has been deleted.', statusCode: 404 };
    }

    if (room.isPrivate) {
      const isOwner = room.owner && room.owner.toString() === userIdStr;
      const isAdmin = (room.admins || []).some((a) => a.toString() === userIdStr);
      const isMember = (room.members || []).some((m) => m.toString() === userIdStr);

      if (!isOwner && !isAdmin && !isMember) {
        return {
          authorized: false,
          error: 'Access Denied: You are not an authorized member of this private conversation.',
          statusCode: 403,
          room
        };
      }
    }

    return { authorized: true, room };
  }

  // Memory mode fallback
  const room = memoryRooms.get(roomId);
  if (!room || room.deleted) {
    return { authorized: false, error: 'Room not found.', statusCode: 404 };
  }

  if (room.isPrivate) {
    const isOwner = room.owner === userIdStr;
    const isMember = (room.members || []).includes(userIdStr);
    if (!isOwner && !isMember) {
      return {
        authorized: false,
        error: 'Access Denied: You are not an authorized member of this private conversation.',
        statusCode: 403,
        room
      };
    }
  }

  return { authorized: true, room };
};

/**
 * Clean up expired or abandoned call sessions
 */
const cleanupInactiveCallSessions = async () => {
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

    if (isDBConnected()) {
      // 1. Terminate abandoned active calls older than 6 hours
      await CallSession.updateMany(
        { status: 'active', startedAt: { $lt: sixHoursAgo } },
        { $set: { status: 'ended', endedReason: 'abandoned', endedAt: new Date() } }
      );

      // 2. Terminate active calls where all participants left > 15m ago
      await CallSession.updateMany(
        {
          status: 'active',
          participants: { $not: { $elemMatch: { leftAt: null } } },
          updatedAt: { $lt: fifteenMinsAgo }
        },
        { $set: { status: 'ended', endedReason: 'completed', endedAt: new Date() } }
      );
    } else {
      for (const [, session] of memoryCallSessions.entries()) {
        if (session.status === 'active') {
          const isOld = new Date(session.startedAt) < sixHoursAgo;
          const activeParts = (session.participants || []).filter((p) => !p.leftAt);
          if (isOld || (activeParts.length === 0 && new Date(session.updatedAt || session.startedAt) < fifteenMinsAgo)) {
            session.status = 'ended';
            session.endedReason = isOld ? 'abandoned' : 'completed';
            session.endedAt = new Date();
          }
        }
      }
    }
  } catch (err) {
    logger.error(`[CallSessionController] cleanupInactiveCallSessions error: ${err.message}`);
  }
};

/**
 * @desc    Get or initiate an SFU call session and receive a signed Access Token
 * @route   POST /api/calls/token
 * @access  Private (JWT Protected)
 */
const getCallToken = async (req, res, next) => {
  try {
    const { roomId, callType = 'video' } = req.body;
    const user = req.user;

    if (!roomId) {
      return res.status(400).json({ success: false, message: 'Room/Conversation ID is required.' });
    }

    // Opportunistic cleanup of stale calls
    cleanupInactiveCallSessions().catch(() => {});

    // 1. Enforce Server-Side Authorization & Input Validation
    const authCheck = await authorizeRoomAccess(roomId, user);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode || 403).json({
        success: false,
        message: authCheck.error
      });
    }

    const safeCallType = callType === 'voice' ? 'voice' : 'video';
    const userIdStr = user._id ? user._id.toString() : String(user.id);
    const sfuRoomName = `sfu_room_${roomId}`;
    let session = null;

    // 2. Query or create active CallSession
    if (isDBConnected()) {
      session = await CallSession.findOne({
        conversationId: roomId,
        status: 'active'
      });

      if (!session) {
        const generatedCallId = `call_${roomId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        session = await CallSession.create({
          callId: generatedCallId,
          conversationId: roomId,
          creator: user._id,
          callType: safeCallType,
          status: 'active',
          sfuRoomName,
          participants: [
            {
              user: user._id,
              username: user.username,
              avatar: user.avatar,
              role: 'host',
              joinedAt: new Date()
            }
          ]
        });
      } else {
        // Add or update participant entry
        const existingPartIndex = session.participants.findIndex(
          (p) => p.user && p.user.toString() === userIdStr
        );
        if (existingPartIndex === -1) {
          session.participants.push({
            user: user._id,
            username: user.username,
            avatar: user.avatar,
            role: session.creator.toString() === userIdStr ? 'host' : 'participant',
            joinedAt: new Date()
          });
          await session.save();
        } else {
          session.participants[existingPartIndex].leftAt = null;
          session.participants[existingPartIndex].connectionStatus = 'connected';
          await session.save();
        }
      }
    } else {
      // Memory Store fallback
      session = Array.from(memoryCallSessions.values()).find(
        (s) => s.conversationId === roomId && s.status === 'active'
      );

      if (!session) {
        const generatedCallId = `call_${roomId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        session = {
          callId: generatedCallId,
          conversationId: roomId,
          creator: userIdStr,
          callType: safeCallType,
          status: 'active',
          sfuRoomName,
          participants: [
            {
              user: userIdStr,
              username: user.username,
              avatar: user.avatar,
              role: 'host',
              joinedAt: new Date()
            }
          ],
          startedAt: new Date()
        };
        memoryCallSessions.set(generatedCallId, session);
      } else {
        const existingIndex = session.participants.findIndex((p) => p.user === userIdStr);
        if (existingIndex === -1) {
          session.participants.push({
            user: userIdStr,
            username: user.username,
            avatar: user.avatar,
            role: session.creator === userIdStr ? 'host' : 'participant',
            joinedAt: new Date()
          });
        }
      }
    }

    // 3. Generate Signed SFU Token (15m Short-Lived)
    const tokenResult = await generateCallToken({
      identity: userIdStr,
      name: user.username || 'Participant',
      avatar: user.avatar || '',
      sfuRoomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      ttl: '15m'
    });

    const activeParticipants = (session.participants || []).filter(
      (p) => !p.leftAt && p.connectionStatus !== 'disconnected' && String(p.user?._id || p.user) !== userIdStr
    );

    return res.json({
      success: true,
      callId: session.callId,
      sfuUrl: tokenResult.sfuUrl,
      token: tokenResult.token,
      sfuRoomName: tokenResult.sfuRoomName,
      callType: session.callType,
      isHost: session.creator ? session.creator.toString() === userIdStr : false,
      participants: activeParticipants
    });
  } catch (error) {
    logger.error(`[CallSessionController] getCallToken error: ${error.message}`);
    next(error);
  }
};

/**
 * @desc    Get active call session details for a room
 * @route   GET /api/calls/room/:roomId/active
 * @access  Private (JWT Protected)
 */
const getActiveCall = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const authCheck = await authorizeRoomAccess(roomId, req.user);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        success: false,
        message: authCheck.error
      });
    }

    let activeCall = null;
    if (isDBConnected()) {
      activeCall = await CallSession.findOne({
        conversationId: roomId,
        status: 'active'
      })
        .populate('creator', 'username avatar')
        .populate('participants.user', 'username avatar customStatus');
    } else {
      activeCall = Array.from(memoryCallSessions.values()).find(
        (s) => s.conversationId === roomId && s.status === 'active'
      ) || null;
    }

    return res.json({
      success: true,
      activeCall
    });
  } catch (error) {
    logger.error(`[CallSessionController] getActiveCall error: ${error.message}`);
    next(error);
  }
};

/**
 * @desc    End an active call session with authorization check
 * @route   POST /api/calls/:callId/end
 * @access  Private (JWT Protected)
 */
const endCallSession = async (req, res, next) => {
  try {
    const { callId } = req.params;
    const userIdStr = req.user._id ? req.user._id.toString() : String(req.user.id);

    if (!callId || typeof callId !== 'string' || !/^call_[a-zA-Z0-9_-]+$/.test(callId)) {
      return res.status(400).json({ success: false, message: 'Invalid call session ID format.' });
    }

    let session = null;
    if (isDBConnected()) {
      session = await CallSession.findOne({ callId });
      if (!session) {
        return res.status(404).json({ success: false, message: 'Call session not found.' });
      }

      // Authorization Check: Must be creator/host or participant of this session
      const isCreator = session.creator && session.creator.toString() === userIdStr;
      const isParticipant = (session.participants || []).some(
        (p) => p.user && p.user.toString() === userIdStr
      );

      if (!isCreator && !isParticipant) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You are not authorized to terminate this call session.'
        });
      }

      session.status = 'ended';
      session.endedAt = new Date();
      session.duration = Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000));
      session.endedReason = isCreator ? 'host_ended' : 'completed';
      session.participants.forEach((p) => {
        if (!p.leftAt) p.leftAt = session.endedAt;
      });
      await session.save();
    } else {
      session = memoryCallSessions.get(callId);
      if (!session) {
        return res.status(404).json({ success: false, message: 'Call session not found.' });
      }

      const isCreator = session.creator === userIdStr;
      const isParticipant = (session.participants || []).some((p) => p.user === userIdStr);
      if (!isCreator && !isParticipant) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You are not authorized to terminate this call session.'
        });
      }

      session.status = 'ended';
      session.endedAt = new Date();
      session.duration = Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000));
      session.endedReason = isCreator ? 'host_ended' : 'completed';
    }

    return res.json({
      success: true,
      message: 'Call session ended successfully.',
      session
    });
  } catch (error) {
    logger.error(`[CallSessionController] endCallSession error: ${error.message}`);
    next(error);
  }
};

/**
 * @desc    Get paginated call history for a conversation
 * @route   GET /api/calls/room/:roomId/history
 * @access  Private (JWT Protected)
 */
const getRoomCallHistory = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const authCheck = await authorizeRoomAccess(roomId, req.user);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({ success: false, message: authCheck.error });
    }

    if (isDBConnected()) {
      const history = await CallSession.find({ conversationId: roomId })
        .populate('creator', 'username avatar email')
        .populate('participants.user', 'username avatar email')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

      return res.json({ success: true, history });
    } else {
      const history = Array.from(memoryCallSessions.values())
        .filter((s) => s.conversationId === roomId)
        .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
        .slice(0, 30);

      return res.json({ success: true, history });
    }
  } catch (error) {
    logger.error(`[CallSessionController] getRoomCallHistory error: ${error.message}`);
    next(error);
  }
};

module.exports = {
  authorizeRoomAccess,
  cleanupInactiveCallSessions,
  getCallToken,
  getActiveCall,
  endCallSession,
  getRoomCallHistory,
  memoryCallSessions
};
