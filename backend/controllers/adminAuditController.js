const AuditLog = require('../models/AuditLog');
const {
  escapeRegex,
  isValidObjectId,
  parsePagination,
  buildPagination,
  parseDate
} = require('../utils/adminValidation');

/**
 * GET /api/admin/audit-logs
 * Read-only. Mutations are blocked at the schema level.
 */
const listAuditLogs = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, {
      defaultLimit: 25,
      maxLimit: 100,
      allowedSorts: ['createdAt'],
      defaultSort: 'createdAt'
    });

    const filter = {};
    if (isValidObjectId(req.query.admin)) filter.admin = req.query.admin;
    if (req.query.action) {
      const action = escapeRegex(String(req.query.action).slice(0, 120));
      filter.action = { $regex: `^${action}`, $options: 'i' };
    }
    if (req.query.targetType) filter.targetType = String(req.query.targetType).slice(0, 60);
    if (req.query.targetId) filter.targetId = String(req.query.targetId).slice(0, 120);
    if (['success', 'failure'].includes(req.query.outcome)) filter.outcome = req.query.outcome;
    if (req.query.search) {
      const search = escapeRegex(String(req.query.search).slice(0, 120));
      filter.$or = [
        { action: { $regex: search, $options: 'i' } },
        { adminEmail: { $regex: search, $options: 'i' } },
        { targetId: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } }
      ];
    }
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('admin', 'username email role')
      .lean();

    return res.json({ success: true, data: logs, pagination: buildPagination(total, page, limit) });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/audit-logs/stats
 */
const getAuditStats = async (req, res, next) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, last24hCount, failures, topActions] = await Promise.all([
      AuditLog.countDocuments({}),
      AuditLog.countDocuments({ createdAt: { $gte: last24h } }),
      AuditLog.countDocuments({ outcome: 'failure', createdAt: { $gte: last24h } }),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ])
    ]);

    return res.json({
      success: true,
      data: {
        total,
        last24h: last24hCount,
        failuresLast24h: failures,
        topActions: topActions.map((row) => ({ action: row._id, count: row.count }))
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/audit-logs/:id
 */
const getAuditLog = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid audit log ID' });
    }
    const log = await AuditLog.findById(req.params.id)
      .populate('admin', 'username email role')
      .lean();
    if (!log) return res.status(404).json({ success: false, message: 'Audit log not found' });
    return res.json({ success: true, data: log });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listAuditLogs, getAuditStats, getAuditLog };
