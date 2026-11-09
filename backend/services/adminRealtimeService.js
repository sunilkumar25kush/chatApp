/**
 * Realtime helpers that lazily resolve the Socket.IO instance.
 * Lazy require avoids circular imports with socket handlers.
 */
const getSocket = () => {
  try {
    const { getIO } = require('../socket/socket');
    return getIO();
  } catch {
    return null;
  }
};

const emitToUser = (userId, event, payload) => {
  if (!userId) return false;
  const io = getSocket();
  if (!io) return false;
  io.to(`user:${userId}`).emit(event, payload);
  return true;
};

const emitToRoom = (roomId, event, payload) => {
  if (!roomId) return false;
  const io = getSocket();
  if (!io) return false;
  io.to(String(roomId)).emit(event, payload);
  return true;
};

const emitToConversation = (conversationId, event, payload) => {
  if (!conversationId) return false;
  const io = getSocket();
  if (!io) return false;
  io.to(`conv:${conversationId}`).emit(event, payload);
  return true;
};

/**
 * Immediately force all live sockets for a user to disconnect.
 * The client receives the reason before the transport closes.
 */
const disconnectUserSockets = (userId, payload = { reason: 'account_suspended' }) => {
  if (!userId) return false;
  const io = getSocket();
  if (!io) return false;
  const room = `user:${userId}`;
  io.to(room).emit('account_status_changed', payload);
  io.in(room).disconnectSockets(true);
  return true;
};

/**
 * Force-end a LiveKit call session from the admin panel.
 * This only ends the logical session and notifies participants; it never
 * touches media streams or recording data.
 */
const forceEndCallSession = ({ callId, roomId, sessionId, reason }) => {
  const io = getSocket();
  if (!io) return false;
  const payload = {
    callId,
    sessionId,
    reason,
    message: 'This call was ended by a platform administrator.',
    forced: true
  };
  if (callId) {
    io.to(callId).emit('call:force_ended', payload);
    io.to(callId).emit('call:ended', payload);
  }
  if (roomId) {
    io.to(roomId).emit('call:force_ended', payload);
    io.to(roomId).emit('call:ended', payload);
    io.to(roomId).emit('call_ended');
    io.to(roomId).emit('video_call_ended');
  }
  return true;
};

const getOnlineUserIds = () => {
  try {
    const presence = require('../socket/presenceHandler');
    return typeof presence.getOnlineUserIds === 'function' ? presence.getOnlineUserIds() : [];
  } catch {
    return [];
  }
};

const getOnlineCount = () => {
  try {
    const presence = require('../socket/presenceHandler');
    return typeof presence.getOnlineCount === 'function' ? presence.getOnlineCount() : 0;
  } catch {
    return 0;
  }
};

module.exports = {
  getSocket,
  emitToUser,
  emitToRoom,
  emitToConversation,
  disconnectUserSockets,
  forceEndCallSession,
  getOnlineUserIds,
  getOnlineCount
};
