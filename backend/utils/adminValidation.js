const mongoose = require('mongoose');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parsePagination = (query = {}, options = {}) => {
  const maxLimit = options.maxLimit || 100;
  const defaultLimit = options.defaultLimit || 20;
  const allowedSorts = options.allowedSorts || ['createdAt'];
  const defaultSort = options.defaultSort || 'createdAt';

  let page = toInt(query.page, 1);
  if (page < 1) page = 1;
  let limit = toInt(query.limit, defaultLimit);
  if (limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const sort = allowedSorts.includes(query.sort) ? query.sort : defaultSort;
  const order = String(query.order || '').toLowerCase() === 'asc' ? 1 : -1;

  return { page, limit, skip: (page - 1) * limit, sort, order };
};

const buildPagination = (total, page, limit) => ({
  total,
  page,
  limit,
  pages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1
});

const isEmail = (value) => /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/.test(String(value || '').trim());

const requireString = (value, { field = 'field', min = 1, max = 5000 } = {}) => {
  if (typeof value !== 'string') {
    return { ok: false, message: `${field} is required` };
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return { ok: false, message: `${field} must be at least ${min} character${min === 1 ? '' : 's'}` };
  }
  if (trimmed.length > max) {
    return { ok: false, message: `${field} must be at most ${max} characters` };
  }
  return { ok: true, value: trimmed };
};

const validateAdminPassword = (password) => {
  if (typeof password !== 'string' || password.length < 10) {
    return { ok: false, message: 'Password must be at least 10 characters long' };
  }
  if (password.length > 200) {
    return { ok: false, message: 'Password is too long' };
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must contain uppercase, lowercase and numeric characters' };
  }
  return { ok: true, value: password };
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const sanitizeText = (value, max = 5000) => {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
};

module.exports = {
  escapeRegex,
  isValidObjectId,
  toInt,
  parsePagination,
  buildPagination,
  isEmail,
  requireString,
  validateAdminPassword,
  parseDate,
  getClientIp,
  sanitizeText
};
