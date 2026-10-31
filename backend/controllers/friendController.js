const mongoose = require('mongoose');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { isValidPublicId, normalizePublicId } = require('../utils/publicId');
const { memoryUsers } = require('./authController');
const { createNotification } = require('./notificationController');
const logger = require('../utils/logger');

// In-memory fallback store when MongoDB is not connected
const memoryFriendships = new Map();

const isDBConnected = () => mongoose.connection.readyState === 1;

const getUserId = (req) => (req.user?._id ? req.user._id.toString() : req.user?.id?.toString());

// Approved public profile fields for friendship listings & previews
const PUBLIC_PROFILE_FIELDS = 'publicId username fullName avatar bio status customStatus lastSeen createdAt';

const sanitizeUser = (user) => {
  if (!user) return null;
  return {
    _id: user._id?.toString() || user.id?.toString(),
    publicId: user.publicId,
    username: user.username,
    fullName: user.fullName || '',
    avatar: user.avatar,
    bio: user.bio || '',
    status: user.status || 'offline',
    customStatus: user.customStatus || { text: '', emoji: '' },
    lastSeen: user.lastSeen,
    createdAt: user.createdAt
  };
};

/**
 * @desc    Send a friend request by Public ID or Target User ID
 * @route   POST /api/friends/request
 * @access  Private
 */
const sendFriendRequest = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { publicId, targetUserId } = req.body;

    if (!publicId && !targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid public user ID (e.g. SKY-XXXXXX) or user ID'
      });
    }

    let targetUser = null;

    if (publicId) {
      if (!isValidPublicId(publicId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid public ID format. Expected format: SKY-XXXXXX'
        });
      }
      const normalized = normalizePublicId(publicId);

      if (isDBConnected()) {
        targetUser = await User.findOne({ publicId: normalized });
      }
      if (!targetUser && memoryUsers) {
        for (const u of memoryUsers.values()) {
          if (u.publicId === normalized) {
            targetUser = u;
            break;
          }
        }
      }
    } else if (targetUserId) {
      if (isDBConnected() && mongoose.Types.ObjectId.isValid(targetUserId)) {
        targetUser = await User.findById(targetUserId);
      }
      if (!targetUser && memoryUsers) {
        targetUser = memoryUsers.get(String(targetUserId));
      }
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found with the provided identifier'
      });
    }

    const resolvedTargetId = targetUser._id ? targetUser._id.toString() : targetUser.id.toString();

    // Prevent self-requests
    if (resolvedTargetId === currentUserId) {
      return res.status(400).json({
        success: false,
        code: 'SELF_REQUEST',
        message: 'You cannot send a friend request to yourself'
      });
    }

    const pairKey = Friendship.makePairKey(currentUserId, resolvedTargetId);

    // Database mode
    if (isDBConnected()) {
      let existing = await Friendship.findOne({ pairKey });

      if (existing) {
        if (existing.status === 'accepted') {
          return res.status(400).json({
            success: false,
            code: 'ALREADY_FRIENDS',
            message: 'You are already friends with this user'
          });
        }

        if (existing.status === 'pending') {
          if (existing.requester.toString() === currentUserId) {
            return res.status(400).json({
              success: false,
              code: 'REQUEST_ALREADY_SENT',
              message: 'You have already sent a friend request to this user'
            });
          } else {
            return res.status(400).json({
              success: false,
              code: 'INCOMING_REQUEST_EXISTS',
              message: 'This user has already sent you a friend request. You can accept it.'
            });
          }
        }

        // If previously rejected, allow re-requesting by resetting to pending
        if (existing.status === 'rejected') {
          existing.status = 'pending';
          existing.requester = currentUserId;
          existing.recipient = resolvedTargetId;
          existing.acceptedAt = null;
          await existing.save();

          await existing.populate('requester', PUBLIC_PROFILE_FIELDS);
          await existing.populate('recipient', PUBLIC_PROFILE_FIELDS);

          // Emit real-time notification
          const io = req.app.get('io');
          if (io) {
            io.to(`user:${resolvedTargetId}`).emit('friend_request_received', {
              request: existing,
              sender: sanitizeUser(req.user)
            });
          }

          createNotification({
            recipient: resolvedTargetId,
            sender: req.user,
            type: 'friend_request',
            title: 'New Friend Request',
            message: `${req.user.fullName || req.user.username} sent you a friend request.`,
            link: { screen: 'friends', tab: 'pending' },
            data: { requestId: existing._id.toString(), senderPublicId: req.user.publicId },
            dedupKey: `friend_req_${existing._id}`
          }).catch(() => {});

          return res.status(201).json({
            success: true,
            message: 'Friend request sent successfully',
            request: existing
          });
        }
      }

      // Safe creation with duplicate key handling
      try {
        const newRequest = await Friendship.create({
          requester: currentUserId,
          recipient: resolvedTargetId,
          pairKey,
          status: 'pending'
        });

        await newRequest.populate('requester', PUBLIC_PROFILE_FIELDS);
        await newRequest.populate('recipient', PUBLIC_PROFILE_FIELDS);

        // Emit real-time notification
        const io = req.app.get('io');
        if (io) {
          io.to(`user:${resolvedTargetId}`).emit('friend_request_received', {
            request: newRequest,
            sender: sanitizeUser(req.user)
          });
        }

        createNotification({
          recipient: resolvedTargetId,
          sender: req.user,
          type: 'friend_request',
          title: 'New Friend Request',
          message: `${req.user.fullName || req.user.username} sent you a friend request.`,
          link: { screen: 'friends', tab: 'pending' },
          data: { requestId: newRequest._id.toString(), senderPublicId: req.user.publicId },
          dedupKey: `friend_req_${newRequest._id}`
        }).catch(() => {});

        return res.status(201).json({
          success: true,
          message: 'Friend request sent successfully',
          request: newRequest
        });
      } catch (err) {
        if (err.code === 11000) {
          return res.status(409).json({
            success: false,
            code: 'CONCURRENT_REQUEST',
            message: 'A friendship relationship between these users is already being processed'
          });
        }
        throw err;
      }
    } else {
      // Memory fallback mode
      let existing = memoryFriendships.get(pairKey);
      if (existing) {
        if (existing.status === 'accepted') {
          return res.status(400).json({ success: false, code: 'ALREADY_FRIENDS', message: 'You are already friends with this user' });
        }
        if (existing.status === 'pending') {
          if (existing.requester === currentUserId) {
            return res.status(400).json({ success: false, code: 'REQUEST_ALREADY_SENT', message: 'You have already sent a friend request to this user' });
          } else {
            return res.status(400).json({ success: false, code: 'INCOMING_REQUEST_EXISTS', message: 'This user has already sent you a friend request. You can accept it.' });
          }
        }
        if (existing.status === 'rejected') {
          existing.status = 'pending';
          existing.requester = currentUserId;
          existing.recipient = resolvedTargetId;
          existing.updatedAt = new Date().toISOString();
          return res.status(201).json({ success: true, message: 'Friend request sent successfully', request: existing });
        }
      }

      const id = 'mem_fr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const memRequest = {
        _id: id,
        requester: sanitizeUser(req.user),
        recipient: sanitizeUser(targetUser),
        pairKey,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      memoryFriendships.set(pairKey, memRequest);

      const io = req.app.get('io');
      if (io) {
        io.to(`user:${resolvedTargetId}`).emit('friend_request_received', {
          request: memRequest,
          sender: sanitizeUser(req.user)
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Friend request sent successfully',
        request: memRequest
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List incoming pending friend requests
 * @route   GET /api/friends/requests/incoming
 * @access  Private
 */
const getIncomingRequests = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (isDBConnected()) {
      const requests = await Friendship.find({
        recipient: currentUserId,
        status: 'pending'
      })
        .populate('requester', PUBLIC_PROFILE_FIELDS)
        .sort({ createdAt: -1 });

      return res.json({
        success: true,
        count: requests.length,
        requests
      });
    } else {
      const requests = [];
      for (const rel of memoryFriendships.values()) {
        const recId = rel.recipient?._id || rel.recipient;
        if (recId === currentUserId && rel.status === 'pending') {
          requests.push(rel);
        }
      }
      return res.json({ success: true, count: requests.length, requests });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List outgoing pending friend requests
 * @route   GET /api/friends/requests/outgoing
 * @access  Private
 */
const getOutgoingRequests = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (isDBConnected()) {
      const requests = await Friendship.find({
        requester: currentUserId,
        status: 'pending'
      })
        .populate('recipient', PUBLIC_PROFILE_FIELDS)
        .sort({ createdAt: -1 });

      return res.json({
        success: true,
        count: requests.length,
        requests
      });
    } else {
      const requests = [];
      for (const rel of memoryFriendships.values()) {
        const reqId = rel.requester?._id || rel.requester;
        if (reqId === currentUserId && rel.status === 'pending') {
          requests.push(rel);
        }
      }
      return res.json({ success: true, count: requests.length, requests });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Accept a friend request
 * @route   PUT /api/friends/requests/:id/accept
 * @access  Private
 */
const acceptFriendRequest = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { id } = req.params;

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid request ID' });
      }

      const request = await Friendship.findById(id);
      if (!request) {
        return res.status(404).json({ success: false, message: 'Friend request not found' });
      }

      // Security check: Only the recipient can accept the request
      if (request.recipient.toString() !== currentUserId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Only the recipient can accept a friend request'
        });
      }

      if (request.status === 'accepted') {
        return res.status(400).json({
          success: false,
          code: 'ALREADY_ACCEPTED',
          message: 'Friend request has already been accepted'
        });
      }

      if (request.status === 'rejected') {
        return res.status(400).json({
          success: false,
          code: 'CANNOT_ACCEPT_REJECTED',
          message: 'Cannot accept a rejected friend request'
        });
      }

      request.status = 'accepted';
      request.acceptedAt = new Date();
      await request.save();

      await request.populate('requester', PUBLIC_PROFILE_FIELDS);
      await request.populate('recipient', PUBLIC_PROFILE_FIELDS);

      // Real-time notifications
      const io = req.app.get('io');
      if (io) {
        // Notify the requester that their request was accepted
        io.to(`user:${request.requester._id}`).emit('friend_request_accepted', {
          request,
          friend: sanitizeUser(request.recipient)
        });
        // Notify any other tabs of the recipient
        io.to(`user:${request.recipient._id}`).emit('friend_request_accepted', {
          request,
          friend: sanitizeUser(request.requester)
        });
      }

      createNotification({
        recipient: request.requester._id || request.requester,
        sender: req.user,
        type: 'friend_accepted',
        title: 'Friend Request Accepted',
        message: `${req.user.fullName || req.user.username} accepted your friend request.`,
        link: { screen: 'direct', id: req.user.publicId },
        data: { friendPublicId: req.user.publicId },
        dedupKey: `friend_acc_${request._id}`
      }).catch(() => {});

      return res.json({
        success: true,
        message: 'Friend request accepted',
        request
      });
    } else {
      // Memory mode
      let found = null;
      for (const rel of memoryFriendships.values()) {
        if (rel._id === id) {
          found = rel;
          break;
        }
      }
      if (!found) {
        return res.status(404).json({ success: false, message: 'Friend request not found' });
      }
      const recId = found.recipient?._id || found.recipient;
      if (recId !== currentUserId) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Only the recipient can accept a friend request' });
      }
      found.status = 'accepted';
      found.acceptedAt = new Date().toISOString();

      const io = req.app.get('io');
      if (io) {
        const reqUserId = found.requester?._id || found.requester;
        io.to(`user:${reqUserId}`).emit('friend_request_accepted', { request: found, friend: sanitizeUser(req.user) });
      }

      return res.json({ success: true, message: 'Friend request accepted', request: found });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reject a friend request
 * @route   PUT /api/friends/requests/:id/reject
 * @access  Private
 */
const rejectFriendRequest = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { id } = req.params;

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid request ID' });
      }

      const request = await Friendship.findById(id);
      if (!request) {
        return res.status(404).json({ success: false, message: 'Friend request not found' });
      }

      // Security check: Only the recipient can reject
      if (request.recipient.toString() !== currentUserId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Only the recipient can reject a friend request'
        });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Can only reject pending friend requests'
        });
      }

      request.status = 'rejected';
      await request.save();

      const io = req.app.get('io');
      if (io) {
        io.to(`user:${request.requester}`).emit('friend_request_rejected', {
          requestId: request._id
        });
      }

      return res.json({
        success: true,
        message: 'Friend request rejected'
      });
    } else {
      let found = null;
      for (const rel of memoryFriendships.values()) {
        if (rel._id === id) {
          found = rel;
          break;
        }
      }
      if (!found) {
        return res.status(404).json({ success: false, message: 'Friend request not found' });
      }
      const recId = found.recipient?._id || found.recipient;
      if (recId !== currentUserId) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Only the recipient can reject a friend request' });
      }
      found.status = 'rejected';
      return res.json({ success: true, message: 'Friend request rejected' });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel an outgoing friend request
 * @route   DELETE /api/friends/requests/:id
 * @access  Private
 */
const cancelFriendRequest = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { id } = req.params;

    if (isDBConnected()) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid request ID' });
      }

      const request = await Friendship.findById(id);
      if (!request) {
        return res.status(404).json({ success: false, message: 'Friend request not found' });
      }

      // Security check: Only the requester can cancel
      if (request.requester.toString() !== currentUserId) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Only the requester can cancel their friend request'
        });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending requests can be cancelled'
        });
      }

      const recipientId = request.recipient.toString();
      await Friendship.findByIdAndDelete(id);

      const io = req.app.get('io');
      if (io) {
        io.to(`user:${recipientId}`).emit('friend_request_cancelled', {
          requestId: id
        });
      }

      return res.json({
        success: true,
        message: 'Friend request cancelled successfully'
      });
    } else {
      let foundKey = null;
      let found = null;
      for (const [key, rel] of memoryFriendships.entries()) {
        if (rel._id === id) {
          foundKey = key;
          found = rel;
          break;
        }
      }
      if (!found) {
        return res.status(404).json({ success: false, message: 'Friend request not found' });
      }
      const reqId = found.requester?._id || found.requester;
      if (reqId !== currentUserId) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Only the requester can cancel their friend request' });
      }
      memoryFriendships.delete(foundKey);
      return res.json({ success: true, message: 'Friend request cancelled successfully' });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List all accepted friends for the current user
 * @route   GET /api/friends
 * @access  Private
 */
const getFriends = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (isDBConnected()) {
      const friendships = await Friendship.find({
        $or: [
          { requester: currentUserId },
          { recipient: currentUserId }
        ],
        status: 'accepted'
      })
        .populate('requester', PUBLIC_PROFILE_FIELDS)
        .populate('recipient', PUBLIC_PROFILE_FIELDS)
        .sort({ acceptedAt: -1, updatedAt: -1 });

      const friends = friendships.map((rel) => {
        const isRequester = rel.requester._id.toString() === currentUserId;
        const friendUser = isRequester ? rel.recipient : rel.requester;

        return {
          friendshipId: rel._id,
          friend: sanitizeUser(friendUser),
          acceptedAt: rel.acceptedAt,
          createdAt: rel.createdAt
        };
      });

      return res.json({
        success: true,
        count: friends.length,
        friends
      });
    } else {
      const friends = [];
      for (const rel of memoryFriendships.values()) {
        if (rel.status === 'accepted') {
          const reqId = rel.requester?._id || rel.requester;
          const recId = rel.recipient?._id || rel.recipient;
          if (reqId === currentUserId) {
            friends.push({
              friendshipId: rel._id,
              friend: sanitizeUser(rel.recipient),
              acceptedAt: rel.acceptedAt,
              createdAt: rel.createdAt
            });
          } else if (recId === currentUserId) {
            friends.push({
              friendshipId: rel._id,
              friend: sanitizeUser(rel.requester),
              acceptedAt: rel.acceptedAt,
              createdAt: rel.createdAt
            });
          }
        }
      }
      return res.json({ success: true, count: friends.length, friends });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove an accepted friend
 * @route   DELETE /api/friends/:friendId
 * @access  Private
 */
const removeFriend = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { friendId } = req.params;

    if (!friendId) {
      return res.status(400).json({ success: false, message: 'Target friend ID is required' });
    }

    if (isDBConnected()) {
      let targetUserId = friendId;

      // Check if friendId is a publicId
      if (isValidPublicId(friendId)) {
        const u = await User.findOne({ publicId: normalizePublicId(friendId) }).select('_id');
        if (u) targetUserId = u._id.toString();
      }

      let friendship = null;

      // 1. Try resolving by friendship ID
      if (mongoose.Types.ObjectId.isValid(friendId)) {
        friendship = await Friendship.findOne({
          _id: friendId,
          $or: [{ requester: currentUserId }, { recipient: currentUserId }],
          status: 'accepted'
        });
      }

      // 2. Try resolving by pairKey with targetUserId
      if (!friendship && mongoose.Types.ObjectId.isValid(targetUserId)) {
        const pairKey = Friendship.makePairKey(currentUserId, targetUserId);
        friendship = await Friendship.findOne({ pairKey, status: 'accepted' });
      }

      if (!friendship) {
        return res.status(404).json({
          success: false,
          message: 'Friend relationship not found or already removed'
        });
      }

      const otherUserId = friendship.requester.toString() === currentUserId
        ? friendship.recipient.toString()
        : friendship.requester.toString();

      await Friendship.findByIdAndDelete(friendship._id);

      // Real-time notifications to both parties
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${otherUserId}`).emit('friend_removed', {
          friendId: currentUserId
        });
        io.to(`user:${currentUserId}`).emit('friend_removed', {
          friendId: otherUserId
        });
      }

      return res.json({
        success: true,
        message: 'Friend removed successfully'
      });
    } else {
      let foundKey = null;
      let otherId = null;
      for (const [key, rel] of memoryFriendships.entries()) {
        const reqId = rel.requester?._id || rel.requester;
        const recId = rel.recipient?._id || rel.recipient;
        if (
          (rel._id === friendId || reqId === friendId || recId === friendId) &&
          (reqId === currentUserId || recId === currentUserId) &&
          rel.status === 'accepted'
        ) {
          foundKey = key;
          otherId = reqId === currentUserId ? recId : reqId;
          break;
        }
      }
      if (!foundKey) {
        return res.status(404).json({ success: false, message: 'Friend relationship not found' });
      }
      memoryFriendships.delete(foundKey);

      const io = req.app.get('io');
      if (io && otherId) {
        io.to(`user:${otherId}`).emit('friend_removed', { friendId: currentUserId });
      }

      return res.json({ success: true, message: 'Friend removed successfully' });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get relationship status with a target user (by publicId or userId)
 * @route   GET /api/friends/status/:targetId
 * @access  Private
 */
const getRelationshipStatus = async (req, res, next) => {
  try {
    const currentUserId = getUserId(req);
    const { targetId } = req.params;

    let targetUser = null;

    if (isValidPublicId(targetId)) {
      const normalized = normalizePublicId(targetId);
      if (isDBConnected()) {
        targetUser = await User.findOne({ publicId: normalized });
      }
      if (!targetUser && memoryUsers) {
        for (const u of memoryUsers.values()) {
          if (u.publicId === normalized) {
            targetUser = u;
            break;
          }
        }
      }
    } else {
      if (isDBConnected() && mongoose.Types.ObjectId.isValid(targetId)) {
        targetUser = await User.findById(targetId);
      }
      if (!targetUser && memoryUsers) {
        targetUser = memoryUsers.get(String(targetId));
      }
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const resolvedTargetId = targetUser._id ? targetUser._id.toString() : targetUser.id.toString();

    // Check if target is self
    if (resolvedTargetId === currentUserId) {
      return res.json({
        success: true,
        relationship: { status: 'self' },
        user: sanitizeUser(targetUser)
      });
    }

    const pairKey = Friendship.makePairKey(currentUserId, resolvedTargetId);

    if (isDBConnected()) {
      const rel = await Friendship.findOne({ pairKey });

      if (!rel) {
        return res.json({
          success: true,
          relationship: { status: 'none' },
          user: sanitizeUser(targetUser)
        });
      }

      if (rel.status === 'accepted') {
        return res.json({
          success: true,
          relationship: {
            status: 'accepted',
            friendshipId: rel._id,
            acceptedAt: rel.acceptedAt
          },
          user: sanitizeUser(targetUser)
        });
      }

      if (rel.status === 'pending') {
        const isRequester = rel.requester.toString() === currentUserId;
        return res.json({
          success: true,
          relationship: {
            status: isRequester ? 'pending_outgoing' : 'pending_incoming',
            requestId: rel._id,
            createdAt: rel.createdAt
          },
          user: sanitizeUser(targetUser)
        });
      }

      if (rel.status === 'rejected') {
        return res.json({
          success: true,
          relationship: {
            status: 'rejected',
            requestId: rel._id
          },
          user: sanitizeUser(targetUser)
        });
      }
    } else {
      const rel = memoryFriendships.get(pairKey);
      if (!rel) {
        return res.json({ success: true, relationship: { status: 'none' }, user: sanitizeUser(targetUser) });
      }
      const reqId = rel.requester?._id || rel.requester;
      if (rel.status === 'accepted') {
        return res.json({ success: true, relationship: { status: 'accepted', friendshipId: rel._id }, user: sanitizeUser(targetUser) });
      }
      if (rel.status === 'pending') {
        const isRequester = reqId === currentUserId;
        return res.json({ success: true, relationship: { status: isRequester ? 'pending_outgoing' : 'pending_incoming', requestId: rel._id }, user: sanitizeUser(targetUser) });
      }
      return res.json({ success: true, relationship: { status: 'rejected' }, user: sanitizeUser(targetUser) });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendFriendRequest,
  getIncomingRequests,
  getOutgoingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  getFriends,
  removeFriend,
  getRelationshipStatus,
  memoryFriendships
};

