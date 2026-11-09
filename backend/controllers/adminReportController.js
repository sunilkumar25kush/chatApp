const Report = require('../models/Report');
const Message = require('../models/Message');
const DirectMessage = require('../models/DirectMessage');
const Room = require('../models/Room');
const Admin = require('../models/Admin');
const CallSession = require('../models/CallSession');
const { recordAudit } = require('../services/adminAuditService');
const { notifyUser, suspendUser, banUser } = require('../services/userModerationService');
const { emitToRoom, emitToConversation } = require('../services/adminRealtimeService');
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

const OPEN_STATUSES = ['pending', 'under_review', 'escalated'];
const TERMINAL_STATUSES = ['resolved', 'rejected'];
const MODERATED_CONTENT = 'This message was removed by a moderator.';

const canInspectPrivateMessages = (admin) => hasPermission(admin, PERMISSIONS.MESSAGES_PRIVATE_INVESTIGATE);
const canInspectPrivateRooms = (admin) => hasPermission(admin, PERMISSIONS.ROOMS_VIEW_PRIVATE);

const isPrivateRoom = (room) => Boolean(room && (room.isPrivate || room.visibility === 'private'));

const listReports = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = parsePagination(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      allowedSorts: ['createdAt', 'updatedAt', 'priority', 'status'],
      defaultSort: 'createdAt'
    });

    const filter = {};
    if (req.query.status) {
      const statuses = String(req.query.status).split(',').filter((s) => [...OPEN_STATUSES, ...TERMINAL_STATUSES].includes(s));
      if (statuses.length) filter.status = { $in: statuses };
    } else {
      filter.status = { $in: OPEN_STATUSES };
    }
    if (['low', 'medium', 'high', 'critical'].includes(req.query.priority)) {
      filter.priority = req.query.priority;
    }
    if (req.query.category) filter.category = String(req.query.category).slice(0, 50);
    if (['user', 'room', 'message', 'direct_message', 'call'].includes(req.query.targetType)) {
      filter.targetType = req.query.targetType;
    }
    if (req.query.assignedTo === 'me') {
      filter.assignedTo = req.admin._id;
    } else if (req.query.assignedTo === 'unassigned') {
      filter.assignedTo = null;
    } else if (isValidObjectId(req.query.assignedTo)) {
      filter.assignedTo = req.query.assignedTo;
    }
    if (req.query.search) {
      const search = escapeRegex(String(req.query.search).slice(0, 100));
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { targetId: { $regex: search, $options: 'i' } }
      ];
    }
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    const total = await Report.countDocuments(filter);
    const reports = await Report.find(filter)
      .sort({ [sort]: order })
      .skip(skip)
      .limit(limit)
      .populate('reporter', 'username fullName avatar publicId accountStatus')
      .populate('assignedTo', 'username email role')
      .populate('targetUser', 'username fullName avatar publicId accountStatus')
      .populate('room', 'name code visibility isPrivate isSuspended')
      .lean();

    return res.json({ success: true, data: reports, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

const getReportDetail = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }
    const report = await Report.findById(req.params.id)
      .populate('reporter', 'username fullName avatar publicId accountStatus createdAt')
      .populate('assignedTo', 'username email role')
      .populate('targetUser', 'username fullName avatar publicId accountStatus createdAt lastSeen')
      .populate('room', 'name code visibility isPrivate isSuspended owner createdAt')
      .lean();
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    let targetDetail = null;
    let requiresReason = false;
    let restricted = false;

    if (report.targetType === 'user' && report.targetUser) {
      targetDetail = { type: 'user', user: report.targetUser };
    } else if (report.targetType === 'room' && report.room) {
      restricted = isPrivateRoom(report.room) && !canInspectPrivateRooms(req.admin);
      targetDetail = {
        type: 'room',
        room: restricted
          ? {
              _id: report.room._id,
              name: report.room.name,
              code: report.room.code,
              visibility: 'private',
              isPrivate: true,
              isSuspended: report.room.isSuspended,
              createdAt: report.room.createdAt
            }
          : report.room
      };
    } else if (report.targetType === 'message') {
      const message = await Message.findById(report.targetId)
        .populate('sender', 'username fullName avatar publicId accountStatus')
        .populate('room', 'name code visibility isPrivate isSuspended')
        .lean();
      if (message) {
        const privateRoom = isPrivateRoom(message.room);
        if (privateRoom && !canInspectPrivateMessages(req.admin)) {
          restricted = true;
          targetDetail = {
            type: 'message',
            message: {
              _id: message._id,
              room: message.room,
              sender: message.sender,
              isDeleted: message.isDeleted,
              createdAt: message.createdAt,
              content: '[Private room message — investigation access required]'
            }
          };
        } else {
          targetDetail = { type: 'message', message };
        }
      }
    } else if (report.targetType === 'direct_message') {
      requiresReason = true;
      if (!canInspectPrivateMessages(req.admin)) {
        restricted = true;
        targetDetail = { type: 'direct_message', message: null };
      } else {
        const reason = sanitizeText(req.query.reason || '', 500);
        if (!reason) {
          return res.status(400).json({
            success: false,
            message: 'A reason is required to review private message evidence',
            requiresReason: true
          });
        }
        const message = await DirectMessage.findById(report.targetId)
          .populate('sender', 'username fullName avatar publicId accountStatus')
          .populate('recipient', 'username fullName avatar publicId accountStatus')
          .lean();
        await recordAudit({
          req,
          admin: req.admin,
          action: 'report.private_message.inspect',
          targetType: 'direct_message',
          targetId: String(report.targetId),
          reason,
          metadata: { reportId: report._id.toString() }
        });
        targetDetail = { type: 'direct_message', message };
      }
    } else if (report.targetType === 'call') {
      targetDetail = {
        type: 'call',
        call: await CallSession.findById(report.targetId)
          .select('callId callType status startedAt endedAt duration creator participants')
          .populate('creator', 'username fullName avatar publicId')
          .lean()
      };
    }

    return res.json({
      success: true,
      data: report,
      targetDetail,
      restricted,
      requiresReason
    });
  } catch (error) {
    return next(error);
  }
};

const getReportStats = async (req, res, next) => {
  try {
    const [statusRows, priorityRows, categoryRows, byTarget, assignedToMe, resolutionRows] = await Promise.all([
      Report.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Report.aggregate([{ $match: { status: { $in: OPEN_STATUSES } } }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Report.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Report.aggregate([{ $group: { _id: '$targetType', count: { $sum: 1 } } }]),
      Report.countDocuments({ assignedTo: req.admin._id, status: { $in: OPEN_STATUSES } }),
      Report.aggregate([
        { $match: { status: 'resolved', 'resolution.at': { $ne: null } } },
        {
          $project: {
            hours: {
              $divide: [{ $subtract: ['$resolution.at', '$createdAt'] }, 1000 * 60 * 60]
            }
          }
        },
        { $group: { _id: null, avgHours: { $avg: '$hours' } } }
      ])
    ]);

    const toMap = (rows) => rows.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    return res.json({
      success: true,
      data: {
        byStatus: toMap(statusRows),
        open: OPEN_STATUSES.reduce((sum, status) => sum + (toMap(statusRows)[status] || 0), 0),
        openByPriority: toMap(priorityRows),
        byCategory: categoryRows.map((row) => ({ category: row._id, count: row.count })),
        byTarget: toMap(byTarget),
        assignedToMe,
        avgResolutionHours: resolutionRows[0]?.avgHours ? Math.round(resolutionRows[0].avgHours * 10) / 10 : null
      }
    });
  } catch (error) {
    return next(error);
  }
};

const listAssignees = async (req, res) => {
  const admins = await Admin.find({ status: 'active' })
    .select('username email role')
    .sort({ role: 1, username: 1 })
    .lean();
  return res.json({ success: true, data: admins });
};

const assignReport = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }
    let assignedTo = null;
    if (req.body?.assignedTo === 'me') {
      assignedTo = req.admin._id;
    } else if (req.body?.assignedTo === null || req.body?.assignedTo === '') {
      assignedTo = null;
    } else if (isValidObjectId(req.body?.assignedTo)) {
      const admin = await Admin.findOne({ _id: req.body.assignedTo, status: 'active' }).select('_id');
      if (!admin) return res.status(400).json({ success: false, message: 'Assignee is not an active admin' });
      assignedTo = admin._id;
    } else {
      return res.status(400).json({ success: false, message: 'A valid assignee is required' });
    }

    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, status: { $in: OPEN_STATUSES } },
      {
        $set: {
          assignedTo,
          assignedAt: assignedTo ? new Date() : null,
          ...(assignedTo ? { status: 'under_review' } : {})
        },
        $push: {
          history: {
            status: assignedTo ? 'under_review' : 'pending',
            by: req.admin._id,
            note: assignedTo ? 'Report assigned' : 'Report unassigned',
            at: new Date()
          }
        }
      },
      { new: true }
    );
    if (!report) return res.status(409).json({ success: false, message: 'Report is closed or not found' });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'report.assign',
      targetType: 'report',
      targetId: report._id.toString(),
      metadata: { assignedTo: assignedTo ? String(assignedTo) : null }
    });

    return res.json({ success: true, data: report });
  } catch (error) {
    return next(error);
  }
};

const updateReportStatus = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }
    const { status, note } = req.body || {};
    if (!['under_review', 'escalated'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be under_review or escalated' });
    }
    if (status === 'escalated') {
      const check = requireString(note, { field: 'Escalation note', min: 3, max: 2000 });
      if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    }

    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, status: { $in: OPEN_STATUSES } },
      {
        $set: { status },
        $push: {
          history: {
            status,
            by: req.admin._id,
            note: sanitizeText(note || '', 2000),
            at: new Date()
          }
        }
      },
      { new: true }
    );
    if (!report) return res.status(409).json({ success: false, message: 'Report is closed or not found' });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'report.status.update',
      targetType: 'report',
      targetId: report._id.toString(),
      reason: sanitizeText(note || '', 2000),
      metadata: { status }
    });

    return res.json({ success: true, data: report });
  } catch (error) {
    return next(error);
  }
};

const removeMessageForReport = async ({ report, admin, reason }) => {
  if (!['message', 'direct_message'].includes(report.targetType)) {
    throw Object.assign(new Error('This report does not target a message'), { statusCode: 400 });
  }
  if (report.targetType === 'direct_message' && !canInspectPrivateMessages(admin)) {
    throw Object.assign(new Error('Private message moderation requires elevated permission'), { statusCode: 403 });
  }

  const Model = report.targetType === 'direct_message' ? DirectMessage : Message;
  const message = await Model.findById(report.targetId);
  if (!message) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
  if (message.moderation?.removedBy) {
    return { alreadyRemoved: true, sender: message.sender };
  }

  const original = {
    content: message.content || '',
    fileUrl: message.fileUrl || null,
    fileType: message.fileType || null,
    fileName: message.fileName || null
  };
  await Model.findByIdAndUpdate(message._id, {
    $set: {
      isDeleted: true,
      content: MODERATED_CONTENT,
      fileUrl: null,
      fileType: null,
      fileName: null,
      'moderation.removedBy': admin._id,
      'moderation.removedAt': new Date(),
      'moderation.reason': reason,
      'moderation.originalContent': original.content,
      'moderation.originalFileUrl': original.fileUrl,
      'moderation.originalFileType': original.fileType,
      'moderation.originalFileName': original.fileName
    }
  });

  if (report.targetType === 'direct_message') {
    emitToConversation(message.conversation, 'direct_message_moderated', {
      _id: message._id,
      isDeleted: true,
      content: MODERATED_CONTENT,
      moderation: { reason }
    });
  } else {
    emitToRoom(message.room, 'message_moderated', {
      _id: message._id,
      isDeleted: true,
      content: MODERATED_CONTENT,
      moderation: { reason }
    });
  }

  return { sender: message.sender };
};

const removeRoomForReport = async ({ report, admin, reason }) => {
  const roomId = report.room?._id || report.room || (report.targetType === 'room' ? report.targetId : null);
  if (!roomId) throw Object.assign(new Error('This report does not target a room'), { statusCode: 400 });
  const room = await Room.findById(roomId);
  if (!room) throw Object.assign(new Error('Room not found'), { statusCode: 404 });

  await Room.findByIdAndUpdate(room._id, {
    $set: {
      isDeleted: true,
      deletedAt: new Date(),
      'moderation.action': 'delete',
      'moderation.reason': reason,
      'moderation.by': admin._id,
      'moderation.at': new Date()
    }
  });
  await notifyUser(room.owner, {
    title: 'Room removed',
    message: `Your room "${room.name}" was removed after a moderation review. Reason: ${reason}`,
    data: { roomId: room._id.toString(), action: 'room_delete' }
  });
  return { owner: room.owner };
};

const resolveReport = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }
    const decision = req.body?.decision === 'rejected' ? 'rejected' : req.body?.decision === 'resolved' ? 'resolved' : null;
    if (!decision) {
      return res.status(400).json({ success: false, message: 'Decision must be resolved or rejected' });
    }
    const reasonCheck = requireString(req.body?.reason, { field: 'Reason', min: 3, max: 2000 });
    if (!reasonCheck.ok) return res.status(400).json({ success: false, message: reasonCheck.message });

    const action = decision === 'resolved' ? String(req.body?.action || 'none') : 'none';
    const allowedActions = ['none', 'warn', 'remove_message', 'suspend_user', 'ban_user', 'remove_room'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid moderation action' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    if (!OPEN_STATUSES.includes(report.status)) {
      return res.status(409).json({ success: false, message: 'Report is already closed' });
    }

    let actionResult = null;
    let actionTargetUserId = report.targetUser || null;

    if (action === 'warn') {
      if (!actionTargetUserId) return res.status(400).json({ success: false, message: 'This report has no target user to warn' });
      await notifyUser(actionTargetUserId, {
        title: 'Moderation warning',
        message: reasonCheck.value,
        data: { action: 'warning', reportId: report._id.toString() }
      });
      actionResult = { action: 'warn', userId: String(actionTargetUserId) };
    } else if (action === 'remove_message') {
      const result = await removeMessageForReport({ report, admin: req.admin, reason: reasonCheck.value });
      actionTargetUserId = actionTargetUserId || result.sender;
      actionResult = { action: 'remove_message', alreadyRemoved: Boolean(result.alreadyRemoved) };
    } else if (action === 'suspend_user' || action === 'ban_user') {
      if (!actionTargetUserId) return res.status(400).json({ success: false, message: 'This report has no target user' });
      const durationHours = req.body?.durationHours;
      if (action === 'suspend_user') {
        if (durationHours !== undefined && durationHours !== null) {
          const parsed = Number(durationHours);
          if (!Number.isFinite(parsed) || parsed < 1 || parsed > 24 * 365) {
            return res.status(400).json({ success: false, message: 'Duration must be between 1 and 8760 hours' });
          }
        }
        await suspendUser({
          userId: actionTargetUserId,
          reason: reasonCheck.value,
          note: sanitizeText(req.body?.note || '', 1000),
          adminId: req.admin._id,
          durationHours
        });
      } else {
        await banUser({
          userId: actionTargetUserId,
          reason: reasonCheck.value,
          note: sanitizeText(req.body?.note || '', 1000),
          adminId: req.admin._id
        });
      }
      actionResult = { action, userId: String(actionTargetUserId) };
    } else if (action === 'remove_room') {
      const result = await removeRoomForReport({ report, admin: req.admin, reason: reasonCheck.value });
      actionResult = { action: 'remove_room', ownerId: String(result.owner) };
    } else {
      actionResult = { action: 'none' };
    }

    const updated = await Report.findOneAndUpdate(
      { _id: report._id, status: { $in: OPEN_STATUSES } },
      {
        $set: {
          status: decision,
          resolution: {
            decision,
            action,
            reason: reasonCheck.value,
            note: sanitizeText(req.body?.note || '', 1000),
            by: req.admin._id,
            at: new Date()
          }
        },
        $push: {
          history: {
            status: decision,
            by: req.admin._id,
            note: sanitizeText(req.body?.note || reasonCheck.value, 2000),
            at: new Date()
          }
        }
      },
      { new: true }
    );
    if (!updated) return res.status(409).json({ success: false, message: 'Report was already closed by another admin' });

    if (req.body?.resolveLinked === true) {
      await Report.updateMany(
        {
          _id: { $ne: report._id },
          status: { $in: OPEN_STATUSES },
          targetType: report.targetType,
          targetId: report.targetId
        },
        {
          $set: {
            status: 'resolved',
            resolution: {
              decision: 'resolved',
              action: 'none',
              reason: `Resolved with linked case ${report._id}`,
              note: '',
              by: req.admin._id,
              at: new Date()
            }
          },
          $push: {
            history: {
              status: 'resolved',
              by: req.admin._id,
              note: `Resolved with linked case ${report._id}`,
              at: new Date()
            }
          }
        }
      );
    }

    await notifyUser(report.reporter, {
      title: 'Report reviewed',
      message: `Your report has been ${decision === 'resolved' ? 'resolved' : 'reviewed and closed'}.`,
      data: { reportId: report._id.toString(), action: 'report_update' }
    });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'report.resolve',
      targetType: 'report',
      targetId: report._id.toString(),
      reason: reasonCheck.value,
      metadata: { decision, action, ...actionResult }
    });

    return res.json({ success: true, data: updated, actionResult });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

module.exports = {
  listReports,
  getReportDetail,
  getReportStats,
  listAssignees,
  assignReport,
  updateReportStatus,
  resolveReport
};
