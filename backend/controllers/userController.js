const User = require('../models/User');
const Message = require('../models/Message');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { memoryUsers } = require('./authController');
const { generatePublicId, isValidPublicId, normalizePublicId } = require('../utils/publicId');

const isDBConnected = () => mongoose.connection.readyState === 1;

const getUserId = (req) => (req.user?._id ? req.user._id.toString() : req.user?.id);

/**
 * @desc    Get user profile by ID
 * @route   GET /api/users/:id
 * @access  Public/Private
 */
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let user = null;

    if (isDBConnected() && mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findById(id).select('-password');
    }

    if (!user && memoryUsers) {
      user = memoryUsers.get(String(id));
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current authenticated user's permanent Public ID
 * @route   GET /api/users/my-id
 * @access  Private
 */
const getMyPublicId = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authorization failed' });
    }

    let publicId = req.user?.publicId;

    if (!publicId && isDBConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId);
      if (user) {
        if (!user.publicId) {
          user.publicId = generatePublicId();
          await user.save();
        }
        publicId = user.publicId;
      }
    }

    if (!publicId && memoryUsers) {
      const memUser = memoryUsers.get(String(userId));
      if (memUser) {
        if (!memUser.publicId) {
          memUser.publicId = generatePublicId();
        }
        publicId = memUser.publicId;
      }
    }

    if (!publicId) {
      publicId = generatePublicId();
    }

    return res.json({
      success: true,
      publicId
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Look up another user by exact Public ID
 * @route   GET /api/users/lookup/:publicId
 * @access  Private
 */
const lookupByPublicId = async (req, res, next) => {
  try {
    const rawId = req.params.publicId;
    if (!isValidPublicId(rawId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid public ID format. Expected format: SKY-XXXXXX or CHAT-XXXXXX'
      });
    }

    const normalized = normalizePublicId(rawId);
    let targetUser = null;

    if (isDBConnected()) {
      targetUser = await User.findOne({ publicId: normalized });
    }
    if (!targetUser && memoryUsers) {
      for (const u of memoryUsers.values()) {
        if (u.publicId === normalized) {
          targetUser = u;
          break;
        }
      }
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found with that public ID'
      });
    }

    // Strict security sanitization: return ONLY approved public profile fields
    // Never expose internal _id, email, password, googleId, phone, or private settings
    return res.json({
      success: true,
      user: {
        publicId: targetUser.publicId,
        username: targetUser.username,
        fullName: targetUser.fullName || '',
        avatar: targetUser.avatar,
        bio: targetUser.bio || '',
        status: targetUser.status || 'offline',
        customStatus: targetUser.customStatus || { text: '', emoji: '' },
        createdAt: targetUser.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'User authorization failed' });
    }

    // Security: publicId is permanent and immutable. Never allow updates via payload
    if (req.body.publicId !== undefined) {
      delete req.body.publicId;
    }

    let user = null;
    if (isDBConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }

    if (user) {
      // Check if username is changing and available
      if (req.body.username && req.body.username !== user.username) {
        const usernameExists = await User.findOne({ username: { $regex: new RegExp(`^${req.body.username.trim()}$`, 'i') } });
        if (usernameExists && usernameExists._id.toString() !== userId.toString()) {
          return res.status(400).json({ message: 'Username is already taken' });
        }
        user.username = req.body.username.trim();
      }

      // Ensure publicId is backfilled if missing
      if (!user.publicId) {
        user.publicId = generatePublicId();
      }

      user.fullName = req.body.fullName !== undefined ? req.body.fullName : user.fullName;
      user.bio = req.body.bio !== undefined ? req.body.bio : user.bio;
      user.phone = req.body.phone !== undefined ? req.body.phone : user.phone;
      user.location = req.body.location !== undefined ? req.body.location : user.location;
      user.website = req.body.website !== undefined ? req.body.website : user.website;
      user.github = req.body.github !== undefined ? req.body.github : user.github;
      user.linkedin = req.body.linkedin !== undefined ? req.body.linkedin : user.linkedin;

      // Handle birthday safely to avoid CastError for empty strings
      if (req.body.birthday !== undefined) {
        user.birthday = req.body.birthday ? new Date(req.body.birthday) : null;
      }

      if (req.body.avatar) user.avatar = req.body.avatar;
      if (req.body.bannerImage) user.bannerImage = req.body.bannerImage;

      // Privacy settings (Gajim-style account privacy)
      if (req.body.privacy && typeof req.body.privacy === 'object') {
        const allowedKeys = ['showOnline', 'showLastSeen', 'showReadReceipts', 'allowMessagesFrom'];
        for (const key of allowedKeys) {
          if (req.body.privacy[key] !== undefined) {
            user.privacy[key] = req.body.privacy[key];
          }
        }
      }

      // Notification preferences
      if (req.body.notificationPrefs && typeof req.body.notificationPrefs === 'object') {
        const allowedKeys = ['soundEnabled', 'desktopEnabled', 'notifyOnMessage'];
        for (const key of allowedKeys) {
          if (req.body.notificationPrefs[key] !== undefined) {
            user.notificationPrefs[key] = req.body.notificationPrefs[key];
          }
        }
      }

      const updatedUser = await user.save();
      const userObj = updatedUser.toObject();
      delete userObj.password;

      return res.json(userObj);
    }

    // Memory fallback update
    const memUser = (memoryUsers && memoryUsers.get(String(userId))) || req.user;
    if (memUser) {
      if (req.body.username && req.body.username !== memUser.username) {
        if (memoryUsers) {
          for (const [id, u] of memoryUsers.entries()) {
            if (String(id) !== String(userId) && u.username?.toLowerCase() === req.body.username.trim().toLowerCase()) {
              return res.status(400).json({ message: 'Username is already taken' });
            }
          }
        }
        memUser.username = req.body.username.trim();
      }

      if (!memUser.publicId) {
        memUser.publicId = generatePublicId();
      }

      if (req.body.fullName !== undefined) memUser.fullName = req.body.fullName;
      if (req.body.bio !== undefined) memUser.bio = req.body.bio;
      if (req.body.phone !== undefined) memUser.phone = req.body.phone;
      if (req.body.location !== undefined) memUser.location = req.body.location;
      if (req.body.website !== undefined) memUser.website = req.body.website;
      if (req.body.github !== undefined) memUser.github = req.body.github;
      if (req.body.linkedin !== undefined) memUser.linkedin = req.body.linkedin;
      if (req.body.birthday !== undefined) memUser.birthday = req.body.birthday || null;
      if (req.body.avatar) memUser.avatar = req.body.avatar;
      if (req.body.bannerImage) memUser.bannerImage = req.body.bannerImage;

      if (memoryUsers) {
        memoryUsers.set(String(userId), memUser);
      }
      return res.json(memUser);
    }

    return res.status(404).json({ message: 'User not found' });
  } catch (error) {
    logger.error('[updateProfile Error]', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Username is already taken' });
    }
    next(error);
  }
};

/**
 * @desc    Update user theme
 * @route   PUT /api/users/theme
 * @access  Private
 */
const updateTheme = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    let user = null;

    if (isDBConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }

    if (user) {
      if (req.body.theme) {
        user.theme = { ...user.theme, ...req.body.theme };
      }

      const updatedUser = await user.save();
      const userObj = updatedUser.toObject();
      delete userObj.password;

      return res.json(userObj.theme);
    }

    // Memory fallback user update
    const memUser = (memoryUsers && memoryUsers.get(String(userId))) || req.user;
    if (memUser) {
      if (req.body.theme) {
        memUser.theme = { ...(memUser.theme || {}), ...req.body.theme };
      }
      if (memoryUsers) {
        memoryUsers.set(String(userId), memUser);
      }
      return res.json(memUser.theme || req.body.theme);
    }

    return res.status(404).json({ message: 'User not found' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user personality studio settings
 * @route   PUT /api/users/personality
 * @access  Private
 */
const updatePersonality = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    let user = null;

    if (isDBConnected() && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }

    if (user) {
      if (req.body.personality) {
        user.personality = { ...user.personality, ...req.body.personality };
      }

      const updatedUser = await user.save();
      const userObj = updatedUser.toObject();
      delete userObj.password;

      return res.json(userObj.personality);
    }

    // Memory fallback update
    const memUser = (memoryUsers && memoryUsers.get(String(userId))) || req.user;
    if (memUser) {
      if (req.body.personality) {
        memUser.personality = { ...(memUser.personality || {}), ...req.body.personality };
      }
      if (memoryUsers) {
        memoryUsers.set(String(userId), memUser);
      }
      return res.json(memUser.personality || req.body.personality);
    }

    return res.status(404).json({ message: 'User not found' });
  } catch (error) {
    logger.error('[updatePersonality Error]', error);
    next(error);
  }
};

/**
 * @desc    Search users by username / full name / email (Gajim-style roster search)
 * @route   GET /api/users/search?q=term
 * @access  Private
 */
const searchUsers = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ message: 'Search query is required' });
    if (q.length < 2) return res.status(400).json({ message: 'Search query must be at least 2 characters' });

    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
    const currentUserId = getUserId(req);

    if (isDBConnected()) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const users = await User.find({
        _id: { $ne: currentUserId },
        $or: [
          { username: { $regex: escaped, $options: 'i' } },
          { fullName: { $regex: escaped, $options: 'i' } },
          { email: { $regex: escaped, $options: 'i' } }
        ]
      })
        .select('username email avatar fullName bio status lastSeen publicId')
        .limit(limit);
      return res.json({ users });
    }

    // Memory fallback
    const users = Array.from(memoryUsers.values())
      .filter((u) => String(u._id) !== String(currentUserId))
      .filter((u) => (u.username || '').toLowerCase().includes(q.toLowerCase()) || (u.email || '').toLowerCase().includes(q.toLowerCase()))
      .slice(0, limit);
    return res.json({ users });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's starred (bookmarked) messages
 * @route   GET /api/users/starred
 * @access  Private
 */
const getStarredMessages = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!isDBConnected()) {
      return res.json({ messages: [] });
    }
    const messages = await Message.find({ starredBy: userId })
      .populate('sender', 'username email avatar')
      .populate('room', 'name code')
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json({ messages });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserById,
  getMyPublicId,
  lookupByPublicId,
  updateProfile,
  updateTheme,
  updatePersonality,
  searchUsers,
  getStarredMessages
};
