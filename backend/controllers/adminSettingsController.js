const SystemSettings = require('../models/SystemSettings');
const { recordAudit } = require('../services/adminAuditService');
const { getSettings, invalidateSettingsCache } = require('../services/settingsService');
const { requireString, sanitizeText } = require('../utils/adminValidation');

const NUMBER_RULES = {
  maxMessageLength: { min: 1, max: 10000 },
  maxRoomMembers: { min: 2, max: 100000 },
  maxFileSizeMB: { min: 1, max: 1024 }
};

const BOOLEAN_FIELDS = [
  'maintenanceMode',
  'registrationEnabled',
  'friendRequestsEnabled',
  'publicRoomCreationEnabled',
  'privateRoomCreationEnabled'
];

const FEATURE_FLAG_FIELDS = [
  'voiceCalls',
  'videoCalls',
  'screenSharing',
  'fileUploads',
  'googleAuth',
  'directMessages'
];

const RATE_LIMIT_RULES = {
  windowMinutes: { min: 1, max: 1440 },
  maxRequests: { min: 10, max: 100000 },
  authMaxAttempts: { min: 3, max: 1000 },
  friendRequestMax: { min: 1, max: 1000 }
};

const buildUpdates = (body) => {
  const updates = {};
  const changed = [];
  const errors = [];

  if (typeof body.maintenanceMessage === 'string') {
    const check = requireString(body.maintenanceMessage, { field: 'Maintenance message', min: 3, max: 500 });
    if (!check.ok) errors.push(check.message);
    else {
      updates.maintenanceMessage = check.value;
      changed.push('maintenanceMessage');
    }
  }

  BOOLEAN_FIELDS.forEach((field) => {
    if (typeof body[field] === 'boolean') {
      updates[field] = body[field];
      changed.push(field);
    }
  });

  Object.entries(NUMBER_RULES).forEach(([field, rule]) => {
    if (body[field] === undefined) return;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
      errors.push(`${field} must be between ${rule.min} and ${rule.max}`);
      return;
    }
    updates[field] = Math.round(value);
    changed.push(field);
  });

  if (Array.isArray(body.allowedUploadFormats)) {
    const formats = body.allowedUploadFormats
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
      .filter((item) => /^[a-z0-9]{1,10}$/.test(item));
    if (!formats.length) {
      errors.push('At least one valid upload format is required');
    } else {
      updates.allowedUploadFormats = Array.from(new Set(formats)).slice(0, 40);
      changed.push('allowedUploadFormats');
    }
  }

  if (body.rateLimit && typeof body.rateLimit === 'object' && !Array.isArray(body.rateLimit)) {
    const rateLimit = {};
    let rateLimitChanged = false;
    Object.entries(RATE_LIMIT_RULES).forEach(([field, rule]) => {
      if (body.rateLimit[field] === undefined) return;
      const value = Number(body.rateLimit[field]);
      if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
        errors.push(`rateLimit.${field} must be between ${rule.min} and ${rule.max}`);
        return;
      }
      rateLimit[field] = Math.round(value);
      rateLimitChanged = true;
    });
    if (rateLimitChanged) {
      updates.rateLimit = rateLimit;
      changed.push('rateLimit');
    }
  }

  if (body.featureFlags && typeof body.featureFlags === 'object' && !Array.isArray(body.featureFlags)) {
    const flags = {};
    let flagsChanged = false;
    FEATURE_FLAG_FIELDS.forEach((field) => {
      if (typeof body.featureFlags[field] === 'boolean') {
        flags[field] = body.featureFlags[field];
        flagsChanged = true;
      }
    });
    if (flagsChanged) {
      updates.featureFlags = flags;
      changed.push('featureFlags');
    }
  }

  if (body.announcement && typeof body.announcement === 'object' && !Array.isArray(body.announcement)) {
    const announcement = {};
    let announcementChanged = false;
    ['enabled', 'bannerEnabled'].forEach((field) => {
      if (typeof body.announcement[field] === 'boolean') {
        announcement[field] = body.announcement[field];
        announcementChanged = true;
      }
    });
    if (typeof body.announcement.bannerText === 'string') {
      announcement.bannerText = sanitizeText(body.announcement.bannerText, 300);
      announcementChanged = true;
    }
    if (['info', 'warning', 'maintenance'].includes(body.announcement.bannerType)) {
      announcement.bannerType = body.announcement.bannerType;
      announcementChanged = true;
    }
    if (announcementChanged) {
      updates.announcement = announcement;
      changed.push('announcement');
    }
  }

  return { updates, changed, errors };
};

/**
 * GET /api/admin/settings
 */
const getAdminSettings = async (req, res, next) => {
  try {
    const settings = await getSettings();
    return res.json({ success: true, data: settings });
  } catch (error) {
    return next(error);
  }
};

/**
 * PATCH /api/admin/settings
 */
const updateSettings = async (req, res, next) => {
  try {
    const { updates, changed, errors } = buildUpdates(req.body || {});
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }
    if (!changed.length) {
      return res.status(400).json({ success: false, message: 'No valid settings were supplied' });
    }

    const settings = await SystemSettings.getSingleton();
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'rateLimit' || key === 'featureFlags' || key === 'announcement') {
        const current = settings[key]?.toObject
          ? settings[key].toObject()
          : { ...(settings[key] || {}) };
        settings[key] = { ...current, ...value };
      } else {
        settings[key] = value;
      }
    });
    settings.updatedBy = req.admin._id;
    await settings.save();
    invalidateSettingsCache();

    await recordAudit({
      req,
      admin: req.admin,
      action: 'settings.update',
      targetType: 'settings',
      targetId: 'platform',
      reason: sanitizeText(req.body?.reason || '', 500),
      metadata: { fields: changed }
    });

    return res.json({ success: true, data: settings.toObject() });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/settings/reset
 */
const resetSettings = async (req, res, next) => {
  try {
    const defaults = new SystemSettings({ key: 'platform' }).toObject();
    delete defaults._id;
    delete defaults.key;
    delete defaults.createdAt;
    delete defaults.updatedAt;
    delete defaults.__v;
    defaults.updatedBy = req.admin._id;

    const settings = await SystemSettings.findOneAndUpdate(
      { key: 'platform' },
      { $set: defaults },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    invalidateSettingsCache();

    await recordAudit({
      req,
      admin: req.admin,
      action: 'settings.reset',
      targetType: 'settings',
      targetId: 'platform',
      reason: sanitizeText(req.body?.reason || '', 500)
    });

    return res.json({ success: true, data: settings.toObject() });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getAdminSettings, updateSettings, resetSettings };
