const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authRoutes = require('./authRoutes');
const googleAuthRoutes = require('./googleAuthRoutes');
const userRoutes = require('./userRoutes');
const friendRoutes = require('./friendRoutes');
const conversationRoutes = require('./conversationRoutes');
const roomRoutes = require('./roomRoutes');
const roomJoinRequestRoutes = require('./roomJoinRequestRoutes');
const messageRoutes = require('./messageRoutes');
const uploadRoutes = require('./uploadRoutes');
const notificationRoutes = require('./notificationRoutes');

// Health check endpoint
router.get('/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.status(200).json({
    status: 'success',
    database: isConnected ? 'connected' : 'connecting',
    message: 'ChatRoom Backend API is operational',
    timestamp: new Date().toISOString()
  });
});

// Authentication routes
router.use('/auth', authRoutes);
// Google OAuth route (POST /api/auth/google)
router.use('/auth', googleAuthRoutes);

// User Profile routes
router.use('/users', userRoutes);

// Friendship & Friend Request routes
router.use('/friends', friendRoutes);

// Direct One-on-One Conversations & Messaging
router.use('/conversations', conversationRoutes);
router.use('/direct-messages', conversationRoutes);

// Room Management routes
router.use('/rooms', roomRoutes);

// Room Join Request routes (convenience root)
router.use('/room-requests', roomJoinRequestRoutes);

// Message routes
router.use('/messages', messageRoutes);

// File Upload routes
router.use('/upload', uploadRoutes);

// Persistent Notifications routes
router.use('/notifications', notificationRoutes);

module.exports = router;
