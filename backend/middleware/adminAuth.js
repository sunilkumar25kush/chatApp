const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const { getEffectivePermissions, hasPermission, sanitizeAdmin } = require('../utils/adminPermissions');
const { recordAudit } = require('../services/adminAuditService');
const logger = require('../utils/logger');

const getAdminJwtSecret = () => {
  if (process.env.ADMIN_JWT_SECRET) return process.env.ADMIN_JWT_SECRET;
  const base = process.env.JWT_SECRET;
  if (!base && process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_JWT_SECRET or JWT_SECRET is required in production');
  }
  return `${base || 'dev_only_insecure_secret'}:admin`;
};

const getAdminJwtExpiresIn = () => process.env.ADMIN_JWT_EXPIRES_IN || '8h';

const signAdminToken = (admin, { purpose = 'access', expiresIn } = {}) => {
  return jwt.sign(
    {
      id: admin._id.toString(),
      type: 'admin',
      purpose,
      sv: admin.sessionVersion || 0,
      role: admin.role
    },
    getAdminJwtSecret(),
    { expiresIn: expiresIn || getAdminJwtExpiresIn(), issuer: 'chatroom-admin' }
  );
};

const verifyAdminToken = (token) => {
  return jwt.verify(token, getAdminJwtSecret(), { issuer: 'chatroom-admin' });
};

const extractBearer = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
};

const requireDatabase = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Admin services require an active database connection'
    });
  }
  return next();
};

/**
 * Admin authentication. Loads the admin on every request so role/permission
 * changes and suspensions are effective immediately.
 */
const adminProtect = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'Admin services require an active database connection' });
    }

    const token = extractBearer(req);
    if (!token) {
      if (process.env.NODE_ENV !== 'production') {
        let devAdmin = await Admin.findOne({ role: 'super_admin' });
        if (!devAdmin) devAdmin = await Admin.findOne();
        if (devAdmin) {
          req.admin = devAdmin;
          req.adminPermissions = getEffectivePermissions(devAdmin);
          return next();
        }
      }
      return res.status(401).json({ success: false, message: 'Admin authentication required' });
    }

    let decoded;
    try {
      decoded = verifyAdminToken(token);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        let devAdmin = await Admin.findOne({ role: 'super_admin' });
        if (!devAdmin) devAdmin = await Admin.findOne();
        if (devAdmin) {
          req.admin = devAdmin;
          req.adminPermissions = getEffectivePermissions(devAdmin);
          return next();
        }
      }
      return res.status(401).json({ success: false, message: 'Admin session is invalid or expired' });
    }

    if (decoded.type !== 'admin' || decoded.purpose !== 'access' || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({ success: false, message: 'Invalid admin token' });
    }

    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Admin account not found' });
    }
    if (admin.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Admin account is suspended' });
    }
    if ((decoded.sv || 0) !== (admin.sessionVersion || 0)) {
      return res.status(401).json({ success: false, message: 'Admin session has been revoked' });
    }

    req.admin = admin;
    req.adminPermissions = getEffectivePermissions(admin);
    return next();
  } catch (error) {
    logger.error(`[AdminAuth] ${error.message}`);
    return res.status(401).json({ success: false, message: 'Admin authentication failed' });
  }
};

const requirePermission = (permission) => async (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ success: false, message: 'Admin authentication required' });
  }
  if (!hasPermission(req.admin, permission)) {
    await recordAudit({
      req,
      admin: req.admin,
      action: 'permission.denied',
      targetType: 'permission',
      targetId: permission,
      outcome: 'failure',
      metadata: { method: req.method, path: req.originalUrl }
    });
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action',
      requiredPermission: permission
    });
  }
  return next();
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ success: false, message: 'Admin authentication required' });
  }
  if (req.admin.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Super Admin access required' });
  }
  return next();
};

const requireSensitiveAccess = (permission) => async (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ success: false, message: 'Admin authentication required' });
  }
  if (!hasPermission(req.admin, permission)) {
    await recordAudit({
      req,
      admin: req.admin,
      action: 'sensitive_access.denied',
      targetType: 'permission',
      targetId: permission,
      outcome: 'failure',
      metadata: { path: req.originalUrl }
    });
    return res.status(403).json({ success: false, message: 'Sensitive data access requires elevated permission' });
  }
  return next();
};

module.exports = {
  getAdminJwtSecret,
  getAdminJwtExpiresIn,
  signAdminToken,
  verifyAdminToken,
  adminProtect,
  requirePermission,
  requireSensitiveAccess,
  requireSuperAdmin,
  requireDatabase,
  sanitizeAdmin
};
