const mongoose = require('mongoose');
const Room = require('../models/Room');
const User = require('../models/User');
const RoomJoinRequest = require('../models/RoomJoinRequest');
const Report = require('../models/Report');
const { recordAudit } = require('../services/adminAuditService');
const { notifyUser } = require('../services/userModerationService');
const { getSettings } = require('../services/settingsService');
const { hasPermission, PERMISSIONS } = require('../utils/adminPermissions');
const {
  escapeRegex,
  isValidObjectId,
  parsePagination,
  buildPagination,
  requireString,
  parseDate,
  sanitizeText
} = require('../utils/adminValidation');

const CATEGORIES = ['General', 'Tech', 'Gaming', 'Music', 'Random', 'Custom'];

const canInspectPrivate = (admin) => hasPermission(admin, PERMISSIONS.ROOMS_VIEW_PRIVATE);

const publicRoomFields = 'name code category visibility isPrivate owner createdBy members admins icon maxMembers isDeleted deletedAt isSuspended suspendedAt suspendedReason moderation createdAt updatedAt';

const listRooms = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = parsePagination(req.query, {
      allowedSorts: ['createdAt', 'updatedAt', 'name', 'maxMembers'],
      defaultSort: 'createdAt',
      defaultLimit: 20,
      maxLimit: 100
    });

    const filter = {};
    const status = req.query.status || 'active';
    if (status === 'active') {
      filter.isDeleted = { $ne: true };
      filter.isSuspended = { $ne: true };
    } else if (status === 'suspended') {
      filter.isDeleted = { $ne: true };
      filter.isSuspended = true;
    } else if (status === 'deleted') {
      filter.isDeleted = true;
    }

    if (req.query.visibility === 'public' || req.query.visibility === 'private') {
      if (req.query.visibility === 'private') {
        filter.$or = [{ isPrivate: true }, { visibility: 'private' }];
      } else {
        filter.isPrivate = { $ne: true };
        filter.visibility = { $ne: 'private' };
      }
    }
    if (req.query.category && CATEGORIES.includes(req.query.category)) {
      filter.category = req.query.category;
    }
    if (req.query.search) {
      const search = escapeRegex(String(req.query.search).slice(0, 100));
      filter.$and = [
        ...(filter.$and || []),
        { $or: [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }] }
      ];
    }
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    const total = await Room.countDocuments(filter);
    const rooms = await Room.find(filter)
      .sort({ [sort]: order })
      .skip(skip)
      .limit(limit)
      .select(`${publicRoomFields}`)
      .populate('owner', 'username fullName avatar publicId accountStatus')
      .populate('createdBy', 'username fullName avatar publicId')
      .lean();

    const data = rooms.map((room) => {
      const isPrivate = Boolean(room.isPrivate || room.visibility === 'private');
      return {
        _id: room._id,
        name: room.name,
        code: room.code,
        category: room.category,
        visibility: isPrivate ? 'private' : 'public',
        isPrivate,
        owner: room.owner,
        createdBy: room.createdBy,
        icon: room.icon,
        maxMembers: room.maxMembers,
        memberCount: (room.members || []).length,
        adminCount: (room.admins || []).length,
        isSuspended: Boolean(room.isSuspended),
        isDeleted: Boolean(room.isDeleted),
        suspendedReason: room.suspendedReason,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        restricted: isPrivate && !canInspectPrivate(req.admin)
      };
    });

    return res.json({ success: true, data, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

const getRoomDetail = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }
    const room = await Room.findById(req.params.id)
      .populate('owner', 'username fullName avatar publicId accountStatus email')
      .populate('createdBy', 'username fullName avatar publicId')
      .populate('members', 'username fullName avatar publicId accountStatus')
      .populate('admins', 'username fullName avatar publicId accountStatus')
      .lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const isPrivate = Boolean(room.isPrivate || room.visibility === 'private');
    const restricted = isPrivate && !canInspectPrivate(req.admin);

    if (restricted) {
      return res.json({
        success: true,
        restricted: true,
        data: {
          _id: room._id,
          name: room.name,
          code: room.code,
          category: room.category,
          visibility: 'private',
          isPrivate: true,
          owner: room.owner,
          createdBy: room.createdBy,
          icon: room.icon,
          maxMembers: room.maxMembers,
          memberCount: (room.members || []).length,
          adminCount: (room.admins || []).length,
          isSuspended: Boolean(room.isSuspended),
          isDeleted: Boolean(room.isDeleted),
          suspendedReason: room.suspendedReason,
          createdAt: room.createdAt,
          updatedAt: room.updatedAt
        }
      });
    }

    let reason = '';
    if (isPrivate) {
      reason = sanitizeText(req.query.reason || '', 500);
      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'A reason is required to inspect private room details'
        });
      }
      await recordAudit({
        req,
        admin: req.admin,
        action: 'room.private.inspect',
        targetType: 'room',
        targetId: room._id.toString(),
        reason,
        metadata: { roomName: room.name }
      });
    }

    const [pendingJoinRequests, reports, messageCount] = await Promise.all([
      RoomJoinRequest.countDocuments({ room: room._id, status: 'pending' }),
      Report.countDocuments({ room: room._id, status: { $in: ['pending', 'under_review', 'escalated'] } }),
      mongoose.model('Message').countDocuments({ room: room._id, isDeleted: { $ne: true } })
    ]);

    return res.json({
      success: true,
      data: {
        ...room,
        isPrivate,
        visibility: isPrivate ? 'private' : 'public',
        memberCount: (room.members || []).length,
        adminCount: (room.admins || []).length,
        pendingJoinRequests,
        openReports: reports,
        messageCount
      }
    });
  } catch (error) {
    return next(error);
  }
};

const updateRoom = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.isDeleted) {
      return res.status(400).json({ success: false, message: 'Deleted rooms cannot be edited' });
    }

    const isPrivate = Boolean(room.isPrivate || room.visibility === 'private');
    const settings = await getSettings();
    const updates = {};
    const changedFields = [];

    if (typeof req.body.name === 'string') {
      const check = requireString(req.body.name, { field: 'Room name', min: 1, max: 80 });
      if (!check.ok) return res.status(400).json({ success: false, message: check.message });
      updates.name = check.value;
      changedFields.push('name');
    }
    if (typeof req.body.description === 'string') {
      if (isPrivate && !canInspectPrivate(req.admin)) {
        return res.status(403).json({ success: false, message: 'Private room content requires elevated permission' });
      }
      updates.description = sanitizeText(req.body.description, 300);
      changedFields.push('description');
    }
    if (typeof req.body.category === 'string') {
      if (!CATEGORIES.includes(req.body.category)) {
        return res.status(400).json({ success: false, message: 'Invalid room category' });
      }
      updates.category = req.body.category;
      changedFields.push('category');
    }
    if (req.body.visibility === 'public' || req.body.visibility === 'private') {
      updates.visibility = req.body.visibility;
      updates.isPrivate = req.body.visibility === 'private';
      changedFields.push('visibility');
    }
    if (req.body.maxMembers !== undefined) {
      const max = Number(req.body.maxMembers);
      const memberCount = (room.members || []).length;
      if (!Number.isFinite(max) || max < memberCount || max < 2) {
        return res.status(400).json({ success: false, message: 'Max members cannot be lower than the current member count' });
      }
      updates.maxMembers = Math.min(Math.round(max), settings.maxRoomMembers || 500);
      changedFields.push('maxMembers');
    }
    if (typeof req.body.reason === 'string') {
      updates['moderation.reason'] = sanitizeText(req.body.reason, 500);
    }

    if (!changedFields.length) {
      return res.status(400).json({ success: false, message: 'No editable room fields supplied' });
    }

    const updated = await Room.findByIdAndUpdate(
      room._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('owner', 'username fullName avatar publicId accountStatus');

    await recordAudit({
      req,
      admin: req.admin,
      action: 'room.update',
      targetType: 'room',
      targetId: room._id.toString(),
      reason: sanitizeText(req.body.reason || '', 500),
      metadata: { fields: changedFields }
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    return next(error);
  }
};

const suspendRoom = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }
    const reasonCheck = requireString(req.body?.reason, { field: 'Reason', min: 3, max: 500 });
    if (!reasonCheck.ok) return res.status(400).json({ success: false, message: reasonCheck.message });

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedReason: reasonCheck.value,
          'moderation.action': 'suspend',
          'moderation.reason': reasonCheck.value,
          'moderation.by': req.admin._id,
          'moderation.at': new Date()
        }
      },
      { new: true, runValidators: true }
    );
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    await notifyUser(room.owner, {
      title: 'Room suspended',
      message: `Your room "${room.name}" was suspended. Reason: ${reasonCheck.value}`,
      data: { roomId: room._id.toString(), action: 'room_suspend' }
    });
    await recordAudit({
      req,
      admin: req.admin,
      action: 'room.suspend',
      targetType: 'room',
      targetId: room._id.toString(),
      reason: reasonCheck.value
    });

    return res.json({ success: true, data: room });
  } catch (error) {
    return next(error);
  }
};

const restoreRoom = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isSuspended: false,
          suspendedAt: null,
          suspendedReason: '',
          'moderation.action': 'restore',
          'moderation.reason': sanitizeText(req.body?.reason || '', 500),
          'moderation.by': req.admin._id,
          'moderation.at': new Date()
        }
      },
      { new: true }
    );
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    await notifyUser(room.owner, {
      title: 'Room restored',
      message: `Your room "${room.name}" has been restored.`,
      data: { roomId: room._id.toString(), action: 'room_restore' }
    });
    await recordAudit({
      req,
      admin: req.admin,
      action: 'room.restore',
      targetType: 'room',
      targetId: room._id.toString(),
      reason: sanitizeText(req.body?.reason || '', 500)
    });

    return res.json({ success: true, data: room });
  } catch (error) {
    return next(error);
  }
};

const deleteRoom = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }
    if (String(req.body?.confirmation || '') !== 'DELETE') {
      return res.status(400).json({ success: false, message: 'Type DELETE in the confirmation field to remove this room' });
    }
    const reasonCheck = requireString(req.body?.reason, { field: 'Reason', min: 3, max: 500 });
    if (!reasonCheck.ok) return res.status(400).json({ success: false, message: reasonCheck.message });

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          'moderation.action': 'delete',
          'moderation.reason': reasonCheck.value,
          'moderation.by': req.admin._id,
          'moderation.at': new Date()
        }
      },
      { new: true }
    );
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    await notifyUser(room.owner, {
      title: 'Room removed',
      message: `Your room "${room.name}" was removed by a platform administrator. Reason: ${reasonCheck.value}`,
      data: { roomId: room._id.toString(), action: 'room_delete' }
    });
    await recordAudit({
      req,
      admin: req.admin,
      action: 'room.delete',
      targetType: 'room',
      targetId: room._id.toString(),
      reason: reasonCheck.value,
      metadata: { softDelete: true }
    });

    return res.json({ success: true, data: room });
  } catch (error) {
    return next(error);
  }
};

const transferRoomOwnership = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }
    const { newOwnerId } = req.body || {};
    if (!isValidObjectId(newOwnerId)) {
      return res.status(400).json({ success: false, message: 'A valid new owner is required' });
    }
    const reasonCheck = requireString(req.body?.reason, { field: 'Reason', min: 3, max: 500 });
    if (!reasonCheck.ok) return res.status(400).json({ success: false, message: reasonCheck.message });

    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.isDeleted) {
      return res.status(400).json({ success: false, message: 'Deleted rooms cannot change ownership' });
    }
    if (String(room.owner) === String(newOwnerId)) {
      return res.status(400).json({ success: false, message: 'This user already owns the room' });
    }

    const isMember = (room.members || []).some((m) => String(m) === String(newOwnerId));
    if (!isMember) {
      return res.status(400).json({ success: false, message: 'The new owner must be an existing room member' });
    }
    const newOwner = await User.findById(newOwnerId).select('username accountStatus');
    if (!newOwner || newOwner.accountStatus === 'deleted') {
      return res.status(400).json({ success: false, message: 'The new owner account is not available' });
    }

    const previousOwner = room.owner;
    room.owner = newOwnerId;
    room.admins = Array.from(new Set([...(room.admins || []).map(String), String(previousOwner)]));
    room.admins = Array.from(new Set([...room.admins.map(String), String(newOwnerId)]));
    room.members = Array.from(new Set([...(room.members || []).map(String), String(newOwnerId)]));
    room.moderation = {
      action: 'transfer',
      reason: reasonCheck.value,
      by: req.admin._id,
      at: new Date()
    };
    await room.save();

    await notifyUser(previousOwner, {
      title: 'Room ownership transferred',
      message: `Ownership of "${room.name}" was transferred to ${newOwner.username}.`,
      data: { roomId: room._id.toString(), action: 'room_transfer' }
    });
    await notifyUser(newOwnerId, {
      title: 'You are now a room owner',
      message: `You are now the owner of "${room.name}".`,
      data: { roomId: room._id.toString(), action: 'room_transfer' }
    });
    await recordAudit({
      req,
      admin: req.admin,
      action: 'room.transfer_ownership',
      targetType: 'room',
      targetId: room._id.toString(),
      reason: reasonCheck.value,
      metadata: { previousOwner: String(previousOwner), newOwner: String(newOwnerId) }
    });

    return res.json({ success: true, data: room });
  } catch (error) {
    return next(error);
  }
};

const getRoomMembers = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }
    const room = await Room.findById(req.params.id)
      .select('name isPrivate visibility members admins owner')
      .lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const isPrivate = Boolean(room.isPrivate || room.visibility === 'private');
    let reason = '';
    if (isPrivate) {
      if (!canInspectPrivate(req.admin)) {
        return res.status(403).json({ success: false, message: 'Private room membership requires elevated permission' });
      }
      reason = sanitizeText(req.query.reason || '', 500);
      if (!reason) {
        return res.status(400).json({ success: false, message: 'A reason is required to inspect private room members' });
      }
      await recordAudit({
        req,
        admin: req.admin,
        action: 'room.private.members.inspect',
        targetType: 'room',
        targetId: room._id.toString(),
        reason,
        metadata: { roomName: room.name }
      });
    }

    const members = await User.find({ _id: { $in: room.members || [] } })
      .select('username fullName avatar publicId accountStatus lastSeen')
      .lean();

    return res.json({ success: true, data: members });
  } catch (error) {
    return next(error);
  }
};

const getRoomJoinRequests = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const filter = { room: req.params.id };
    if (['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const total = await RoomJoinRequest.countDocuments(filter);
    const requests = await RoomJoinRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'username fullName avatar publicId accountStatus createdAt')
      .populate('decidedBy', 'username fullName avatar publicId')
      .lean();

    return res.json({ success: true, data: requests, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

const getRoomReports = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid room ID' });
    }
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const filter = { room: req.params.id };
    const total = await Report.countDocuments(filter);
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('targetType category status priority createdAt reporter targetUser')
      .populate('reporter', 'username fullName avatar publicId')
      .lean();
    return res.json({ success: true, data: reports, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listRooms,
  getRoomDetail,
  updateRoom,
  suspendRoom,
  restoreRoom,
  deleteRoom,
  transferRoomOwnership,
  getRoomMembers,
  getRoomJoinRequests,
  getRoomReports
};
