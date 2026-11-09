const mongoose = require('mongoose');
const SystemSettings = require('../models/SystemSettings');

/**
 * Lightweight cached access to platform settings.
 * The cache is invalidated whenever an admin updates settings.
 */
let cache = null;
let cachedAt = 0;
const TTL_MS = 15 * 1000;

const buildDefaults = () => {
  const doc = new SystemSettings({ key: 'platform' });
  return doc.toObject();
};

const isDBConnected = () => mongoose.connection.readyState === 1;

const getSettings = async () => {
  if (cache && Date.now() - cachedAt < TTL_MS) {
    return cache;
  }
  if (!isDBConnected()) {
    return buildDefaults();
  }
  try {
    const doc = await SystemSettings.getSingleton();
    cache = doc.toObject();
    cachedAt = Date.now();
    return cache;
  } catch (err) {
    // A settings outage must never take down the whole API.
    return cache || buildDefaults();
  }
};

const invalidateSettingsCache = () => {
  cache = null;
  cachedAt = 0;
};

module.exports = {
  getSettings,
  invalidateSettingsCache
};
