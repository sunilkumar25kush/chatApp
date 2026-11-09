const {
  getDashboardData,
  getAnalyticsData
} = require('../services/adminAnalyticsService');
const { getSettings } = require('../services/settingsService');

const clampDays = (value, fallback = 30) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 7), 365);
};

/**
 * GET /api/admin/dashboard
 */
const getDashboard = async (req, res, next) => {
  try {
    const days = clampDays(req.query.days, 30);
    const data = await getDashboardData({ days });
    return res.json({ success: true, data });
  } catch (error) {
    if (error.message === 'Database unavailable') {
      return res.status(503).json({ success: false, message: 'Dashboard requires an active database' });
    }
    return next(error);
  }
};

/**
 * GET /api/admin/analytics
 */
const getAnalytics = async (req, res, next) => {
  try {
    const days = clampDays(req.query.days, 30);
    const data = await getAnalyticsData({ days });
    return res.json({ success: true, data });
  } catch (error) {
    if (error.message === 'Database unavailable') {
      return res.status(503).json({ success: false, message: 'Analytics requires an active database' });
    }
    return next(error);
  }
};

/**
 * GET /api/settings/public
 * Safe, unauthenticated subset used by the user-facing app (banner, maintenance).
 */
const getPublicSettings = async (req, res, next) => {
  try {
    const settings = await getSettings();
    return res.json({
      success: true,
      data: {
        maintenanceMode: Boolean(settings.maintenanceMode),
        maintenanceMessage: settings.maintenanceMessage,
        registrationEnabled: Boolean(settings.registrationEnabled),
        maxMessageLength: settings.maxMessageLength,
        maxFileSizeMB: settings.maxFileSizeMB,
        allowedUploadFormats: settings.allowedUploadFormats || [],
        featureFlags: settings.featureFlags,
        announcement: {
          bannerEnabled: Boolean(settings.announcement?.bannerEnabled),
          bannerText: settings.announcement?.bannerText || '',
          bannerType: settings.announcement?.bannerType || 'info'
        }
      }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getDashboard, getAnalytics, getPublicSettings };
