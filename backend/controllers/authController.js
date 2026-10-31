const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { generatePublicId } = require('../utils/publicId');

// In-memory fallback store when MongoDB is not connected yet
const memoryUsers = new Map();

/**
 * Check if MongoDB connection is active
 */
const isDBConnected = () => mongoose.connection.readyState === 1;

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const registerUser = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please fill in all fields (username, email, password)' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const normalizedEmail = email.toLowerCase();
    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;

    if (isDBConnected()) {
      // MongoDB database mode
      const userExists = await User.findOne({
        $or: [{ email: normalizedEmail }, { username }]
      });

      if (userExists) {
        if (userExists.email === normalizedEmail) {
          return res.status(400).json({ message: 'An account with this email already exists' });
        }
        return res.status(400).json({ message: 'Username is already taken' });
      }

      // Safe creation with retry for unique publicId under concurrent registrations
      let user = null;
      let attempts = 0;
      while (attempts < 5) {
        try {
          user = await User.create({
            username,
            email: normalizedEmail,
            password,
            avatar,
            publicId: generatePublicId()
          });
          break;
        } catch (createErr) {
          if (createErr.code === 11000 && createErr.keyPattern && createErr.keyPattern.publicId) {
            attempts++;
            if (attempts >= 5) {
              throw new Error('Failed to generate unique public ID. Please try again.');
            }
            continue;
          }
          throw createErr;
        }
      }

      const token = generateToken(user._id.toString());
      // Set HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      return res.status(201).json({
        _id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        publicId: user.publicId,
        token
      });
    } else {
      // In-memory fallback mode
      for (const user of memoryUsers.values()) {
        if (user.email === normalizedEmail) {
          return res.status(400).json({ message: 'An account with this email already exists' });
        }
        if (user.username === username) {
          return res.status(400).json({ message: 'Username is already taken' });
        }
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

      let memPublicId = generatePublicId();
      const existingIds = new Set(Array.from(memoryUsers.values()).map((u) => u.publicId));
      while (existingIds.has(memPublicId)) {
        memPublicId = generatePublicId();
      }

      const memUser = {
        _id: id,
        username,
        email: normalizedEmail,
        password: hashedPassword,
        avatar,
        publicId: memPublicId,
        createdAt: new Date().toISOString()
      };

      memoryUsers.set(id, memUser);

      const token = generateToken(memUser._id);
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
      return res.status(201).json({
        _id: memUser._id,
        username: memUser.username,
        email: memUser.email,
        avatar: memUser.avatar,
        publicId: memUser.publicId,
        token
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter email and password' });
    }

    const normalizedEmail = email.toLowerCase();

    if (isDBConnected()) {
      const user = await User.findOne({ email: normalizedEmail });
      if (user && (await user.matchPassword(password))) {
        // Backfill publicId if missing on legacy user
        if (!user.publicId) {
          user.publicId = generatePublicId();
          await user.save();
        }

        const token = generateToken(user._id.toString());
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000
        });
        return res.json({
          _id: user._id.toString(),
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          publicId: user.publicId,
          token
        });
      }
    } else {
      // In-memory fallback mode
      let foundUser = null;
      for (const u of memoryUsers.values()) {
        if (u.email === normalizedEmail) {
          foundUser = u;
          break;
        }
      }

      if (foundUser && (await bcrypt.compare(password, foundUser.password))) {
        if (!foundUser.publicId) {
          foundUser.publicId = generatePublicId();
        }

        const token = generateToken(foundUser._id);
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000
        });
        return res.json({
          _id: foundUser._id,
          username: foundUser.username,
          email: foundUser.email,
          avatar: foundUser.avatar,
          publicId: foundUser.publicId,
          token
        });
      }
    }

    return res.status(401).json({ message: 'Invalid email or password' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user profile
 * @route   GET /api/auth/profile
 * @access  Private
 */
const getUserProfile = async (req, res) => {
  if (req.user) {
    return res.json({
      _id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      avatar: req.user.avatar,
      publicId: req.user.publicId,
      createdAt: req.user.createdAt
    });
  } else {
    return res.status(404).json({ message: 'User profile not found' });
  }
};

/**
 * @desc Logout user by clearing cookie
 * @route POST /api/auth/logout
 * @access Public
 */
const logoutUser = async (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.json({ message: 'Logged out' });
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  logoutUser,
  memoryUsers
};
