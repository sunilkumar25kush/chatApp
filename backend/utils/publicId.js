const crypto = require('crypto');

// Human-friendly base32 character set (excludes ambiguous 0, O, 1, I, L)
const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 31 characters

/**
 * Generate a cryptographically secure, permanent, human-readable Public User ID.
 * Default format: SKY-XXXXXX (e.g., SKY-7K9M2Q)
 * 
 * @param {string} [prefix] - Prefix string, defaults to process.env.USER_ID_PREFIX or 'SKY'
 * @returns {string} Formatted public ID
 */
function generatePublicId(prefix) {
  const chosenPrefix = (prefix || process.env.USER_ID_PREFIX || 'SKY').toUpperCase().trim();
  const bytes = crypto.randomBytes(6);
  const chars = [];
  
  for (let i = 0; i < 6; i++) {
    chars.push(CHARSET[bytes[i] % CHARSET.length]);
  }
  
  return `${chosenPrefix}-${chars.join('')}`;
}

/**
 * Validate whether a string is a valid public user ID format.
 * Accepts formats like SKY-7K9M2Q, CHAT-7K9M2Q, or any 3-5 char prefix followed by 6 alphanumeric chars.
 * 
 * @param {string} id - The ID to validate
 * @returns {boolean} True if format is valid
 */
function isValidPublicId(id) {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim().toUpperCase();
  // Prefix: 3 to 5 uppercase alphanumeric chars, hyphen, 6 characters from CHARSET
  const regex = /^[A-Z0-9]{3,5}-[2-9A-HJ-NP-Z]{6}$/;
  return regex.test(trimmed);
}

/**
 * Normalize public ID (trim and uppercase).
 * 
 * @param {string} id
 * @returns {string}
 */
function normalizePublicId(id) {
  return typeof id === 'string' ? id.trim().toUpperCase() : '';
}

module.exports = {
  CHARSET,
  generatePublicId,
  isValidPublicId,
  normalizePublicId
};

