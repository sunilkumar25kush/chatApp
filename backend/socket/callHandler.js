const mongoose = require('mongoose');
const CallSession = require('../models/CallSession');
const Message = require('../models/Message');
const { authorizeRoomAccess, memoryCallSessions } = require('../controllers/callSessionController');
const logger = require('../utils/logger');

const isDBConnected = () => mongoose.connection.readyState === 1;

/**
 * Modular Socket.IO handler for multi-user SFU calling orchestration
 * with server-side authorization, input validation, and impersonation protection.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
module.exports = (io, socket) => {
  const user = socket.user;
  const userIdStr = user?._id ? user._id.toString() : user?.id ? String(user.id) : null;

  // ── 1. Start a Multi-User Call ──────────────────────────────────────────
  socket.on('call:start', async ({ roomId, callType = 'video' }, ack) => {
    try {
      if (!user || !userIdStr) {
        if (typeof ack === 'function') ack({ success: false, error: 'Authentication required' });
        return;
      }
      if (!roomId) {
        if (typeof ack === 'function') ack({ success: false, error: 'roomId is required' });
        return;
      }

      // Input Validation
      const safeCallType = callType === 'voice' ? 'voice' : 'video';

      // 1. Authorize user for this room (validates membership & private room rules)
      const authCheck = await authorizeRoomAccess(roomId, user);
      if (!authCheck.authorized) {
        if (typeof ack === 'function') ack({ success: false, error: authCheck.error });
        socket.emit('call:error', { roomId, message: authCheck.error });
        return;
      }

      const sfuRoomName = `sfu_room_${roomId}`;
      let session = null;

      if (isDBConnected()) {
        session = await CallSession.findOne({ conversationId: roomId, status: 'active' });

        if (!session) {
          const callId = `call_${roomId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          session = await CallSession.create({
            callId,
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
                socketId: socket.id,
                role: 'host',
                joinedAt: new Date(),
                connectionStatus: 'connected'
              }
            ]
          });
        }
      } else {
        session = Array.from(memoryCallSessions.values()).find(
          (s) => s.conversationId === roomId && s.status === 'active'
        );

        if (!session) {
          const callId = `call_${roomId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          session = {
            callId,
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
                socketId: socket.id,
                role: 'host',
                joinedAt: new Date(),
                connectionStatus: 'connected'
              }
            ],
            startedAt: new Date()
          };
          memoryCallSessions.set(callId, session);
        }
      }

      // Join socket to call room
      socket.join(session.callId);
      socket.currentCallId = session.callId;
      socket.currentCallRoomId = roomId;

      logger.socket(`Call started: ${session.callId} in room ${roomId} by ${user.username}`);

      // Broadcast to room members that a call has started
      io.to(roomId).emit('call:started', {
        callId: session.callId,
        roomId,
        callType: session.callType,
        creator: { _id: userIdStr, username: user.username, avatar: user.avatar },
        sfuRoomName: session.sfuRoomName,
        participants: session.participants
      });

      // Ring all other room members
      socket.to(roomId).emit('call:incoming', {
        callId: session.callId,
        roomId,
        roomName: authCheck.room?.name || 'Room',
        callType: session.callType,
        caller: { _id: userIdStr, username: user.username, avatar: user.avatar }
      });

      if (typeof ack === 'function') {
        ack({
          success: true,
          callId: session.callId,
          sfuRoomName: session.sfuRoomName,
          callSession: session
        });
      }
    } catch (err) {
      logger.error(`[CallHandler] call:start error: ${err.message}`);
      if (typeof ack === 'function') ack({ success: false, error: 'Internal call error' });
    }
  });

  // ── 2. Join a Call ──────────────────────────────────────────────────────
  socket.on('call:join', async ({ callId, roomId }, ack) => {
    try {
      if (!user || !userIdStr) {
        if (typeof ack === 'function') ack({ success: false, error: 'Authentication required' });
        return;
      }
      if (!callId || !roomId) {
        if (typeof ack === 'function') ack({ success: false, error: 'callId and roomId are required' });
        return;
      }

      // 1. Authorize room membership
      const authCheck = await authorizeRoomAccess(roomId, user);
      if (!authCheck.authorized) {
        if (typeof ack === 'function') ack({ success: false, error: authCheck.error });
        return;
      }

      let session = null;
      let participantObj = null;

      if (isDBConnected()) {
        session = await CallSession.findOne({ callId, status: 'active' });
        if (!session) {
          if (typeof ack === 'function') ack({ success: false, error: 'Active call session not found' });
          return;
        }

        // 2. Validate that the call session strictly matches the requested roomId
        if (session.conversationId.toString() !== roomId.toString()) {
          if (typeof ack === 'function') ack({ success: false, error: 'Security violation: Call session does not match room conversation' });
          return;
        }

        const pIndex = session.participants.findIndex(
          (p) => p.user && p.user.toString() === userIdStr
        );

        if (pIndex === -1) {
          session.participants.push({
            user: user._id,
            username: user.username,
            avatar: user.avatar,
            socketId: socket.id,
            role: session.creator.toString() === userIdStr ? 'host' : 'participant',
            joinedAt: new Date(),
            leftAt: null,
            connectionStatus: 'connected'
          });
          await session.save();
          participantObj = session.participants[session.participants.length - 1];
        } else {
          session.participants[pIndex].socketId = socket.id;
          session.participants[pIndex].leftAt = null;
          session.participants[pIndex].connectionStatus = 'connected';
          await session.save();
          participantObj = session.participants[pIndex];
        }
      } else {
        session = memoryCallSessions.get(callId);
        if (!session || session.status !== 'active') {
          if (typeof ack === 'function') ack({ success: false, error: 'Active call session not found' });
          return;
        }

        if (session.conversationId !== roomId) {
          if (typeof ack === 'function') ack({ success: false, error: 'Security violation: Call session does not match room conversation' });
          return;
        }

        const pIndex = session.participants.findIndex((p) => p.user === userIdStr);
        if (pIndex === -1) {
          participantObj = {
            user: userIdStr,
            username: user.username,
            avatar: user.avatar,
            socketId: socket.id,
            role: session.creator === userIdStr ? 'host' : 'participant',
            joinedAt: new Date(),
            leftAt: null,
            connectionStatus: 'connected'
          };
          session.participants.push(participantObj);
        } else {
          session.participants[pIndex].socketId = socket.id;
          session.participants[pIndex].leftAt = null;
          session.participants[pIndex].connectionStatus = 'connected';
          participantObj = session.participants[pIndex];
        }
      }

      socket.join(callId);
      socket.currentCallId = callId;
      socket.currentCallRoomId = roomId;

      logger.socket(`User ${user.username} (${userIdStr}) joined call ${callId}`);

      // Broadcast participant joined to all other participants
      socket.to(callId).emit('call:participant_joined', {
        callId,
        roomId,
        participant: {
          user: {
            _id: userIdStr,
            username: user.username,
            avatar: user.avatar
          },
          username: user.username,
          avatar: user.avatar,
          role: participantObj.role,
          audioMuted: participantObj.audioMuted || false,
          videoDisabled: participantObj.videoDisabled || false
        }
      });

      if (typeof ack === 'function') {
        ack({
          success: true,
          callId,
          callSession: session
        });
      }
    } catch (err) {
      logger.error(`[CallHandler] call:join error: ${err.message}`);
      if (typeof ack === 'function') ack({ success: false, error: 'Internal join error' });
    }
  });

  // ── 3. Toggle Microphone, Camera, or Screen Share State ─────────────────
  socket.on('call:toggle_media', async ({ callId, roomId, mediaType, enabled }) => {
    try {
      if (!userIdStr || !callId || !roomId) return;

      // Validate mediaType
      if (!['audio', 'video', 'screenshare'].includes(mediaType)) return;
      const isEnabled = Boolean(enabled);

      if (isDBConnected()) {
        const session = await CallSession.findOne({ callId, status: 'active' });
        if (!session) return;
        if (session.conversationId.toString() !== roomId.toString()) return;

        // Verify that the user is an active participant in this session
        const p = session.participants.find(
          (item) => item.user && item.user.toString() === userIdStr && !item.leftAt
        );
        if (!p) return;

        if (mediaType === 'audio') p.audioMuted = !isEnabled;
        if (mediaType === 'video') p.videoDisabled = !isEnabled;
        await session.save();
      } else {
        const session = memoryCallSessions.get(callId);
        if (!session || session.status !== 'active') return;
        if (session.conversationId !== roomId) return;
        const p = (session.participants || []).find((item) => item.user === userIdStr && !item.leftAt);
        if (!p) return;
        if (mediaType === 'audio') p.audioMuted = !isEnabled;
        if (mediaType === 'video') p.videoDisabled = !isEnabled;
      }

      // Impersonation Guard: userId emitted is strictly userIdStr from server session
      io.to(roomId).emit('call:media_changed', {
        callId,
        roomId,
        userId: userIdStr,
        mediaType,
        enabled: isEnabled
      });
    } catch (err) {
      logger.error(`[CallHandler] call:toggle_media error: ${err.message}`);
    }
  });

  // ── 4. Leave Call ───────────────────────────────────────────────────────
  const handleParticipantLeave = async (callId, roomId) => {
    if (!callId || !userIdStr) return;

    try {
      let remainingActive = 0;
      let session = null;

      if (isDBConnected()) {
        session = await CallSession.findOne({ callId, status: 'active' });
        if (!session) return;

        const p = session.participants.find((item) => item.user && item.user.toString() === userIdStr);
        if (p) {
          p.leftAt = new Date();
          p.connectionStatus = 'disconnected';
          p.socketId = null;
        }

        remainingActive = session.participants.filter((item) => !item.leftAt).length;

        if (remainingActive === 0) {
          const joinedCount = session.participants.filter((item) => item.joinedAt).length;
          const isMissed = joinedCount <= 1 && (!session.duration || session.duration < 5);
          session.status = isMissed ? 'missed' : 'ended';
          session.endedReason = isMissed ? 'missed' : 'completed';
          session.endedAt = new Date();
          session.duration = Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000));
        }
        await session.save();

        if (session.status === 'ended' || session.status === 'missed') {
          const sysMsg = await Message.create({
            room: roomId,
            sender: session.creator,
            content: JSON.stringify({
              callId: session.callId,
              conversationId: roomId,
              type: session.callType,
              isGroup: (session.participants || []).length > 2,
              status: session.status,
              duration: session.duration,
              endedReason: session.endedReason,
              participantsCount: session.participants.length,
              startedAt: session.startedAt,
              endedAt: session.endedAt
            }),
            fileType: 'call'
          });
          const populatedMsg = await Message.findById(sysMsg._id).populate(
            'sender',
            'username email avatar customStatus'
          );
          io.to(roomId).emit('receive_message', populatedMsg);
        }
      } else {
        session = memoryCallSessions.get(callId);
        if (!session) return;

        const p = session.participants.find((item) => item.user === userIdStr);
        if (p) {
          p.leftAt = new Date();
          p.connectionStatus = 'disconnected';
          p.socketId = null;
        }

        remainingActive = session.participants.filter((item) => !item.leftAt).length;
        if (remainingActive === 0) {
          session.status = 'ended';
          session.endedAt = new Date();
          session.duration = Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000));
        }
      }

      socket.leave(callId);
      if (socket.currentCallId === callId) {
        socket.currentCallId = null;
        socket.currentCallRoomId = null;
      }

      logger.socket(`User ${user?.username} (${userIdStr}) left call ${callId}`);

      io.to(callId).emit('call:participant_left', {
        callId,
        roomId,
        userId: userIdStr,
        username: user?.username,
        remainingActive
      });

      if (remainingActive === 0) {
        io.to(roomId).emit('call:ended', {
          callId,
          roomId,
          duration: session?.duration || 0
        });
      }
    } catch (err) {
      logger.error(`[CallHandler] handleParticipantLeave error: ${err.message}`);
    }
  };

  socket.on('call:leave', async ({ callId, roomId }) => {
    await handleParticipantLeave(callId, roomId);
  });

  // ── 4b. Decline / Reject Call ───────────────────────────────────────────
  socket.on('call:decline', async ({ callId, roomId }) => {
    if (!user || !userIdStr || !callId || !roomId) return;

    // Verify room access
    const authCheck = await authorizeRoomAccess(roomId, user);
    if (!authCheck.authorized) return;

    logger.socket(`User ${user?.username} declined call ${callId}`);
    try {
      if (isDBConnected()) {
        const session = await CallSession.findOne({ callId, status: 'active' });
        if (session && session.conversationId.toString() === roomId.toString()) {
          session.status = 'declined';
          session.endedReason = 'declined';
          session.endedAt = new Date();
          await session.save();

          const sysMsg = await Message.create({
            room: roomId,
            sender: session.creator,
            content: JSON.stringify({
              callId: session.callId,
              conversationId: roomId,
              type: session.callType,
              isGroup: false,
              status: 'declined',
              duration: 0,
              endedReason: 'declined',
              declinedBy: user?.username,
              startedAt: session.startedAt,
              endedAt: session.endedAt
            }),
            fileType: 'call'
          });
          const populatedMsg = await Message.findById(sysMsg._id).populate(
            'sender',
            'username email avatar customStatus'
          );
          io.to(roomId).emit('receive_message', populatedMsg);
        }
      }
    } catch (e) {
      logger.error(`[CallHandler] decline error: ${e.message}`);
    }

    io.to(roomId).emit('call:declined', {
      callId,
      roomId,
      userId: userIdStr,
      username: user?.username,
      reason: 'declined'
    });
  });

  // ── 4c. Recipient Busy ──────────────────────────────────────────────────
  socket.on('call:busy', async ({ callId, roomId }) => {
    if (!user || !userIdStr || !callId || !roomId) return;

    const authCheck = await authorizeRoomAccess(roomId, user);
    if (!authCheck.authorized) return;

    logger.socket(`User ${user?.username} reported busy for call ${callId}`);
    try {
      if (isDBConnected()) {
        const session = await CallSession.findOne({ callId, status: 'active' });
        if (session && session.conversationId.toString() === roomId.toString()) {
          session.status = 'declined';
          session.endedReason = 'busy';
          session.endedAt = new Date();
          await session.save();

          const sysMsg = await Message.create({
            room: roomId,
            sender: session.creator,
            content: JSON.stringify({
              callId: session.callId,
              conversationId: roomId,
              type: session.callType,
              isGroup: false,
              status: 'busy',
              duration: 0,
              endedReason: 'busy',
              busyUser: user?.username,
              startedAt: session.startedAt,
              endedAt: session.endedAt
            }),
            fileType: 'call'
          });
          const populatedMsg = await Message.findById(sysMsg._id).populate(
            'sender',
            'username email avatar customStatus'
          );
          io.to(roomId).emit('receive_message', populatedMsg);
        }
      }
    } catch (e) {
      logger.error(`[CallHandler] busy error: ${e.message}`);
    }

    io.to(roomId).emit('call:busy', {
      callId,
      roomId,
      userId: userIdStr,
      username: user?.username,
      reason: 'busy'
    });
  });

  // ── 5. End Call for Everyone (Strict Host / Admin Action) ───────────────
  socket.on('call:end', async ({ callId, roomId }) => {
    try {
      if (!callId || !userIdStr || !roomId) return;

      const authCheck = await authorizeRoomAccess(roomId, user);
      if (!authCheck.authorized) return;

      let duration = 0;
      if (isDBConnected()) {
        const session = await CallSession.findOne({ callId, status: 'active' });
        if (!session) return;
        if (session.conversationId.toString() !== roomId.toString()) return;

        // Authorization Check: Must be the creator of the call or room owner/admin
        const isCreator = session.creator && session.creator.toString() === userIdStr;
        const isRoomOwner = authCheck.room && authCheck.room.owner && authCheck.room.owner.toString() === userIdStr;
        const isRoomAdmin = authCheck.room && (authCheck.room.admins || []).some((a) => a.toString() === userIdStr);

        if (!isCreator && !isRoomOwner && !isRoomAdmin) {
          logger.warn(`[CallHandler] Unauthorized call:end attempt by user ${user?.username} (${userIdStr}) on call ${callId}`);
          socket.emit('call:error', { roomId, message: 'Forbidden: Only the call host or room admin can end the meeting for everyone.' });
          return;
        }

        session.status = 'ended';
        session.endedAt = new Date();
        session.duration = Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000));
        duration = session.duration;
        session.endedReason = 'host_ended';
        session.participants.forEach((p) => {
          if (!p.leftAt) p.leftAt = session.endedAt;
        });
        await session.save();

        try {
          const sysMsg = await Message.create({
            room: roomId,
            sender: session.creator,
            content: JSON.stringify({
              type: session.callType,
              status: 'completed',
              duration
            }),
            fileType: 'call'
          });
          const populatedMsg = await Message.findById(sysMsg._id).populate(
            'sender',
            'username email avatar customStatus'
          );
          io.to(roomId).emit('receive_message', populatedMsg);
        } catch (mErr) {
          logger.error(`[CallHandler] call:end message error: ${mErr.message}`);
        }
      } else {
        const session = memoryCallSessions.get(callId);
        if (!session || session.status !== 'active') return;
        if (session.conversationId !== roomId) return;

        const isCreator = session.creator === userIdStr;
        if (!isCreator) {
          socket.emit('call:error', { roomId, message: 'Forbidden: Only the call host can end the meeting for everyone.' });
          return;
        }

        session.status = 'ended';
        session.endedAt = new Date();
        session.duration = Math.max(0, Math.round((session.endedAt - session.startedAt) / 1000));
        duration = session.duration;
        session.endedReason = 'host_ended';
      }

      logger.socket(`Call ${callId} ended by host ${user?.username}`);

      io.to(roomId).emit('call:ended', {
        callId,
        roomId,
        duration,
        endedBy: user?.username
      });
    } catch (err) {
      logger.error(`[CallHandler] call:end error: ${err.message}`);
    }
  });

  // ── 6. Disconnect Cleanup ───────────────────────────────────────────────
  socket.on('disconnect', async () => {
    if (socket.currentCallId && socket.currentCallRoomId) {
      await handleParticipantLeave(socket.currentCallId, socket.currentCallRoomId);
    }
  });
};
