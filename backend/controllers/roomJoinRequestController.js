const mongoose = require('mongoose');
const RoomJoinRequest = require('../models/RoomJoinRequest');
const Room = require('../models/Room');
const User = require('../models/User');
const {
  normalizeId,
  isPrivateRoom,
  isRoomOwner,
  isRoomAdmin,
  isRoomMember
} = require('../utils/roomAccess');
const { memoryRooms } = require('./roomController');
const { createNotification } = require('./notificationController');
const logger = require('../utils/logger');

// In-memory fallback store for join requests
const memoryJoinRequests = new Map();

const isDBConnected = () => mongoose.connection.readyState === 1;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const getUserId = (req) => (req.user?._id ? req.user._id.toString() : req.user?.id?.toString());

const getSocketIO = () => {
  try {
    return require('../socket/socket').getIO();
  } catch {
    return null;
  }
};

// Approved public profile fields for request reviews
const PUBLIC_USER_FIELDS = 'username fullName avatar bio status customStatus publicId createdAt';

/**
 * @desc    Get restricted preview of a room (for join requests)
 * @route   GET /api/rooms/:id/preview
 * @access  Private
 */
const getRoomPreview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (isDBConnected()) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({ message: 'Invalid room id' });
      }

      const room = await Room.findOne({ _id: id, isDeleted: { $ne: true } })
        .populate('owner', 'username fullName avatar publicId')
        .populate('createdBy', 'username fullName avatar publicId');

      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      const isMember = isRoomMember(room, userId);

      // Find user's latest join request (prefer pending, else latest)
      let userRequest = await RoomJoinRequest.findOne({ room: id, user: userId, status: 'pending' });
      if (!userRequest) {
        userRequest = await RoomJoinRequest.findOne({ room: id, user: userId }).sort({ createdAt: -1 });
      }

      return res.json({
        _id: room._id.toString(),
        id: room._id.toString(),
        name: room.name,
        category: room.category,
        description: room.description || '',
        icon: room.icon || '',
        visibility: room.visibility || (room.isPrivate ? 'private' : 'public'),
        isPrivate: isPrivateRoom(room),
        membersCount: room.members ? room.members.length : 0,
        owner: room.owner,
        createdBy: room.createdBy || room.owner,
        isMember,
        userRequest: userRequest ? {
          _id: userRequest._id.toString(),
          status: userRequest.status,
          createdAt: userRequest.createdAt,
          updatedAt: userRequest.updatedAt,
          decidedAt: userRequest.decidedAt,
          rejectionReason: userRequest.rejectionReason
        } : null
      });
    }

    // Memory fallback
    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const isMember = isRoomMember(room, userId);
    let userRequest = null;
    for (const reqObj of memoryJoinRequests.values()) {
      if (reqObj.room === id && reqObj.user === userId) {
        if (!userRequest || reqObj.status === 'pending' || new Date(reqObj.createdAt) > new Date(userRequest.createdAt)) {
          userRequest = reqObj;
        }
      }
    }

    return res.json({
      _id: room._id,
      id: room._id,
      name: room.name,
      category: room.category,
      description: room.description || '',
      icon: room.icon || '',
      visibility: room.visibility || (room.isPrivate ? 'private' : 'public'),
      isPrivate: isPrivateRoom(room),
      membersCount: room.members ? room.members.length : 0,
      owner: room.owner,
      createdBy: room.createdBy || room.owner,
      isMember,
      userRequest
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Submit a join request for a private room
 * @route   POST /api/rooms/:id/join-requests
 * @access  Private
 */
const createJoinRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (isDBConnected()) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({ message: 'Invalid room id' });
      }

      const room = await Room.findOne({ _id: id, isDeleted: { $ne: true } });
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      if (!isPrivateRoom(room)) {
        return res.status(400).json({
          message: 'This room is public. You can join directly without a request.',
          code: 'ROOM_IS_PUBLIC'
        });
      }

      if (isRoomMember(room, userId)) {
        return res.status(400).json({
          message: 'You are already a member of this room.',
          code: 'ALREADY_MEMBER'
        });
      }

      // Check for existing pending request
      const existing = await RoomJoinRequest.findOne({ room: id, user: userId, status: 'pending' });
      if (existing) {
        return res.status(409).json({
          message: 'You already have a pending join request for this room.',
          code: 'REQUEST_ALREADY_PENDING',
          request: existing
        });
      }

      let newRequest;
      try {
        newRequest = await RoomJoinRequest.create({
          room: id,
          user: userId,
          status: 'pending'
        });
      } catch (err) {
        if (err.code === 11000) {
          return res.status(409).json({
            message: 'You already have a pending join request for this room.',
            code: 'REQUEST_ALREADY_PENDING'
          });
        }
        throw err;
      }

      const populated = await RoomJoinRequest.findById(newRequest._id)
        .populate('user', PUBLIC_USER_FIELDS);

      // Real-time notification to room owner and admins
      const io = getSocketIO();
      if (io) {
        const ownerId = normalizeId(room.owner);
        const adminIds = (room.admins || []).map(normalizeId);
        const notifyTargets = new Set([ownerId, ...adminIds]);

        notifyTargets.forEach((targetId) => {
          io.to(`user:${targetId}`).emit('room_join_request_created', {
            requestId: populated._id.toString(),
            roomId: room._id.toString(),
            roomName: room.name,
            user: populated.user,
            createdAt: populated.createdAt
          });

          createNotification({
            recipient: targetId,
            sender: req.user,
            type: 'room_join_request',
            title: 'New Room Join Request',
            message: `${req.user?.username || 'A user'} requested to join "${room.name}".`,
            link: { screen: 'room', id: room._id.toString(), tab: 'requests' },
            data: { requestId: populated._id.toString(), roomId: room._id.toString(), roomName: room.name },
            dedupKey: `room_req_${populated._id}_${targetId}`
          }).catch(() => {});
        });
      }

      return res.status(201).json(populated);
    }

    // Memory fallback
    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!isPrivateRoom(room)) {
      return res.status(400).json({ message: 'This room is public.', code: 'ROOM_IS_PUBLIC' });
    }

    if (isRoomMember(room, userId)) {
      return res.status(400).json({ message: 'You are already a member of this room.', code: 'ALREADY_MEMBER' });
    }

    for (const r of memoryJoinRequests.values()) {
      if (r.room === id && r.user === userId && r.status === 'pending') {
        return res.status(409).json({
          message: 'You already have a pending join request for this room.',
          code: 'REQUEST_ALREADY_PENDING',
          request: r
        });
      }
    }

    const reqId = 'mem_req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const newReq = {
      _id: reqId,
      id: reqId,
      room: id,
      user: req.user || { _id: userId, username: 'Requester' },
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      rejectionReason: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    memoryJoinRequests.set(reqId, newReq);

    const io = getSocketIO();
    if (io) {
      io.to(`user:${room.owner}`).emit('room_join_request_created', {
        requestId: reqId,
        roomId: room._id,
        roomName: room.name,
        user: newReq.user,
        createdAt: newReq.createdAt
      });
    }

    return res.status(201).json(newReq);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List join requests for an owned or administered room
 * @route   GET /api/rooms/:id/join-requests?status=pending
 * @access  Private (Owner/Admins)
 */
const listRoomJoinRequests = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const statusFilter = req.query.status || 'pending';

    if (isDBConnected()) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({ message: 'Invalid room id' });
      }

      const room = await Room.findOne({ _id: id, isDeleted: { $ne: true } });
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      if (!isRoomAdmin(room, userId)) {
        return res.status(403).json({
          message: 'Only the room owner or administrators can review join requests.',
          code: 'FORBIDDEN'
        });
      }

      const query = { room: id };
      if (statusFilter && statusFilter !== 'all') {
        query.status = statusFilter;
      }

      const requests = await RoomJoinRequest.find(query)
        .populate('user', PUBLIC_USER_FIELDS)
        .sort({ createdAt: -1 });

      return res.json({ requests, count: requests.length });
    }

    // Memory fallback
    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!isRoomAdmin(room, userId)) {
      return res.status(403).json({
        message: 'Only the room owner or administrators can review join requests.',
        code: 'FORBIDDEN'
      });
    }

    const requests = Array.from(memoryJoinRequests.values())
      .filter((r) => r.room === id && (statusFilter === 'all' || r.status === statusFilter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ requests, count: requests.length });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    List current user's submitted join requests across rooms
 * @route   GET /api/rooms/join-requests/my
 * @access  Private
 */
const listMyJoinRequests = async (req, res, next) => {
  try {
    const userId = getUserId(req);

    if (isDBConnected()) {
      const requests = await RoomJoinRequest.find({ user: userId })
        .populate('room', 'name category icon visibility isPrivate')
        .sort({ createdAt: -1 });

      return res.json({ requests, count: requests.length });
    }

    const requests = Array.from(memoryJoinRequests.values())
      .filter((r) => (r.user?._id || r.user) === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ requests, count: requests.length });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel user's own pending join request
 * @route   DELETE /api/rooms/:id/join-requests/:requestId
 * @access  Private (Requester only)
 */
const cancelJoinRequest = async (req, res, next) => {
  try {
    const { id, requestId } = req.params;
    const userId = getUserId(req);

    if (isDBConnected()) {
      if (!isValidObjectId(id) || !isValidObjectId(requestId)) {
        return res.status(400).json({ message: 'Invalid ID format' });
      }

      const request = await RoomJoinRequest.findOne({ _id: requestId, room: id });
      if (!request) {
        return res.status(404).json({ message: 'Join request not found' });
      }

      if (request.user.toString() !== userId) {
        return res.status(403).json({
          message: 'You can only cancel your own join request.',
          code: 'FORBIDDEN'
        });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          message: `Cannot cancel request with status "${request.status}". Only pending requests can be cancelled.`,
          code: 'NOT_PENDING'
        });
      }

      request.status = 'cancelled';
      await request.save();

      // Real-time notification to room owner
      const room = await Room.findById(id);
      if (room) {
        const io = getSocketIO();
        if (io) {
          io.to(`user:${room.owner.toString()}`).emit('room_join_request_cancelled', {
            requestId: request._id.toString(),
            roomId: id
          });
        }
      }

      return res.json({ message: 'Join request cancelled successfully', request });
    }

    // Memory fallback
    const request = memoryJoinRequests.get(requestId);
    if (!request || request.room !== id) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    const reqUid = request.user?._id || request.user;
    if (reqUid !== userId) {
      return res.status(403).json({ message: 'You can only cancel your own request.', code: 'FORBIDDEN' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be cancelled.', code: 'NOT_PENDING' });
    }

    request.status = 'cancelled';
    request.updatedAt = new Date().toISOString();

    const room = memoryRooms.get(id);
    if (room) {
      const io = getSocketIO();
      if (io) {
        io.to(`user:${room.owner}`).emit('room_join_request_cancelled', {
          requestId: request._id,
          roomId: id
        });
      }
    }

    return res.json({ message: 'Join request cancelled successfully', request });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Approve a join request (atomically adds member and marks approved)
 * @route   POST /api/rooms/:id/join-requests/:requestId/approve
 * @access  Private (Owner/Admins)
 */
const approveJoinRequest = async (req, res, next) => {
  try {
    const { id, requestId } = req.params;
    const deciderId = getUserId(req);

    if (isDBConnected()) {
      if (!isValidObjectId(id) || !isValidObjectId(requestId)) {
        return res.status(400).json({ message: 'Invalid ID format' });
      }

      const room = await Room.findOne({ _id: id, isDeleted: { $ne: true } });
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      if (!isRoomAdmin(room, deciderId)) {
        return res.status(403).json({
          message: 'Only the room owner or administrators can approve join requests.',
          code: 'FORBIDDEN'
        });
      }

      const request = await RoomJoinRequest.findOne({ _id: requestId, room: id });
      if (!request) {
        return res.status(404).json({ message: 'Join request not found' });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          message: `Request is already ${request.status}. Only pending requests can be approved.`,
          code: 'NOT_PENDING'
        });
      }

      // 🔒 Concurrency-safe atomic membership update
      await Room.updateOne(
        { _id: id, isDeleted: { $ne: true } },
        { $addToSet: { members: request.user } }
      );

      request.status = 'approved';
      request.decidedBy = deciderId;
      request.decidedAt = new Date();
      await request.save();

      // Real-time event to the approved requester
      const io = getSocketIO();
      if (io) {
        io.to(`user:${request.user.toString()}`).emit('room_join_request_approved', {
          requestId: request._id.toString(),
          roomId: room._id.toString(),
          roomName: room.name
        });

        // Global update to inform clients that room member count updated
        io.emit('room_updated', {
          _id: room._id.toString(),
          id: room._id.toString(),
          name: room.name,
          visibility: room.visibility,
          isPrivate: room.isPrivate
        });
      }

      createNotification({
        recipient: request.user,
        sender: req.user,
        type: 'room_join_approved',
        title: 'Room Access Approved',
        message: `Your request to join "${room.name}" was approved!`,
        link: { screen: 'room', id: room._id.toString() },
        data: { roomId: room._id.toString(), roomName: room.name },
        dedupKey: `room_appr_${request._id}`
      }).catch(() => {});

      return res.json({
        message: 'Join request approved and member added successfully',
        request
      });
    }

    // Memory fallback
    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!isRoomAdmin(room, deciderId)) {
      return res.status(403).json({ message: 'Only owner/admin can approve.', code: 'FORBIDDEN' });
    }

    const request = memoryJoinRequests.get(requestId);
    if (!request || request.room !== id) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}.`, code: 'NOT_PENDING' });
    }

    const requesterId = request.user?._id || request.user;
    if (!room.members.includes(requesterId)) {
      room.members.push(requesterId);
    }

    request.status = 'approved';
    request.decidedBy = deciderId;
    request.decidedAt = new Date().toISOString();
    request.updatedAt = new Date().toISOString();

    const io = getSocketIO();
    if (io) {
      io.to(`user:${requesterId}`).emit('room_join_request_approved', {
        requestId: request._id,
        roomId: room._id,
        roomName: room.name
      });
    }

    return res.json({ message: 'Join request approved', request });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reject a join request (marks rejected without granting membership)
 * @route   POST /api/rooms/:id/join-requests/:requestId/reject
 * @access  Private (Owner/Admins)
 */
const rejectJoinRequest = async (req, res, next) => {
  try {
    const { id, requestId } = req.params;
    const deciderId = getUserId(req);
    const { reason } = req.body;

    if (isDBConnected()) {
      if (!isValidObjectId(id) || !isValidObjectId(requestId)) {
        return res.status(400).json({ message: 'Invalid ID format' });
      }

      const room = await Room.findOne({ _id: id, isDeleted: { $ne: true } });
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      if (!isRoomAdmin(room, deciderId)) {
        return res.status(403).json({
          message: 'Only the room owner or administrators can reject join requests.',
          code: 'FORBIDDEN'
        });
      }

      const request = await RoomJoinRequest.findOne({ _id: requestId, room: id });
      if (!request) {
        return res.status(404).json({ message: 'Join request not found' });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          message: `Request is already ${request.status}. Only pending requests can be rejected.`,
          code: 'NOT_PENDING'
        });
      }

      request.status = 'rejected';
      request.decidedBy = deciderId;
      request.decidedAt = new Date();
      request.rejectionReason = typeof reason === 'string' ? reason.slice(0, 200) : '';
      await request.save();

      // Real-time event to the rejected requester
      const io = getSocketIO();
      if (io) {
        io.to(`user:${request.user.toString()}`).emit('room_join_request_rejected', {
          requestId: request._id.toString(),
          roomId: room._id.toString(),
          roomName: room.name,
          reason: request.rejectionReason
        });
      }

      createNotification({
        recipient: request.user,
        sender: req.user,
        type: 'room_join_rejected',
        title: 'Room Join Request Declined',
        message: `Your request to join "${room.name}" was declined.`,
        link: { screen: 'room', id: room._id.toString() },
        data: { roomId: room._id.toString(), roomName: room.name },
        dedupKey: `room_rej_${request._id}`
      }).catch(() => {});

      return res.json({
        message: 'Join request rejected',
        request
      });
    }

    // Memory fallback
    const room = memoryRooms.get(id);
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!isRoomAdmin(room, deciderId)) {
      return res.status(403).json({ message: 'Only owner/admin can reject.', code: 'FORBIDDEN' });
    }

    const request = memoryJoinRequests.get(requestId);
    if (!request || request.room !== id) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}.`, code: 'NOT_PENDING' });
    }

    request.status = 'rejected';
    request.decidedBy = deciderId;
    request.decidedAt = new Date().toISOString();
    request.rejectionReason = typeof reason === 'string' ? reason.slice(0, 200) : '';
    request.updatedAt = new Date().toISOString();

    const requesterId = request.user?._id || request.user;
    const io = getSocketIO();
    if (io) {
      io.to(`user:${requesterId}`).emit('room_join_request_rejected', {
        requestId: request._id,
        roomId: room._id,
        roomName: room.name,
        reason: request.rejectionReason
      });
    }

    return res.json({ message: 'Join request rejected', request });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRoomPreview,
  createJoinRequest,
  listRoomJoinRequests,
  listMyJoinRequests,
  cancelJoinRequest,
  approveJoinRequest,
  rejectJoinRequest,
  memoryJoinRequests
};

