const mongoose = require('mongoose');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const DirectMessage = require('../models/DirectMessage');
const Friendship = require('../models/Friendship');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const CallSession = require('../models/CallSession');
const {
  suspendUser,
  banUser,
  restoreUser,
  deleteUser,
  revokeUserSessions,
  sanitizeUser
} = require('../services/userModerationService');
const { recordAudit } = require('../services/adminAuditService');
const { getOnlineUserIds } = require('../services/adminRealtimeService');
const {
  escapeRegex,
  isValidObjectId,
  parsePagination,
  buildPagination,
  requireString,
  parseDate,
  sanitizeText
} = require('../utils/adminValidation');

const USER_STATUSES = ['active', 'suspended', 'banned', 'deleted'];

const buildUserQuery = (query) => {
  const filter = {};
  if (query.search) {
    const search = escapeRegex(String(query.search).slice(0, 100));
    filter.$or = [
      { username: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { publicId: { $regex: search, $options: 'i' } }
    ];
  }
  if (query.status && USER_STATUSES.includes(query.status)) {
    filter.accountStatus = query.status;
  }
  if (query.provider && ['local', 'google'].includes(query.provider)) {
    filter.provider = query.provider;
  }
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  return filter;
};

/**
 * GET /api/admin/users
 */
const listUsers = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = parsePagination(req.query, {
      allowedSorts: ['createdAt', 'lastSeen', 'username', 'email', 'accountStatus', 'lastLoginAt'],
      defaultSort: 'createdAt',
      defaultLimit: 20,
      maxLimit: 100
    });

    const filter = buildUserQuery(req.query);

    if (req.query.online === 'true') {
      const onlineIds = getOnlineUserIds().filter((id) => mongoose.Types.ObjectId.isValid(id));
      filter._id = { $in: onlineIds };
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ [sort]: order })
      .skip(skip)
      .limit(limit)
      .select('username fullName email avatar publicId accountStatus suspendedUntil status provider lastSeen lastLoginAt createdAt moderation')
      .lean();

    const onlineSet = new Set(getOnlineUserIds());
    const data = users.map((user) => ({
      ...user,
      isOnline: onlineSet.has(String(user._id))
    }));

    return res.json({
      success: true,
      data,
      pagination: buildPagination(total, page, limit)
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/users/:id
 */
const getUserDetail = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const userId = user._id;
    const [
      roomsOwned,
      roomMessages,
      directMessages,
      acceptedFriends,
      pendingReports,
      reportsAgainst,
      activeCalls,
      moderationHistory
    ] = await Promise.all([
      Room.countDocuments({ owner: userId, isDeleted: { $ne: true } }),
      Message.countDocuments({ sender: userId }),
      DirectMessage.countDocuments({ sender: userId }),
      Friendship.countDocuments({
        status: 'accepted',
        $or: [{ requester: userId }, { recipient: userId }]
      }),
      Report.countDocuments({ targetUser: userId, status: { $in: ['pending', 'under_review', 'escalated'] } }),
      Report.countDocuments({ targetUser: userId }),
      CallSession.countDocuments({ 'participants.user': userId, status: { $in: ['ringing', 'active'] } }),
      AuditLog.find({ targetType: 'user', targetId: String(userId) })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('action reason outcome adminEmail createdAt metadata')
        .lean()
    ]);

    const recentReports = await Report.find({ targetUser: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('targetType category status priority createdAt reporter')
      .populate('reporter', 'username fullName avatar')
      .lean();

    const onlineSet = new Set(getOnlineUserIds());

    return res.json({
      success: true,
      data: {
        ...user,
        isOnline: onlineSet.has(String(userId)),
        stats: {
          roomsOwned,
          roomMessages,
          directMessages,
          acceptedFriends,
          pendingReports,
          reportsAgainst,
          activeCalls
        },
        recentReports,
        moderationHistory
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PATCH /api/admin/users/:id
 */
const updateUser = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const allowedFields = ['fullName', 'bio', 'phone', 'location', 'website', 'github', 'linkedin', 'avatar'];
    const maxLengths = {
      fullName: 80,
      bio: 500,
      phone: 30,
      location: 100,
      website: 300,
      github: 200,
      linkedin: 300,
      avatar: 500
    };
    const updates = {};
    Object.keys(maxLengths).forEach((field) => {
      if (typeof req.body[field] === 'string') {
        updates[field] = sanitizeText(req.body[field], maxLengths[field]);
      }
    });

    const changedFields = Object.keys(updates);
    if (!changedFields.length) {
      return res.status(400).json({ success: false, message: `No editable fields supplied. Allowed: ${allowedFields.join(', ')}` });
    }

    changedFields.forEach((field) => {
      user[field] = updates[field];
    });
    await user.save();

    await recordAudit({
      req,
      admin: req.admin,
      action: 'user.update',
      targetType: 'user',
      targetId: user._id.toString(),
      reason: sanitizeText(req.body.reason || '', 500),
      metadata: { fields: changedFields }
    });

    return res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/users/:id/suspend
 */
const suspendUserAccount = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    const reasonCheck = requireString(req.body?.reason, { field: 'Reason', min: 3, max: 500 });
    if (!reasonCheck.ok) return res.status(400).json({ success: false, message: reasonCheck.message });

    const durationHours = req.body?.durationHours;
    if (durationHours !== undefined && durationHours !== null) {
      const parsed = Number(durationHours);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 24 * 365) {
        return res.status(400).json({ success: false, message: 'Duration must be between 1 and 8760 hours' });
      }
    }

    const user = await suspendUser({
      userId: req.params.id,
      reason: reasonCheck.value,
      note: sanitizeText(req.body?.note || '', 1000),
      adminId: req.admin._id,
      durationHours
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'user.suspend',
      targetType: 'user',
      targetId: user._id.toString(),
      reason: reasonCheck.value,
      metadata: { durationHours: durationHours || null }
    });

    return res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/users/:id/ban
 */
const banUserAccount = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    const reasonCheck = requireString(req.body?.reason, { field: 'Reason', min: 3, max: 500 });
    if (!reasonCheck.ok) return res.status(400).json({ success: false, message: reasonCheck.message });

    const user = await banUser({
      userId: req.params.id,
      reason: reasonCheck.value,
      note: sanitizeText(req.body?.note || '', 1000),
      adminId: req.admin._id
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'user.ban',
      targetType: 'user',
      targetId: user._id.toString(),
      reason: reasonCheck.value
    });

    return res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/users/:id/restore
 */
const restoreUserAccount = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    const user = await restoreUser({
      userId: req.params.id,
      reason: sanitizeText(req.body?.reason || '', 500),
      note: sanitizeText(req.body?.note || '', 1000),
      adminId: req.admin._id
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'user.restore',
      targetType: 'user',
      targetId: user._id.toString(),
      reason: sanitizeText(req.body?.reason || '', 500)
    });

    return res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    return next(error);
  }
};

/**
 * DELETE /api/admin/users/:id
 */
const deleteUserAccount = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    if (String(req.body?.confirmation || '') !== 'DELETE') {
      return res.status(400).json({
        success: false,
        message: 'Type DELETE in the confirmation field to run the controlled account deletion'
      });
    }
    const reasonCheck = requireString(req.body?.reason, { field: 'Reason', min: 3, max: 500 });
    if (!reasonCheck.ok) return res.status(400).json({ success: false, message: reasonCheck.message });

    const user = await deleteUser({
      userId: req.params.id,
      reason: reasonCheck.value,
      note: sanitizeText(req.body?.note || '', 1000),
      adminId: req.admin._id
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'user.delete',
      targetType: 'user',
      targetId: user._id.toString(),
      reason: reasonCheck.value,
      metadata: { softDelete: true }
    });

    return res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/users/:id/revoke-sessions
 */
const revokeSessions = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }
    const user = await revokeUserSessions(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'user.sessions.revoke',
      targetType: 'user',
      targetId: req.params.id,
      reason: sanitizeText(req.body?.reason || '', 500)
    });

    return res.json({ success: true, message: 'All active sessions revoked' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listUsers,
  getUserDetail,
  updateUser,
  suspendUserAccount,
  banUserAccount,
  restoreUserAccount,
  deleteUserAccount,
  revokeSessions
};
