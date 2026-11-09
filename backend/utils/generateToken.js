const jwt = require('jsonwebtoken');

/**
 * Generate a JWT token containing user ID and token version.
 * The token version lets administrators revoke every existing session for a
 * user immediately after a suspension, ban or forced sign-out.
 *
 * @param {string} id - User Mongoose ObjectID or memory-mode id
 * @param {number} tokenVersion - Current tokenVersion from the User document
 * @returns {string} Signed JWT token
 */
const generateToken = (id, tokenVersion = 0) => {
  const secret = process.env.JWT_SECRET || 'dev_only_insecure_secret';
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  return jwt.sign({ id, tv: Number(tokenVersion) || 0 }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  });
};

module.exports = generateToken;
