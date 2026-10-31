const mongoose = require('mongoose');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { generatePublicId } = require('../utils/publicId');
const oauth2Client = require('../config/google');
const { memoryUsers } = require('./authController');

/**
 * POST /api/auth/google
 * Body: { idToken }
 * Verifies Google ID token, finds or creates a user, returns JWT and user
 */
const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'ID token is required' });
    }

    // Verify ID token with Google
    const ticket = await oauth2Client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Invalid Google ID token payload' });
    }

    const email = payload.email.toLowerCase();
    const emailVerified = payload.email_verified === true;
    const googleId = payload.sub;
    const name = payload.name || '';
    const picture = payload.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`;

    // Helper to derive a base username
    const deriveUsername = (nameOrEmail) => {
      if (!nameOrEmail) return `user_${Date.now().toString().slice(-5)}`;
      const base = nameOrEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      return base || `user_${Date.now().toString().slice(-5)}`;
    };

    // If DB connected, use MongoDB; otherwise use in-memory fallback
    if (mongoose.connection.readyState === 1) {
      // Try to find by googleId first
      let user = await User.findOne({ googleId }).select('-password');

      if (!user) {
        // Try finding by email to link accounts
        user = await User.findOne({ email });
      }

      if (user) {
        let changed = false;
        // If user exists but has no googleId, link it
        if (!user.googleId) {
          user.googleId = googleId;
          user.provider = 'google';
          user.emailVerified = emailVerified;
          if (picture) user.avatar = picture;
          changed = true;
        }

        // Backfill publicId if missing on legacy user
        if (!user.publicId) {
          user.publicId = generatePublicId();
          changed = true;
        }

        if (changed) {
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

      // Create new user
      let baseUsername = deriveUsername(name || email);
      let username = baseUsername;
      let suffix = 0;
      // Ensure unique username
      while (await User.findOne({ username })) {
        suffix += 1;
        username = `${baseUsername}${suffix}`;
      }

      let newUser = null;
      let attempts = 0;
      while (attempts < 5) {
        try {
          newUser = await User.create({
            username,
            email,
            avatar: picture,
            provider: 'google',
            googleId,
            emailVerified,
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

      const token = generateToken(newUser._id.toString());
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
      return res.status(201).json({
        _id: newUser._id.toString(),
        username: newUser.username,
        email: newUser.email,
        avatar: newUser.avatar,
        publicId: newUser.publicId,
        token
      });
    } else {
      // In-memory fallback
      let found = null;
      for (const u of memoryUsers.values()) {
        if (u.googleId && u.googleId === googleId) {
          found = u;
          break;
        }
      }

      if (!found) {
        // Try find by email and link
        for (const u of memoryUsers.values()) {
          if (u.email === email) {
            found = u;
            break;
          }
        }
      }

      if (found) {
        if (!found.googleId) {
          found.googleId = googleId;
          found.provider = 'google';
          found.emailVerified = emailVerified;
          found.avatar = picture;
        }

        if (!found.publicId) {
          found.publicId = generatePublicId();
        }

        const token = generateToken(found._id);
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000
        });
        return res.json({
          _id: found._id,
          username: found.username,
          email: found.email,
          avatar: found.avatar,
          publicId: found.publicId,
          token
        });
      }

      // Create in-memory user
      const id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const username = deriveUsername(name || email);

      let memPublicId = generatePublicId();
      const existingIds = new Set(Array.from(memoryUsers.values()).map((u) => u.publicId));
      while (existingIds.has(memPublicId)) {
        memPublicId = generatePublicId();
      }

      const memUser = {
        _id: id,
        username,
        email,
        googleId,
        provider: 'google',
        emailVerified,
        avatar: picture,
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

module.exports = {
  googleLogin
};
