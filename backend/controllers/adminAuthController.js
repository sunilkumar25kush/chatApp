const Admin = require('../models/Admin');
const { recordAudit } = require('../services/adminAuditService');
const { signAdminToken, verifyAdminToken } = require('../middleware/adminAuth');
const { sanitizeAdmin } = require('../utils/adminPermissions');
const { getClientIp, isEmail, validateAdminPassword, requireString } = require('../utils/adminValidation');
const { generateSecret, verifyTotp, buildOtpauthUrl } = require('../utils/totp');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const getIp = (req) => getClientIp(req);
const getUserAgent = (req) => String(req.headers['user-agent'] || '').slice(0, 500);

const pushLoginHistory = (entry) => ({
  $push: { loginHistory: { $each: [entry], $slice: -20 } }
});

const finalizeLogin = async (req, res, adminDoc) => {
  const ip = getIp(req);
  const userAgent = getUserAgent(req);
  const admin = await Admin.findByIdAndUpdate(
    adminDoc._id,
    {
      $set: {
        failedLoginAttempts: 0,
        lockUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip
      },
      ...pushLoginHistory({ at: new Date(), ip, userAgent, success: true, reason: 'password' })
    },
    { new: true }
  );

  const token = signAdminToken(admin);
  await recordAudit({
    req,
    admin,
    action: 'admin.login',
    targetType: 'admin',
    targetId: admin._id.toString(),
    metadata: { mfa: admin.mfaEnabled }
  });

  return res.json({
    success: true,
    token,
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h',
    admin: sanitizeAdmin(admin)
  });
};

/**
 * POST /api/admin/auth/login
 */
const loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const ip = getIp(req);
    const userAgent = getUserAgent(req);
    const admin = await Admin.findOne({ email: normalizedEmail }).select('+passwordHash +mfaSecret +pendingMfaSecret');

    if (!admin) {
      await recordAudit({
        req,
        admin: null,
        action: 'admin.login.failed',
        targetType: 'admin',
        targetId: normalizedEmail,
        outcome: 'failure',
        metadata: { reason: 'unknown_email' }
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (admin.isLocked()) {
      await recordAudit({
        req,
        admin,
        action: 'admin.login.locked',
        targetType: 'admin',
        targetId: admin._id.toString(),
        outcome: 'failure'
      });
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Please try again later.',
        retryAfterMinutes: Math.ceil((admin.lockUntil.getTime() - Date.now()) / 60000)
      });
    }

    const passwordMatches = await admin.matchPassword(password);
    if (!passwordMatches) {
      const attempts = (admin.failedLoginAttempts || 0) + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
      await Admin.updateOne(
        { _id: admin._id },
        {
          $set: {
            failedLoginAttempts: attempts,
            lockUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null
          },
          ...pushLoginHistory({ at: new Date(), ip, userAgent, success: false, reason: 'bad_password' })
        }
      );
      await recordAudit({
        req,
        admin,
        action: 'admin.login.failed',
        targetType: 'admin',
        targetId: admin._id.toString(),
        outcome: 'failure',
        metadata: { reason: 'bad_password', attempts, locked: shouldLock }
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (admin.status !== 'active') {
      await recordAudit({
        req,
        admin,
        action: 'admin.login.failed',
        targetType: 'admin',
        targetId: admin._id.toString(),
        outcome: 'failure',
        metadata: { reason: 'suspended' }
      });
      return res.status(403).json({ success: false, message: 'This admin account is suspended' });
    }

    if (admin.mfaEnabled) {
      const challengeToken = signAdminToken(admin, { purpose: 'mfa', expiresIn: '5m' });
      return res.json({
        success: true,
        mfaRequired: true,
        challengeToken,
        message: 'Enter the 6-digit code from your authenticator app'
      });
    }

    return finalizeLogin(req, res, admin);
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/auth/mfa
 */
const verifyMfaChallenge = async (req, res, next) => {
  try {
    const { challengeToken, code } = req.body || {};
    if (!challengeToken || !code) {
      return res.status(400).json({ success: false, message: 'MFA challenge and code are required' });
    }

    let decoded;
    try {
      decoded = verifyAdminToken(challengeToken);
    } catch {
      return res.status(401).json({ success: false, message: 'MFA challenge expired. Sign in again.' });
    }
    if (decoded.type !== 'admin' || decoded.purpose !== 'mfa') {
      return res.status(401).json({ success: false, message: 'Invalid MFA challenge' });
    }

    const admin = await Admin.findById(decoded.id).select('+mfaSecret +passwordHash');
    if (!admin || admin.status !== 'active' || (decoded.sv || 0) !== (admin.sessionVersion || 0)) {
      return res.status(401).json({ success: false, message: 'MFA challenge is no longer valid' });
    }
    if (admin.isLocked()) {
      return res.status(429).json({ success: false, message: 'Account temporarily locked. Try again later.' });
    }
    if (!admin.mfaSecret || !verifyTotp(admin.mfaSecret, code)) {
      const attempts = (admin.failedLoginAttempts || 0) + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
      await Admin.updateOne(
        { _id: admin._id },
        {
          $set: {
            failedLoginAttempts: attempts,
            lockUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null
          },
          ...pushLoginHistory({ at: new Date(), ip: getIp(req), userAgent: getUserAgent(req), success: false, reason: 'bad_mfa' })
        }
      );
      await recordAudit({
        req,
        admin,
        action: 'admin.mfa.failed',
        targetType: 'admin',
        targetId: admin._id.toString(),
        outcome: 'failure'
      });
      return res.status(401).json({ success: false, message: 'Invalid authentication code' });
    }

    return finalizeLogin(req, res, admin);
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/auth/me
 */
const getMe = async (req, res) => {
  return res.json({
    success: true,
    admin: sanitizeAdmin(req.admin)
  });
};

/**
 * POST /api/admin/auth/logout
 * Revokes every session for this admin account.
 */
const logoutAdmin = async (req, res, next) => {
  try {
    await Admin.findByIdAndUpdate(req.admin._id, { $inc: { sessionVersion: 1 } });
    await recordAudit({
      req,
      admin: req.admin,
      action: 'admin.logout',
      targetType: 'admin',
      targetId: req.admin._id.toString()
    });
    return res.json({ success: true, message: 'Signed out from all admin sessions' });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/auth/login-history
 */
const getLoginHistory = async (req, res) => {
  const history = (req.admin.loginHistory || [])
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  return res.json({ success: true, history });
};

/**
 * POST /api/admin/auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required' });
    }
    const validation = validateAdminPassword(newPassword);
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const admin = await Admin.findById(req.admin._id).select('+passwordHash');
    if (!admin || !(await admin.matchPassword(currentPassword))) {
      await recordAudit({
        req,
        admin: req.admin,
        action: 'admin.password.change',
        targetType: 'admin',
        targetId: req.admin._id.toString(),
        outcome: 'failure'
      });
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    admin.passwordHash = newPassword;
    admin.sessionVersion = (admin.sessionVersion || 0) + 1;
    await admin.save();
    const token = signAdminToken(admin);
    await recordAudit({
      req,
      admin,
      action: 'admin.password.change',
      targetType: 'admin',
      targetId: admin._id.toString()
    });
    return res.json({ success: true, message: 'Password updated', token, admin: sanitizeAdmin(admin) });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/auth/mfa/setup
 */
const setupMfa = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.admin._id).select('+pendingMfaSecret');
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    const secret = generateSecret();
    admin.pendingMfaSecret = secret;
    await admin.save();
    await recordAudit({
      req,
      admin,
      action: 'admin.mfa.setup_started',
      targetType: 'admin',
      targetId: admin._id.toString()
    });
    return res.json({
      success: true,
      secret,
      otpauthUrl: buildOtpauthUrl({ secret, label: admin.email, issuer: 'ChatRoom Admin' })
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/auth/mfa/enable
 */
const enableMfa = async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ success: false, message: 'Authentication code is required' });
    const admin = await Admin.findById(req.admin._id).select('+pendingMfaSecret +mfaSecret');
    if (!admin?.pendingMfaSecret) {
      return res.status(400).json({ success: false, message: 'Start MFA setup first' });
    }
    if (!verifyTotp(admin.pendingMfaSecret, code)) {
      return res.status(400).json({ success: false, message: 'Invalid authentication code' });
    }
    admin.mfaSecret = admin.pendingMfaSecret;
    admin.pendingMfaSecret = null;
    admin.mfaEnabled = true;
    await admin.save();
    await recordAudit({
      req,
      admin,
      action: 'admin.mfa.enabled',
      targetType: 'admin',
      targetId: admin._id.toString()
    });
    return res.json({ success: true, message: 'MFA enabled', admin: sanitizeAdmin(admin) });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/auth/mfa/disable
 */
const disableMfa = async (req, res, next) => {
  try {
    const { password, code } = req.body || {};
    if (!password || !code) {
      return res.status(400).json({ success: false, message: 'Password and authentication code are required' });
    }
    const admin = await Admin.findById(req.admin._id).select('+passwordHash +mfaSecret');
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    if (!(await admin.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Password is incorrect' });
    }
    if (!admin.mfaSecret || !verifyTotp(admin.mfaSecret, code)) {
      return res.status(400).json({ success: false, message: 'Invalid authentication code' });
    }
    admin.mfaEnabled = false;
    admin.mfaSecret = null;
    admin.pendingMfaSecret = null;
    await admin.save();
    await recordAudit({
      req,
      admin,
      action: 'admin.mfa.disabled',
      targetType: 'admin',
      targetId: admin._id.toString()
    });
    return res.json({ success: true, message: 'MFA disabled', admin: sanitizeAdmin(admin) });
  } catch (error) {
    return next(error);
  }
};

/**
 * PATCH /api/admin/auth/profile
 */
const updateOwnProfile = async (req, res, next) => {
  try {
    const { username } = req.body || {};
    const validation = requireString(username, { field: 'Username', min: 3, max: 40 });
    if (!validation.ok) return res.status(400).json({ success: false, message: validation.message });
    const exists = await Admin.findOne({ username: validation.value, _id: { $ne: req.admin._id } });
    if (exists) return res.status(400).json({ success: false, message: 'Username is already taken' });
    const admin = await Admin.findByIdAndUpdate(
      req.admin._id,
      { $set: { username: validation.value } },
      { new: true, runValidators: true }
    );
    await recordAudit({
      req,
      admin,
      action: 'admin.profile.update',
      targetType: 'admin',
      targetId: admin._id.toString(),
      metadata: { fields: ['username'] }
    });
    return res.json({ success: true, admin: sanitizeAdmin(admin) });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  loginAdmin,
  verifyMfaChallenge,
  getMe,
  logoutAdmin,
  getLoginHistory,
  changePassword,
  setupMfa,
  enableMfa,
  disableMfa,
  updateOwnProfile
};
