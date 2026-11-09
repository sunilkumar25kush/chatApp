const Admin = require('../models/Admin');
const { recordAudit } = require('../services/adminAuditService');
const {
  ROLES,
  ROLE_META,
  ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  ALL_PERMISSIONS,
  isValidRole,
  sanitizeAdmin
} = require('../utils/adminPermissions');
const {
  isValidObjectId,
  parsePagination,
  buildPagination,
  requireString,
  isEmail,
  validateAdminPassword,
  escapeRegex
} = require('../utils/adminValidation');

const countSuperAdmins = (excludeId = null) => {
  const query = { role: 'super_admin', status: 'active' };
  if (excludeId) query._id = { $ne: excludeId };
  return Admin.countDocuments(query);
};

const getRolesAndPermissions = async (req, res, next) => {
  try {
    const counts = await Admin.aggregate([
      { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } }
    ]);
    const roleCounts = {};
    counts.forEach((row) => {
      if (!roleCounts[row._id.role]) roleCounts[row._id.role] = { total: 0, active: 0, suspended: 0 };
      roleCounts[row._id.role].total += row.count;
      if (row._id.status === 'active') roleCounts[row._id.role].active += row.count;
      if (row._id.status === 'suspended') roleCounts[row._id.role].suspended += row.count;
    });

    return res.json({
      success: true,
      data: {
        roles: ROLES.map((role) => ({
          key: role,
          ...ROLE_META[role],
          defaultPermissions: ROLE_PERMISSIONS[role],
          counts: roleCounts[role] || { total: 0, active: 0, suspended: 0 }
        })),
        permissions: PERMISSION_CATALOG
      }
    });
  } catch (error) {
    return next(error);
  }
};

const listAdmins = async (req, res, next) => {
  try {
    const { page, limit, skip, sort, order } = parsePagination(req.query, {
      defaultLimit: 20,
      maxLimit: 100,
      allowedSorts: ['createdAt', 'lastLoginAt', 'username', 'email', 'role'],
      defaultSort: 'createdAt'
    });
    const filter = {};
    if (req.query.role && isValidRole(req.query.role)) filter.role = req.query.role;
    if (['active', 'suspended'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.search) {
      const search = escapeRegex(String(req.query.search).slice(0, 100));
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Admin.countDocuments(filter);
    const admins = await Admin.find(filter)
      .sort({ [sort]: order })
      .skip(skip)
      .limit(limit)
      .select('-passwordHash -mfaSecret -pendingMfaSecret -loginHistory')
      .lean();

    return res.json({
      success: true,
      data: admins.map((admin) => sanitizeAdmin(admin)),
      pagination: buildPagination(total, page, limit)
    });
  } catch (error) {
    return next(error);
  }
};

const createAdmin = async (req, res, next) => {
  try {
    const usernameCheck = requireString(req.body?.username, { field: 'Username', min: 3, max: 40 });
    if (!usernameCheck.ok) return res.status(400).json({ success: false, message: usernameCheck.message });
    if (!isEmail(req.body?.email)) return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    const passwordCheck = validateAdminPassword(req.body?.password);
    if (!passwordCheck.ok) return res.status(400).json({ success: false, message: passwordCheck.message });
    const role = req.body?.role || 'support';
    if (!isValidRole(role)) return res.status(400).json({ success: false, message: 'Invalid admin role' });

    const requestedPermissions = Array.isArray(req.body?.permissions)
      ? Array.from(new Set(req.body.permissions.filter((p) => ALL_PERMISSIONS.includes(p))))
      : [];

    const normalizedEmail = String(req.body.email).trim().toLowerCase();
    const existing = await Admin.findOne({
      $or: [{ email: normalizedEmail }, { username: usernameCheck.value }]
    }).select('_id email username');
    if (existing) {
      return res.status(400).json({
        success: false,
        message: existing.email === normalizedEmail ? 'An admin with this email already exists' : 'Username is already taken'
      });
    }

    const admin = await Admin.create({
      username: usernameCheck.value,
      email: normalizedEmail,
      passwordHash: passwordCheck.value,
      role,
      permissions: requestedPermissions,
      status: 'active',
      createdBy: req.admin._id,
      notes: String(req.body?.notes || '').slice(0, 1000)
    });

    await recordAudit({
      req,
      admin: req.admin,
      action: 'admin.create',
      targetType: 'admin',
      targetId: admin._id.toString(),
      metadata: { role, permissions: requestedPermissions }
    });

    return res.status(201).json({ success: true, data: sanitizeAdmin(admin) });
  } catch (error) {
    return next(error);
  }
};

const updateAdmin = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid admin ID' });
    }
    const target = await Admin.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'Admin not found' });

    const isSelf = String(target._id) === String(req.admin._id);
    const updates = {};
    const changed = [];

    if (req.body?.role !== undefined) {
      if (!isValidRole(req.body.role)) return res.status(400).json({ success: false, message: 'Invalid admin role' });
      if (isSelf && req.body.role !== target.role) {
        return res.status(400).json({ success: false, message: 'You cannot change your own role' });
      }
      if (target.role === 'super_admin' && req.body.role !== 'super_admin') {
        const remaining = await countSuperAdmins(target._id);
        if (remaining < 1) {
          return res.status(400).json({ success: false, message: 'The platform must keep at least one active Super Admin' });
        }
      }
      updates.role = req.body.role;
      changed.push('role');
    }

    if (req.body?.permissions !== undefined) {
      if (!Array.isArray(req.body.permissions)) {
        return res.status(400).json({ success: false, message: 'Permissions must be an array' });
      }
      if (isSelf) {
        return res.status(400).json({ success: false, message: 'You cannot change your own granular permissions' });
      }
      updates.permissions = Array.from(new Set(req.body.permissions.filter((p) => ALL_PERMISSIONS.includes(p))));
      changed.push('permissions');
    }

    if (req.body?.notes !== undefined) {
      updates.notes = String(req.body.notes || '').slice(0, 1000);
      changed.push('notes');
    }

    if (!changed.length) return res.status(400).json({ success: false, message: 'No editable fields supplied' });

    const updated = await Admin.findByIdAndUpdate(
      target._id,
      { $set: updates, ...(updates.permissions ? { $inc: { sessionVersion: 1 } } : {}) },
      { new: true }
    );

    await recordAudit({
      req,
      admin: req.admin,
      action: 'admin.update',
      targetType: 'admin',
      targetId: target._id.toString(),
      metadata: { fields: changed, role: updated.role }
    });

    return res.json({ success: true, data: sanitizeAdmin(updated) });
  } catch (error) {
    return next(error);
  }
};

const setAdminStatus = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid admin ID' });
    }
    const status = req.body?.status;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or suspended' });
    }
    if (String(req.params.id) === String(req.admin._id)) {
      return res.status(400).json({ success: false, message: 'You cannot change your own account status' });
    }
    const target = await Admin.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'Admin not found' });
    if (target.role === 'super_admin' && status === 'suspended') {
      const remaining = await countSuperAdmins(target._id);
      if (remaining < 1) {
        return res.status(400).json({ success: false, message: 'The platform must keep at least one active Super Admin' });
      }
    }

    const updated = await Admin.findByIdAndUpdate(
      target._id,
      {
        $set: {
          status,
          suspendedReason: status === 'suspended' ? String(req.body?.reason || 'Suspended by Super Admin').slice(0, 500) : '',
          suspendedAt: status === 'suspended' ? new Date() : null
        },
        $inc: { sessionVersion: 1 }
      },
      { new: true }
    );

    await recordAudit({
      req,
      admin: req.admin,
      action: status === 'suspended' ? 'admin.suspend' : 'admin.restore',
      targetType: 'admin',
      targetId: target._id.toString(),
      reason: String(req.body?.reason || '').slice(0, 500)
    });

    return res.json({ success: true, data: sanitizeAdmin(updated) });
  } catch (error) {
    return next(error);
  }
};

const resetAdminPassword = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid admin ID' });
    }
    const passwordCheck = validateAdminPassword(req.body?.password);
    if (!passwordCheck.ok) return res.status(400).json({ success: false, message: passwordCheck.message });
    const target = await Admin.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'Admin not found' });

    target.passwordHash = passwordCheck.value;
    target.sessionVersion = (target.sessionVersion || 0) + 1;
    target.failedLoginAttempts = 0;
    target.lockUntil = null;
    await target.save();

    await recordAudit({
      req,
      admin: req.admin,
      action: 'admin.password.reset',
      targetType: 'admin',
      targetId: target._id.toString()
    });

    return res.json({ success: true, message: 'Password reset. All sessions for this admin were revoked.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getRolesAndPermissions,
  listAdmins,
  createAdmin,
  updateAdmin,
  setAdminStatus,
  resetAdminPassword
};
