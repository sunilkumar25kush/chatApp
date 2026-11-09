const CallSession = require('../models/CallSession');
const { recordAudit } = require('../services/adminAuditService');
const { forceEndCallSession } = require('../services/adminRealtimeService');
const {
  isValidObjectId,
  parsePagination,
  buildPagination,
  requireString,
  parseDate
} = require('../utils/adminValidation');

const populateSession = (query) => query
  .populate('creator', 'username fullName avatar publicId accountStatus')
  .populate('participants.user', 'username fullName avatar publicId accountStatus');

const withDuration = (session) => {
  const started = session.startedAt ? new Date(session.startedAt).getTime() : null;
  const ended = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  return {
    ...session,
    liveDurationSeconds: started ? Math.max(0, Math.round((ended - started) / 1000)) : 0
  };
};

const listActiveCalls = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const filter = { status: { $in: ['ringing', 'active'] } };
    if (['voice', 'video'].includes(req.query.callType)) filter.callType = req.query.callType;

    const total = await CallSession.countDocuments(filter);
    const sessions = await populateSession(
      CallSession.find(filter)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
    ).lean();

    return res.json({
      success: true,
      data: sessions.map(withDuration),
      pagination: buildPagination(total, page, limit)
    });
  } catch (error) {
    return next(error);
  }
};

const listCallHistory = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      allowedSorts: ['createdAt', 'startedAt', 'duration'],
      defaultSort: 'createdAt'
    });
    const filter = {};
    if (req.query.active === 'true') {
      filter.status = { $in: ['ringing', 'active'] };
    } else if (req.query.status) {
      filter.status = String(req.query.status);
    } else {
      filter.status = { $in: ['ended', 'missed', 'declined', 'cancelled'] };
    }
    if (['voice', 'video'].includes(req.query.callType)) filter.callType = req.query.callType;
    if (req.query.search) {
      filter.callId = { $regex: String(req.query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    const total = await CallSession.countDocuments(filter);
    const sessions = await populateSession(
      CallSession.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ).lean();

    return res.json({ success: true, data: sessions, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

const getCallDetail = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid call ID' });
    }
    const session = await populateSession(CallSession.findById(req.params.id)).lean();
    if (!session) return res.status(404).json({ success: false, message: 'Call not found' });
    // Media streams and recordings are intentionally never accessed here.
    return res.json({ success: true, data: withDuration(session) });
  } catch (error) {
    return next(error);
  }
};

const getCallStats = async (req, res, next) => {
  try {
    const [byStatus, byType, endedReasons, durationStats] = await Promise.all([
      CallSession.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      CallSession.aggregate([{ $group: { _id: '$callType', count: { $sum: 1 } } }]),
      CallSession.aggregate([
        { $match: { endedReason: { $ne: null } } },
        { $group: { _id: '$endedReason', count: { $sum: 1 } } }
      ]),
      CallSession.aggregate([
        { $match: { status: 'ended' } },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$duration' },
            totalDuration: { $sum: '$duration' },
            longCalls: { $sum: { $cond: [{ $gte: ['$duration', 3600] }, 1, 0] } }
          }
        }
      ])
    ]);

    const toMap = (rows) => rows.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    return res.json({
      success: true,
      data: {
        byStatus: toMap(byStatus),
        byType: toMap(byType),
        byEndedReason: toMap(endedReasons),
        averageDurationSeconds: durationStats[0] ? Math.round(durationStats[0].avgDuration || 0) : 0,
        totalDurationSeconds: durationStats[0]?.totalDuration || 0,
        longCalls: durationStats[0]?.longCalls || 0
      }
    });
  } catch (error) {
    return next(error);
  }
};

const terminateCall = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid call ID' });
    }
    const reasonCheck = requireString(req.body?.reason, { field: 'Reason', min: 3, max: 500 });
    if (!reasonCheck.ok) return res.status(400).json({ success: false, message: reasonCheck.message });

    const existing = await CallSession.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Call not found' });
    if (!['ringing', 'active'].includes(existing.status)) {
      return res.status(409).json({ success: false, message: 'This call is not active' });
    }

    const now = new Date();
    const duration = existing.startedAt
      ? Math.max(0, Math.round((now.getTime() - new Date(existing.startedAt).getTime()) / 1000))
      : 0;

    const session = await CallSession.findOneAndUpdate(
      { _id: existing._id, status: { $in: ['ringing', 'active'] } },
      {
        $set: {
          status: 'ended',
          endedAt: now,
          endedReason: 'admin_terminated',
          duration,
          adminTermination: {
            by: req.admin._id,
            at: now,
            reason: reasonCheck.value
          }
        }
      },
      { new: true }
    );
    if (!session) return res.status(409).json({ success: false, message: 'Call already ended' });

    forceEndCallSession({
      callId: session.callId,
      roomId: session.conversationId?.toString(),
      sessionId: session._id.toString(),
      reason: reasonCheck.value
    });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'call.terminate',
      targetType: 'call',
      targetId: session._id.toString(),
      reason: reasonCheck.value,
      metadata: {
        callId: session.callId,
        callType: session.callType,
        duration
      }
    });

    return res.json({ success: true, data: session });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listActiveCalls,
  listCallHistory,
  getCallDetail,
  getCallStats,
  terminateCall
};
