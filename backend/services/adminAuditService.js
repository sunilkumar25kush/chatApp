const AuditLog = require('../models/AuditLog');
const { getClientIp } = require('../utils/adminValidation');
const logger = require('../utils/logger');

/**
 * Append an admin action to the immutable audit trail.
 * Never store passwords, tokens, message bodies or other sensitive payloads here.
 */
const recordAudit = async ({
  req = null,
  admin = null,
  action,
  targetType = null,
  targetId = null,
  reason = '',
  metadata = {},
  outcome = 'success'
}) => {
  try {
    if (!action) return null;
    let ip = '';
    let userAgent = '';
    if (req) {
      ip = getClientIp(req);
      userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    }
    return await AuditLog.create({
      admin: admin?._id || admin?.id || null,
      adminRole: admin?.role || 'unknown',
      adminEmail: admin?.email || '',
      action: String(action).slice(0, 120),
      targetType,
      targetId: targetId ? String(targetId) : null,
      reason: String(reason || '').slice(0, 2000),
      metadata,
      ip,
      userAgent,
      outcome: outcome === 'failure' ? 'failure' : 'success'
    });
  } catch (err) {
    // Audit failures are logged but must not break the main action.
    logger.error(`[Audit] Failed to record ${action}: ${err.message}`);
    return null;
  }
};

module.exports = { recordAudit };
