const Message = require('../models/Message');
const DirectMessage = require('../models/DirectMessage');
const Report = require('../models/Report');
const User = require('../models/User');
const { recordAudit } = require('../services/adminAuditService');
const { notifyUser } = require('../services/userModerationService');
const { emitToRoom, emitToConversation } = require('../services/adminRealtimeService');
const { hasPermission, PERMISSIONS } = require('../utils/adminPermissions');
const {
  isValidObjectId,
  parsePagination,
  buildPagination,
  requireString,
  sanitizeText
} = require('../utils/adminValidation');

const canInspectPrivate = (admin) => hasPermission(admin, PERMISSIONS.MESSAGES_PRIVATE_INVESTIGATE);
const MODERATED_CONTENT = 'This message was removed by a moderator.';

const isPrivateRoom = (room) => Boolean(room && (room.isPrivate || room.visibility === 'private'));

const fetchMessagePair = async (report) => {
  if (!isValidObjectId(report.targetId)) return { message: null, kind: null };
  if (report.targetType === 'direct_message' || report.messageModel === 'DirectMessage') {
    const message = await DirectMessage.findById(report.targetId)
      .populate('sender', 'username fullName avatar publicId accountStatus')
      .populate('recipient', 'username fullName avatar publicId accountStatus')
      .lean();
    return { message, kind: 'direct' };
  }
  const message = await Message.findById(report.targetId)
    .populate('sender', 'username fullName avatar publicId accountStatus')
    .populate('room', 'name code visibility isPrivate isSuspended')
    .lean();
  return { message, kind: 'room' };
};

const listReportedMessages = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      allowedSorts: ['createdAt'],
      defaultSort: 'createdAt'
    });

    const statusFilter = req.query.status
      ? String(req.query.status)
      : null;
    const allowedStatuses = ['pending', 'under_review', 'resolved', 'rejected', 'escalated'];

    const filter = {
      targetType: { $in: ['message', 'direct_message'] }
    };
    if (statusFilter && allowedStatuses.includes(statusFilter)) {
      filter.status = statusFilter;
    } else {
      filter.status = { $in: ['pending', 'under_review', 'escalated'] };
    }
    if (['low', 'medium', 'high', 'critical'].includes(req.query.priority)) {
      filter.priority = req.query.priority;
    }
    if (req.query.category) filter.category = String(req.query.category).slice(0, 50);

    const total = await Report.countDocuments(filter);
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('reporter targetType targetId messageModel targetUser room category description priority status assignedTo createdAt')
      .populate('reporter', 'username fullName avatar publicId')
      .populate('assignedTo', 'username email role')
      .lean();

    const data = await Promise.all(reports.map(async (report) => {
      const { message, kind } = await fetchMessagePair(report);
      if (!message) {
        return { report, message: null, kind, contentMasked: true };
      }

      if (kind === 'direct') {
        return {
          report,
          kind,
          contentMasked: true,
          message: {
            _id: message._id,
            sender: message.sender,
            recipient: message.recipient,
            fileType: message.fileType,
            fileName: message.fileName,
            isDeleted: message.isDeleted,
            createdAt: message.createdAt,
            contentPreview: '[Private message — open the case with investigation access to review]'
          }
        };
      }

      return {
        report,
        kind,
        contentMasked: false,
        message: {
          _id: message._id,
          room: message.room,
          sender: message.sender,
          content: message.content,
          fileType: message.fileType,
          fileName: message.fileName,
          isDeleted: message.isDeleted,
          moderation: message.moderation,
          createdAt: message.createdAt
        }
      };
    }));

    return res.json({ success: true, data, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

const getReportedMessageDetail = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }
    const requestedType = req.query.type === 'direct' ? 'direct' : req.query.type === 'room' ? 'room' : null;

    let message = null;
    let kind = requestedType;
    if (requestedType !== 'direct') {
      message = await Message.findById(req.params.id)
        .populate('sender', 'username fullName avatar publicId accountStatus')
        .populate('room', 'name code visibility isPrivate isSuspended owner')
        .lean();
      if (message) kind = 'room';
    }
    if (!message && requestedType !== 'room') {
      message = await DirectMessage.findById(req.params.id)
        .populate('sender', 'username fullName avatar publicId accountStatus')
        .populate('recipient', 'username fullName avatar publicId accountStatus')
        .lean();
      if (message) kind = 'direct';
    }
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    let reason = '';
    if (kind === 'direct') {
      if (!canInspectPrivate(req.admin)) {
        return res.status(403).json({ success: false, message: 'Private message investigation requires elevated permission' });
      }
      reason = sanitizeText(req.query.reason || '', 500);
      if (!reason) {
        return res.status(400).json({ success: false, message: 'A reason is required to review private message evidence' });
      }
      await recordAudit({
        req,
        admin: req.admin,
        action: 'message.private.inspect',
        targetType: 'direct_message',
        targetId: message._id.toString(),
        reason,
        metadata: { conversation: String(message.conversation) }
      });
    } else if (isPrivateRoom(message.room)) {
      if (!canInspectPrivate(req.admin)) {
        return res.status(403).json({ success: false, message: 'Private room messages require elevated permission' });
      }
      reason = sanitizeText(req.query.reason || '', 500);
      if (!reason) {
        return res.status(400).json({ success: false, message: 'A reason is required to review private room evidence' });
      }
      await recordAudit({
        req,
        admin: req.admin,
        action: 'message.private.inspect',
        targetType: 'message',
        targetId: message._id.toString(),
        reason,
        metadata: { roomId: String(message.room?._id || message.room) }
      });
    }

    const beforeQuery = kind === 'direct'
      ? { conversation: message.conversation, createdAt: { $lt: message.createdAt } }
      : { room: message.room?._id || message.room, createdAt: { $lt: message.createdAt } };
    const afterQuery = kind === 'direct'
      ? { conversation: message.conversation, createdAt: { $gt: message.createdAt } }
      : { room: message.room?._id || message.room, createdAt: { $gt: message.createdAt } };

    const Model = kind === 'direct' ? DirectMessage : Message;
    const [before, after] = await Promise.all([
      Model.find(beforeQuery).sort({ createdAt: -1 }).limit(5).lean(),
      Model.find(afterQuery).sort({ createdAt: 1 }).limit(5).lean()
    ]);
    const context = [...before.reverse(), message, ...after];

    const reports = await Report.find({
      targetType: kind === 'direct' ? 'direct_message' : 'message',
      targetId: message._id
    })
      .sort({ createdAt: -1 })
      .select('reporter category description status priority resolution history createdAt')
      .populate('reporter', 'username fullName avatar publicId')
      .lean();

    return res.json({ success: true, kind, data: message, context, reports });
  } catch (error) {
    return next(error);
  }
};

const resolveMessageAndRoom = async (id) => {
  let message = await Message.findById(id).populate('room', 'name visibility isPrivate isSuspended');
  if (message) return { message, kind: 'room', room: message.room };
  message = await DirectMessage.findById(id);
  if (message) return { message, kind: 'direct', room: null };
  return null;
};

const assertMessageModerationAccess = async (req, kind, room) => {
  const reason = sanitizeText(req.body?.reason || '', 500);
  if (kind === 'direct') {
    if (!canInspectPrivate(req.admin)) {
      return { ok: false, status: 403, message: 'Private message moderation requires elevated permission' };
    }
    if (!reason) return { ok: false, status: 400, message: 'A reason is required to moderate private messages' };
    return { ok: true, reason };
  }
  if (isPrivateRoom(room)) {
    if (!canInspectPrivate(req.admin)) {
      return { ok: false, status: 403, message: 'Private room message moderation requires elevated permission' };
    }
    if (!reason) return { ok: false, status: 400, message: 'A reason is required to moderate private room messages' };
  }
  if (!reason) return { ok: false, status: 400, message: 'A reason is required' };
  return { ok: true, reason };
};

const removeMessage = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }
    const resolved = await resolveMessageAndRoom(req.params.id);
    if (!resolved) return res.status(404).json({ success: false, message: 'Message not found' });

    const { message, kind, room } = resolved;
    if (message.moderation?.removedBy) {
      return res.status(409).json({ success: false, message: 'This message is already under moderation' });
    }
    const access = await assertMessageModerationAccess(req, kind, room);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    const update = {
      $set: {
        isDeleted: true,
        content: MODERATED_CONTENT,
        fileUrl: null,
        fileType: null,
        fileName: null,
        'moderation.removedBy': req.admin._id,
        'moderation.removedAt': new Date(),
        'moderation.reason': access.reason,
        'moderation.originalContent': message.content || '',
        'moderation.originalFileUrl': message.fileUrl || null,
        'moderation.originalFileType': message.fileType || null,
        'moderation.originalFileName': message.fileName || null
      }
    };

    const Model = kind === 'direct' ? DirectMessage : Message;
    const updated = await Model.findByIdAndUpdate(message._id, update, { new: true });

    const payload = {
      _id: updated._id,
      isDeleted: true,
      content: MODERATED_CONTENT,
      fileUrl: null,
      fileType: null,
      fileName: null,
      moderation: {
        removedAt: updated.moderation?.removedAt,
        reason: access.reason
      }
    };

    if (kind === 'direct') {
      emitToConversation(message.conversation, 'direct_message_moderated', payload);
      emitToConversation(message.conversation, 'direct_message_deleted', payload);
    } else {
      emitToRoom(message.room?._id || message.room, 'message_moderated', payload);
      emitToRoom(message.room?._id || message.room, 'message_deleted', payload);
    }

    await notifyUser(message.sender, {
      title: 'Message removed',
      message: `A message you sent was removed by a moderator. Reason: ${access.reason}`,
      data: { messageId: message._id.toString(), action: 'message_remove' }
    });

    await recordAudit({
      req,
      admin: req.admin,
      action: kind === 'direct' ? 'direct_message.remove' : 'message.remove',
      targetType: kind === 'direct' ? 'direct_message' : 'message',
      targetId: message._id.toString(),
      reason: access.reason,
      metadata: kind === 'direct'
        ? { conversation: String(message.conversation) }
        : { roomId: String(message.room?._id || message.room) }
    });

    return res.json({ success: true, data: payload });
  } catch (error) {
    return next(error);
  }
};

const restoreMessage = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }
    const resolved = await resolveMessageAndRoom(req.params.id);
    if (!resolved) return res.status(404).json({ success: false, message: 'Message not found' });

    const { message, kind, room } = resolved;
    if (!message.moderation?.removedBy) {
      return res.status(400).json({ success: false, message: 'This message is not under moderation' });
    }
    const access = await assertMessageModerationAccess(req, kind, room);
    if (!access.ok) return res.status(access.status).json({ success: false, message: access.message });

    const Model = kind === 'direct' ? DirectMessage : Message;
    const full = await Model.findById(message._id).select(
      '+moderation.originalContent +moderation.originalFileUrl +moderation.originalFileType +moderation.originalFileName'
    );
    if (!full) return res.status(404).json({ success: false, message: 'Message not found' });

    const update = {
      $set: {
        isDeleted: false,
        content: full.moderation?.originalContent || '',
        fileUrl: full.moderation?.originalFileUrl || null,
        fileType: full.moderation?.originalFileType || null,
        fileName: full.moderation?.originalFileName || null,
        'moderation.restoredBy': req.admin._id,
        'moderation.restoredAt': new Date(),
        'moderation.originalContent': null,
        'moderation.originalFileUrl': null,
        'moderation.originalFileType': null,
        'moderation.originalFileName': null
      }
    };

    const updated = await Model.findByIdAndUpdate(message._id, update, { new: true });
    const restoredPayload = {
      _id: updated._id,
      isDeleted: false,
      content: updated.content,
      fileUrl: updated.fileUrl,
      fileType: updated.fileType,
      fileName: updated.fileName,
      moderation: { restoredAt: updated.moderation?.restoredAt }
    };

    if (kind === 'direct') {
      emitToConversation(message.conversation, 'direct_message_restored', restoredPayload);
    } else {
      emitToRoom(message.room?._id || message.room, 'message_restored', restoredPayload);
    }

    await recordAudit({
      req,
      admin: req.admin,
      action: kind === 'direct' ? 'direct_message.restore' : 'message.restore',
      targetType: kind === 'direct' ? 'direct_message' : 'message',
      targetId: message._id.toString(),
      reason: access.reason,
      metadata: kind === 'direct'
        ? { conversation: String(message.conversation) }
        : { roomId: String(message.room?._id || message.room) }
    });

    return res.json({ success: true, data: restoredPayload });
  } catch (error) {
    return next(error);
  }
};

const warnUser = async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'A valid user ID is required' });
    }
    const reasonCheck = requireString(req.body?.reason, { field: 'Reason', min: 3, max: 1000 });
    if (!reasonCheck.ok) return res.status(400).json({ success: false, message: reasonCheck.message });

    const user = await User.findById(userId).select('username accountStatus');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await notifyUser(user._id, {
      title: 'Moderation warning',
      message: reasonCheck.value,
      data: { action: 'warning' }
    });
    await recordAudit({
      req,
      admin: req.admin,
      action: 'user.warn',
      targetType: 'user',
      targetId: user._id.toString(),
      reason: reasonCheck.value
    });

    return res.json({ success: true, message: `Warning delivered to ${user.username}` });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listReportedMessages,
  getReportedMessageDetail,
  removeMessage,
  restoreMessage,
  warnUser
};
