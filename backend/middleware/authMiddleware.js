const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { memoryUsers } = require('../controllers/authController');
const { enforceAccountAccess } = require('../services/accountStatusService');
const logger = require('../utils/logger');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Dev convenience only — production must always set JWT_SECRET
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    return 'dev_only_insecure_secret';
  }
  return secret;
};

/**
 * Authentication Middleware to verify JWT token and attach user to request.
 * Supports both Authorization: Bearer header and HttpOnly cookie.
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Fallback: read from HttpOnly cookie (Socket.io / same-origin requests)
  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('token='));
    if (match) token = match.split('=')[1];
  }

  if (!token) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        const devUser = (await User.findOne({ username: 'sunilkumar' }).select('-password')) ||
                        (await User.findOne({ accountStatus: 'active' }).select('-password'));
        if (devUser) {
          req.user = devUser;
          return next();
        }
      } catch (e) {
        logger.error('Dev auth fallback error:', e);
      }
    }
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());

    let user = null;

    // 1. Try MongoDB if connected and ID is a valid ObjectId
    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(decoded.id)) {
      user = await User.findById(decoded.id).select('-password');
    }

    // 2. In-memory fallback store (dev mode)
    if (!user) {
      user = memoryUsers.get(decoded.id) || null;
    }

    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    // 3. Revoked sessions (suspend/ban/password/forced logout)
    if ((Number(decoded.tv) || 0) !== (Number(user.tokenVersion) || 0)) {
      return res.status(401).json({ message: 'Session has been revoked. Please sign in again.' });
    }

    // 4. Account status gate
    const access = await enforceAccountAccess(user);
    if (!access.allowed) {
      return res.status(403).json({ message: access.message });
    }

    req.user = user;
    return next();
  } catch (error) {
    logger.warn(`[Auth] ${error.message}`);
    return res.status(401).json({ message: 'Not authorized, token failed or expired' });
  }
};

module.exports = { protect, enforceAccountAccess };
