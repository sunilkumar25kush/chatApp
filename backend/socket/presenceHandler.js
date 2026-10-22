const User = require('../models/User');
const logger = require('../utils/logger');

// Track online users mapping userId -> Set of socket IDs
const onlineUsers = new Map();

/**
 * Handles presence (Online/Offline/Away/Busy/Invisible) updates.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
module.exports = (io, socket) => {
  const userId = socket.user?._id ? socket.user._id.toString() : socket.user?.id;

  if (userId) {
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // If this is the first connection for the user, update DB and broadcast online
    if (onlineUsers.get(userId).size === 1) {
      updateStatus(userId, 'online');
    }
  }

  // Away
  socket.on('user_away', () => {
    if (userId) updateStatus(userId, 'away');
  });

  // Active (Return from Away)
  socket.on('user_active', () => {
    if (userId) updateStatus(userId, 'online');
  });

  // Busy (Do Not Disturb — Gajim-style)
  socket.on('user_busy', () => {
    if (userId) updateStatus(userId, 'busy');
  });

  // Invisible (stay connected but appear offline)
  socket.on('user_invisible', () => {
    if (userId) updateStatus(userId, 'invisible');
  });

  // Custom presence broadcast (status + text)
  socket.on('presence_update', ({ status }) => {
    if (!userId) return;
    if (['online', 'away', 'busy', 'invisible', 'offline'].includes(status)) {
      updateStatus(userId, status);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (userId && onlineUsers.has(userId)) {
      const userSockets = onlineUsers.get(userId);
      userSockets.delete(socket.id);

      // If no sockets left, user is offline
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
        updateStatus(userId, 'offline', Date.now());
      }
    }
  });

  // Helper to update DB and emit
  async function updateStatus(uid, status, lastSeen = null) {
    try {
      const updateData = { status };
      if (lastSeen) {
        updateData.lastSeen = lastSeen;
      }

      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(uid) && !String(uid).startsWith('mem_')) {
        await User.findByIdAndUpdate(uid, updateData);
      }

      io.emit('user_status_changed', {
        userId: uid,
        status,
        lastSeen: lastSeen || Date.now()
      });
      logger.socket(`User ${uid} is now ${status}`);
    } catch (err) {
      logger.error(`[Presence] Error updating status: ${err.message}`);
    }
  }
};
