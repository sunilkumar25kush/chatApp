/**
 * Central permission catalog + role defaults for the admin panel.
 * Permissions are always resolved on the server from the Admin document.
 * The frontend may use this catalog only for presentation.
 */

const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard.view',
  USERS_VIEW: 'users.view',
  USERS_EDIT: 'users.edit',
  USERS_SUSPEND: 'users.suspend',
  USERS_BAN: 'users.ban',
  USERS_RESTORE: 'users.restore',
  USERS_DELETE: 'users.delete',
  ROOMS_VIEW: 'rooms.view',
  ROOMS_VIEW_PRIVATE: 'rooms.private.investigate',
  ROOMS_EDIT: 'rooms.edit',
  ROOMS_SUSPEND: 'rooms.suspend',
  ROOMS_DELETE: 'rooms.delete',
  ROOMS_TRANSFER: 'rooms.transfer',
  MESSAGES_VIEW: 'messages.view',
  MESSAGES_MODERATE: 'messages.moderate',
  MESSAGES_PRIVATE_INVESTIGATE: 'messages.private.investigate',
  REPORTS_VIEW: 'reports.view',
  REPORTS_ASSIGN: 'reports.assign',
  REPORTS_RESOLVE: 'reports.resolve',
  FRIENDS_VIEW: 'friends.view',
  CALLS_VIEW: 'calls.view',
  CALLS_DISCONNECT: 'calls.disconnect',
  ANNOUNCEMENTS_VIEW: 'announcements.view',
  ANNOUNCEMENTS_MANAGE: 'announcements.manage',
  ANALYTICS_VIEW: 'analytics.view',
  ROLES_VIEW: 'roles.view',
  ROLES_MANAGE: 'roles.manage',
  ADMINS_MANAGE: 'admins.manage',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage'
});

const ROLES = Object.freeze(['super_admin', 'admin', 'moderator', 'support']);

const ROLE_META = Object.freeze({
  super_admin: { label: 'Super Admin', description: 'Full platform control including roles, admins and system settings.' },
  admin: { label: 'Admin', description: 'Manage users, rooms, moderation and announcements.' },
  moderator: { label: 'Moderator', description: 'Review reports and moderate users, rooms and messages.' },
  support: { label: 'Support Agent', description: 'Read-only investigation and report triage.' }
});

const P = PERMISSIONS;

const ROLE_PERMISSIONS = Object.freeze({
  super_admin: ['*'],
  admin: [
    P.DASHBOARD_VIEW,
    P.USERS_VIEW, P.USERS_EDIT, P.USERS_SUSPEND, P.USERS_BAN, P.USERS_RESTORE,
    P.ROOMS_VIEW, P.ROOMS_EDIT, P.ROOMS_SUSPEND, P.ROOMS_DELETE, P.ROOMS_TRANSFER,
    P.MESSAGES_VIEW, P.MESSAGES_MODERATE,
    P.REPORTS_VIEW, P.REPORTS_ASSIGN, P.REPORTS_RESOLVE,
    P.FRIENDS_VIEW,
    P.CALLS_VIEW, P.CALLS_DISCONNECT,
    P.ANNOUNCEMENTS_VIEW, P.ANNOUNCEMENTS_MANAGE,
    P.ANALYTICS_VIEW,
    P.ROLES_VIEW,
    P.SETTINGS_VIEW
  ],
  moderator: [
    P.DASHBOARD_VIEW,
    P.USERS_VIEW, P.USERS_SUSPEND, P.USERS_RESTORE,
    P.ROOMS_VIEW, P.ROOMS_SUSPEND,
    P.MESSAGES_VIEW, P.MESSAGES_MODERATE,
    P.REPORTS_VIEW, P.REPORTS_ASSIGN, P.REPORTS_RESOLVE,
    P.FRIENDS_VIEW,
    P.CALLS_VIEW,
    P.ANALYTICS_VIEW
  ],
  support: [
    P.DASHBOARD_VIEW,
    P.USERS_VIEW,
    P.ROOMS_VIEW,
    P.MESSAGES_VIEW,
    P.REPORTS_VIEW, P.REPORTS_ASSIGN,
    P.FRIENDS_VIEW,
    P.CALLS_VIEW,
    P.ANNOUNCEMENTS_VIEW,
    P.ANALYTICS_VIEW
  ]
});

const PERMISSION_CATALOG = [
  { key: P.DASHBOARD_VIEW, group: 'Dashboard', label: 'View dashboard', description: 'See platform statistics and analytics.' },
  { key: P.USERS_VIEW, group: 'Users', label: 'View users', description: 'Browse user profiles and activity metadata.' },
  { key: P.USERS_EDIT, group: 'Users', label: 'Edit users', description: 'Edit permitted profile fields.' },
  { key: P.USERS_SUSPEND, group: 'Users', label: 'Suspend users', description: 'Temporarily suspend accounts.' },
  { key: P.USERS_BAN, group: 'Users', label: 'Ban users', description: 'Permanently ban accounts.' },
  { key: P.USERS_RESTORE, group: 'Users', label: 'Restore users', description: 'Restore suspended or banned accounts.' },
  { key: P.USERS_DELETE, group: 'Users', label: 'Delete users', description: 'Run the controlled account deletion workflow.' },
  { key: P.ROOMS_VIEW, group: 'Rooms', label: 'View rooms', description: 'Browse room metadata.' },
  { key: P.ROOMS_VIEW_PRIVATE, group: 'Rooms', label: 'Investigate private rooms', description: 'Access restricted private room metadata and content.' },
  { key: P.ROOMS_EDIT, group: 'Rooms', label: 'Edit rooms', description: 'Change permitted room settings.' },
  { key: P.ROOMS_SUSPEND, group: 'Rooms', label: 'Suspend rooms', description: 'Suspend and restore rooms.' },
  { key: P.ROOMS_DELETE, group: 'Rooms', label: 'Remove rooms', description: 'Soft-delete violating rooms.' },
  { key: P.ROOMS_TRANSFER, group: 'Rooms', label: 'Transfer ownership', description: 'Transfer room ownership.' },
  { key: P.MESSAGES_VIEW, group: 'Messages', label: 'View reported messages', description: 'Review reported room messages.' },
  { key: P.MESSAGES_MODERATE, group: 'Messages', label: 'Moderate messages', description: 'Remove and restore violating messages.' },
  { key: P.MESSAGES_PRIVATE_INVESTIGATE, group: 'Messages', label: 'Investigate private messages', description: 'Access private DM evidence through an audited workflow.' },
  { key: P.REPORTS_VIEW, group: 'Reports', label: 'View reports', description: 'View the moderation report queue.' },
  { key: P.REPORTS_ASSIGN, group: 'Reports', label: 'Assign reports', description: 'Assign reports to moderators.' },
  { key: P.REPORTS_RESOLVE, group: 'Reports', label: 'Resolve reports', description: 'Record moderation decisions.' },
  { key: P.FRIENDS_VIEW, group: 'Friends', label: 'View connection metadata', description: 'View friend request metadata (never private messages).' },
  { key: P.CALLS_VIEW, group: 'Calls', label: 'View calls', description: 'Monitor active and historical call metadata.' },
  { key: P.CALLS_DISCONNECT, group: 'Calls', label: 'Disconnect calls', description: 'Force-end abusive call sessions.' },
  { key: P.ANNOUNCEMENTS_VIEW, group: 'Announcements', label: 'View announcements', description: 'View announcement history.' },
  { key: P.ANNOUNCEMENTS_MANAGE, group: 'Announcements', label: 'Manage announcements', description: 'Create, schedule, send and cancel announcements.' },
  { key: P.ANALYTICS_VIEW, group: 'Analytics', label: 'View analytics', description: 'View growth and engagement analytics.' },
  { key: P.ROLES_VIEW, group: 'Roles', label: 'View roles', description: 'View roles and admin accounts.' },
  { key: P.ROLES_MANAGE, group: 'Roles', label: 'Manage roles', description: 'Change admin roles and granular permissions.' },
  { key: P.ADMINS_MANAGE, group: 'Roles', label: 'Manage admins', description: 'Create, suspend and restore admin accounts.' },
  { key: P.AUDIT_VIEW, group: 'Audit', label: 'View audit logs', description: 'Read the append-only admin audit trail.' },
  { key: P.SETTINGS_VIEW, group: 'Settings', label: 'View settings', description: 'View platform configuration.' },
  { key: P.SETTINGS_MANAGE, group: 'Settings', label: 'Manage settings', description: 'Change platform configuration and feature flags.' }
];

const ALL_PERMISSIONS = PERMISSION_CATALOG.map((item) => item.key);

const isValidRole = (role) => ROLES.includes(role);

const getEffectivePermissions = (admin) => {
  if (!admin) return [];
  const role = admin.role;
  const base = ROLE_PERMISSIONS[role] || [];
  if (base.includes('*')) return ALL_PERMISSIONS.slice();
  const extra = Array.isArray(admin.permissions) ? admin.permissions : [];
  return Array.from(new Set([...base, ...extra].filter((p) => ALL_PERMISSIONS.includes(p))));
};

const hasPermission = (admin, permission) => {
  if (!admin) return false;
  const effective = getEffectivePermissions(admin);
  if (effective.includes('*')) return true;
  return effective.includes(permission);
};

const sanitizeAdmin = (admin) => {
  if (!admin) return null;
  const obj = typeof admin.toObject === 'function' ? admin.toObject() : { ...admin };
  delete obj.passwordHash;
  delete obj.mfaSecret;
  delete obj.pendingMfaSecret;
  return {
    ...obj,
    permissions: getEffectivePermissions(admin),
    explicitPermissions: Array.isArray(admin.permissions) ? admin.permissions : []
  };
};

module.exports = {
  PERMISSIONS,
  ROLES,
  ROLE_META,
  ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  ALL_PERMISSIONS,
  isValidRole,
  getEffectivePermissions,
  hasPermission,
  sanitizeAdmin
};
