const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const {
  adminProtect,
  requirePermission,
  requireSuperAdmin,
  requireDatabase
} = require('../middleware/adminAuth');
const { PERMISSIONS: P } = require('../utils/adminPermissions');

const adminAuthController = require('../controllers/adminAuthController');
const adminDashboardController = require('../controllers/adminDashboardController');
const adminUserController = require('../controllers/adminUserController');
const adminRoomController = require('../controllers/adminRoomController');
const adminMessageController = require('../controllers/adminMessageController');
const adminReportController = require('../controllers/adminReportController');
const adminFriendController = require('../controllers/adminFriendController');
const adminCallController = require('../controllers/adminCallController');
const adminAnnouncementController = require('../controllers/adminAnnouncementController');
const adminRoleController = require('../controllers/adminRoleController');
const adminAuditController = require('../controllers/adminAuditController');
const adminSettingsController = require('../controllers/adminSettingsController');

// Brute-force protection for admin sign-in and MFA verification.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many admin sign-in attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const adminMfaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many MFA attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Broad but bounded limiter for authenticated admin traffic.
const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: { success: false, message: 'Too many admin requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.use(requireDatabase);

// ── Public admin auth ────────────────────────────────────────────────
router.post('/auth/login', adminLoginLimiter, adminAuthController.loginAdmin);
router.post('/auth/mfa', adminMfaLimiter, adminAuthController.verifyMfaChallenge);

// Everything below requires a valid, versioned admin JWT.
router.use(adminProtect);
router.use(adminApiLimiter);

// Administrators must enrol in MFA before accessing operational data.
// Set ADMIN_REQUIRE_MFA=false only for local testing.
const requireMfaEnrollment = (req, res, next) => {
  if (process.env.ADMIN_REQUIRE_MFA === 'false' || process.env.NODE_ENV !== 'production') return next();
  if (req.admin?.mfaEnabled) return next();
  if (String(req.path || '').startsWith('/auth/')) return next();
  return res.status(403).json({
    success: false,
    code: 'MFA_SETUP_REQUIRED',
    message: 'Two-factor authentication must be enabled before using the admin panel.'
  });
};
router.use(requireMfaEnrollment);

router.get('/auth/me', adminAuthController.getMe);
router.post('/auth/logout', adminAuthController.logoutAdmin);
router.get('/auth/login-history', adminAuthController.getLoginHistory);
router.post('/auth/change-password', adminAuthController.changePassword);
router.post('/auth/mfa/setup', adminAuthController.setupMfa);
router.post('/auth/mfa/enable', adminAuthController.enableMfa);
router.post('/auth/mfa/disable', adminAuthController.disableMfa);
router.patch('/auth/profile', adminAuthController.updateOwnProfile);

// ── Dashboard & analytics ────────────────────────────────────────────
router.get('/dashboard', requirePermission(P.DASHBOARD_VIEW), adminDashboardController.getDashboard);
router.get('/analytics', requirePermission(P.ANALYTICS_VIEW), adminDashboardController.getAnalytics);

// ── Users ────────────────────────────────────────────────────────────
router.get('/users', requirePermission(P.USERS_VIEW), adminUserController.listUsers);
router.get('/users/:id', requirePermission(P.USERS_VIEW), adminUserController.getUserDetail);
router.patch('/users/:id', requirePermission(P.USERS_EDIT), adminUserController.updateUser);
router.post('/users/:id/suspend', requirePermission(P.USERS_SUSPEND), adminUserController.suspendUserAccount);
router.post('/users/:id/ban', requirePermission(P.USERS_BAN), adminUserController.banUserAccount);
router.post('/users/:id/restore', requirePermission(P.USERS_RESTORE), adminUserController.restoreUserAccount);
router.delete('/users/:id', requirePermission(P.USERS_DELETE), adminUserController.deleteUserAccount);
router.post('/users/:id/revoke-sessions', requirePermission(P.USERS_EDIT), adminUserController.revokeSessions);

// ── Rooms ────────────────────────────────────────────────────────────
router.get('/rooms', requirePermission(P.ROOMS_VIEW), adminRoomController.listRooms);
router.get('/rooms/:id/members', requirePermission(P.ROOMS_VIEW), adminRoomController.getRoomMembers);
router.get('/rooms/:id/join-requests', requirePermission(P.ROOMS_VIEW), adminRoomController.getRoomJoinRequests);
router.get('/rooms/:id/reports', requirePermission(P.ROOMS_VIEW), adminRoomController.getRoomReports);
router.get('/rooms/:id', requirePermission(P.ROOMS_VIEW), adminRoomController.getRoomDetail);
router.patch('/rooms/:id', requirePermission(P.ROOMS_EDIT), adminRoomController.updateRoom);
router.post('/rooms/:id/suspend', requirePermission(P.ROOMS_SUSPEND), adminRoomController.suspendRoom);
router.post('/rooms/:id/restore', requirePermission(P.ROOMS_SUSPEND), adminRoomController.restoreRoom);
router.delete('/rooms/:id', requirePermission(P.ROOMS_DELETE), adminRoomController.deleteRoom);
router.post('/rooms/:id/transfer', requirePermission(P.ROOMS_TRANSFER), adminRoomController.transferRoomOwnership);

// ── Messages ─────────────────────────────────────────────────────────
router.get('/messages/reported', requirePermission(P.MESSAGES_VIEW), adminMessageController.listReportedMessages);
router.post('/messages/warn', requirePermission(P.MESSAGES_MODERATE), adminMessageController.warnUser);
router.get('/messages/:id', requirePermission(P.MESSAGES_VIEW), adminMessageController.getReportedMessageDetail);
router.post('/messages/:id/remove', requirePermission(P.MESSAGES_MODERATE), adminMessageController.removeMessage);
router.post('/messages/:id/restore', requirePermission(P.MESSAGES_MODERATE), adminMessageController.restoreMessage);

// ── Reports ──────────────────────────────────────────────────────────
router.get('/reports', requirePermission(P.REPORTS_VIEW), adminReportController.listReports);
router.get('/reports/stats', requirePermission(P.REPORTS_VIEW), adminReportController.getReportStats);
router.get('/reports/assignees', requirePermission(P.REPORTS_VIEW), adminReportController.listAssignees);
router.get('/reports/:id', requirePermission(P.REPORTS_VIEW), adminReportController.getReportDetail);
router.post('/reports/:id/assign', requirePermission(P.REPORTS_ASSIGN), adminReportController.assignReport);
router.patch('/reports/:id/status', requirePermission(P.REPORTS_RESOLVE), adminReportController.updateReportStatus);
router.post('/reports/:id/resolve', requirePermission(P.REPORTS_RESOLVE), adminReportController.resolveReport);

// ── Friend management ────────────────────────────────────────────────
router.get('/friends', requirePermission(P.FRIENDS_VIEW), adminFriendController.listFriendships);
router.get('/friends/stats', requirePermission(P.FRIENDS_VIEW), adminFriendController.getFriendshipStats);

// ── Calls ────────────────────────────────────────────────────────────
router.get('/calls/active', requirePermission(P.CALLS_VIEW), adminCallController.listActiveCalls);
router.get('/calls/history', requirePermission(P.CALLS_VIEW), adminCallController.listCallHistory);
router.get('/calls/stats', requirePermission(P.CALLS_VIEW), adminCallController.getCallStats);
router.get('/calls/:id', requirePermission(P.CALLS_VIEW), adminCallController.getCallDetail);
router.post('/calls/:id/terminate', requirePermission(P.CALLS_DISCONNECT), adminCallController.terminateCall);

// ── Announcements ────────────────────────────────────────────────────
router.get('/announcements', requirePermission(P.ANNOUNCEMENTS_VIEW), adminAnnouncementController.listAnnouncements);
router.get('/announcements/stats', requirePermission(P.ANNOUNCEMENTS_VIEW), adminAnnouncementController.getAnnouncementStats);
router.get('/announcements/:id', requirePermission(P.ANNOUNCEMENTS_VIEW), adminAnnouncementController.getAnnouncement);
router.post('/announcements', requirePermission(P.ANNOUNCEMENTS_MANAGE), adminAnnouncementController.createAnnouncement);
router.patch('/announcements/:id', requirePermission(P.ANNOUNCEMENTS_MANAGE), adminAnnouncementController.updateAnnouncement);
router.post('/announcements/:id/send', requirePermission(P.ANNOUNCEMENTS_MANAGE), adminAnnouncementController.sendAnnouncement);
router.post('/announcements/:id/cancel', requirePermission(P.ANNOUNCEMENTS_MANAGE), adminAnnouncementController.cancelAnnouncement);

// ── Roles, permissions & admin accounts ──────────────────────────────
router.get('/roles', requirePermission(P.ROLES_VIEW), adminRoleController.getRolesAndPermissions);
router.get('/roles/admins', requirePermission(P.ROLES_VIEW), adminRoleController.listAdmins);
router.post('/roles/admins', requireSuperAdmin, requirePermission(P.ADMINS_MANAGE), adminRoleController.createAdmin);
router.patch('/roles/admins/:id', requireSuperAdmin, requirePermission(P.ROLES_MANAGE), adminRoleController.updateAdmin);
router.post('/roles/admins/:id/status', requireSuperAdmin, requirePermission(P.ADMINS_MANAGE), adminRoleController.setAdminStatus);
router.post('/roles/admins/:id/reset-password', requireSuperAdmin, requirePermission(P.ADMINS_MANAGE), adminRoleController.resetAdminPassword);

// ── Audit logs (read-only) ───────────────────────────────────────────
router.get('/audit-logs', requirePermission(P.AUDIT_VIEW), adminAuditController.listAuditLogs);
router.get('/audit-logs/stats', requirePermission(P.AUDIT_VIEW), adminAuditController.getAuditStats);
router.get('/audit-logs/:id', requirePermission(P.AUDIT_VIEW), adminAuditController.getAuditLog);

// ── System settings ──────────────────────────────────────────────────
router.get('/settings', requirePermission(P.SETTINGS_VIEW), adminSettingsController.getAdminSettings);
router.patch('/settings', requirePermission(P.SETTINGS_MANAGE), adminSettingsController.updateSettings);
router.post('/settings/reset', requirePermission(P.SETTINGS_MANAGE), adminSettingsController.resetSettings);

module.exports = router;
