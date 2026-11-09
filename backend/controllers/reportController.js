const mongoose = require('mongoose');
const Report = require('../models/Report');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const DirectMessage = require('../models/DirectMessage');
const CallSession = require('../models/CallSession');
const { checkRoomAccess } = require('../utils/roomAccess');
const { notifyUser } = require('../services/userModerationService');
const {
  isValidObjectId,
  requireString,
  parsePagination,
  buildPagination,
  sanitizeText
} = require('../utils/adminValidation');

const CATEGORIES = ['harassment', 'spam', 'impersonation', 'inappropriate_content', 'fake_account', 'threats', 'suspicious_activity', 'room_abuse', 'other'];
const OPEN_STATUSES = ['pending', 'under_review', 'escalated'];

const getPriority = (category) => {
  if (['threats', 'harassment', 'suspicious_activity', 'impersonation'].includes(category)) return 'high';
  if (['spam', 'fake_account'].includes(category)) return 'medium';
  return 'medium';
};

const createReport = async (req, res, next) => {
  try {
    const reporterId = req.user?._id ? req.user._id.toString() : req.user?.id;
    if (!reporterId || !mongoose.Types.ObjectId.isValid(reporterId)) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { targetType, targetId, category } = req.body || {};
    if (!['user', 'room', 'message', 'direct_message', 'call'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid report target type' });
    }
    if (!isValidObjectId(targetId)) {
      return res.status(400).json({ success: false, message: 'Invalid report target' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid report category' });
    }
    const descriptionCheck = requireString(req.body?.description, { field: 'Description', min: 10, max: 2000 });
    if (!descriptionCheck.ok) return res.status(400).json({ success: false, message: descriptionCheck.message });

    const existing = await Report.findOne({
      reporter: reporterId,
      targetType,
      targetId,
      status: { $in: OPEN_STATUSES }
    }).select('_id');
    if (existing) {
      return res.status(409).json({ success: false, message: 'You already have an open report for this item' });
    }

    let targetUser = null;
    let room = null;
    let messageModel = null;

    if (targetType === 'user') {
      if (String(targetId) === String(reporterId)) {
        return res.status(400).json({ success: false, message: 'You cannot report yourself' });
      }
      const user = await User.findById(targetId).select('_id accountStatus');
      if (!user || user.accountStatus === 'deleted') {
        return res.status(404).json({ success: false, message: 'Target user not found' });
      }
      targetUser = user._id;
    } else if (targetType === 'room') {
      const foundRoom = await Room.findById(targetId).select('_id owner isPrivate visibility members admins isDeleted');
      if (!foundRoom || foundRoom.isDeleted) {
        return res.status(404).json({ success: false, message: 'Room not found' });
      }
      const access = checkRoomAccess(foundRoom, reporterId);
      if (!access.allowed) {
        return res.status(403).json({ success: false, message: 'You cannot report a private room you do not belong to' });
      }
      room = foundRoom._id;
    } else if (targetType === 'message') {
      const message = await Message.findById(targetId)
        .populate('room', 'isPrivate visibility members admins owner isDeleted')
        .select('_id sender room isDeleted');
      if (!message || message.isDeleted) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }
      if (String(message.sender) === String(reporterId)) {
        return res.status(400).json({ success: false, message: 'You cannot report your own message' });
      }
      if (!message.room || message.room.isDeleted) {
        return res.status(404).json({ success: false, message: 'The message room is no longer available' });
      }
      const access = checkRoomAccess(message.room, reporterId);
      if (!access.allowed) {
        return res.status(403).json({ success: false, message: 'You cannot report a message from a room you do not belong to' });
      }
      targetUser = message.sender;
      room = message.room._id;
      messageModel = 'Message';
    } else if (targetType === 'direct_message') {
      const message = await DirectMessage.findById(targetId).select('_id sender recipient conversation isDeleted');
      if (!message || message.isDeleted) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }
      const isParticipant = String(message.sender) === String(reporterId) || String(message.recipient) === String(reporterId);
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'You cannot report a private message you are not part of' });
      }
      targetUser = String(message.sender) === String(reporterId) ? message.recipient : message.sender;
      messageModel = 'DirectMessage';
    } else if (targetType === 'call') {
      const call = await CallSession.findById(targetId).select('_id creator participants status');
      if (!call) return res.status(404).json({ success: false, message: 'Call not found' });
      const isParticipant = (call.participants || []).some((p) => String(p.user) === String(reporterId));
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'You cannot report a call you did not participate in' });
      }
      targetUser = String(call.creator) === String(reporterId) ? null : call.creator;
    }

    const evidenceInput = req.body?.evidence;
    const evidence = {};
    if (evidenceInput && typeof evidenceInput === 'object' && !Array.isArray(evidenceInput)) {
      if (typeof evidenceInput.context === 'string') evidence.context = sanitizeText(evidenceInput.context, 1000);
      if (typeof evidenceInput.url === 'string') evidence.url = sanitizeText(evidenceInput.url, 1000);
    }

    const report = await Report.create({
      reporter: reporterId,
      targetType,
      targetId,
      messageModel,
      targetUser,
      room,
      category,
      description: descriptionCheck.value,
      evidence,
      priority: getPriority(category),
      status: 'pending',
      history: [{ status: 'pending', note: 'Report submitted', at: new Date() }]
    });

    await notifyUser(reporterId, {
      title: 'Report received',
      message: 'Thank you. Our moderation team will review your report.',
      data: { reportId: report._id.toString(), action: 'report_created' }
    });

    return res.status(201).json({
      success: true,
      message: 'Report submitted',
      data: { _id: report._id, status: report.status, createdAt: report.createdAt }
    });
  } catch (error) {
    return next(error);
  }
};

const getMyReports = async (req, res, next) => {
  try {
    const reporterId = req.user?._id ? req.user._id.toString() : req.user?.id;
    if (!reporterId) return res.status(401).json({ success: false, message: 'Authentication required' });
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
    const filter = { reporter: reporterId };
    if (req.query.status && ['pending', 'under_review', 'resolved', 'rejected', 'escalated'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const total = await Report.countDocuments(filter);
    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('targetType targetId category description status priority resolution createdAt updatedAt')
      .lean();
    return res.json({ success: true, data: reports, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createReport, getMyReports };
