const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { generatePublicId } = require('../utils/publicId');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        'Please enter a valid email address'
      ]
    },
    password: {
      type: String,
      // Password is required for local/provider=='local' users, optional for OAuth users
      required: [function () { return this.provider === 'local'; }, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long']
    },
    avatar: {
      type: String,
      default: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatUser'
    },
    // Authentication provider: 'local' for email/password, 'google' for Google OAuth
    provider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local'
    },
    // Permanent, globally unique public user identifier (e.g. SKY-7K9M2Q)
    publicId: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      immutable: true
    },
    // Google account identifier (sub) when user signs in with Google
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away', 'busy', 'invisible'],
      default: 'offline'
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    // Privacy & notification preferences (Gajim-style account settings)
    privacy: {
      showOnline: { type: Boolean, default: true },
      showLastSeen: { type: Boolean, default: true },
      showReadReceipts: { type: Boolean, default: true },
      allowMessagesFrom: { type: String, enum: ['everyone', 'contacts', 'nobody'], default: 'everyone' }
    },
    notificationPrefs: {
      soundEnabled: { type: Boolean, default: true },
      desktopEnabled: { type: Boolean, default: true },
      notifyOnMessage: { type: Boolean, default: true }
    },
    customStatus: {
      text: { type: String, maxlength: 100, default: '' },
      emoji: { type: String, default: '' },
      expiresAt: { type: Date, default: null }
    },
    // New Profile Fields
    fullName: { type: String, trim: true, default: '' },
    bio: { type: String, maxlength: 300, default: '' },
    phone: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    github: { type: String, trim: true, default: '' },
    linkedin: { type: String, trim: true, default: '' },
    birthday: { type: Date, default: null },
    bannerImage: { type: String, default: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=1200&auto=format&fit=crop' },
    // Theme Customization
    theme: {
      preset: { type: String, default: 'default' },
      primaryColor: { type: String, default: '#7c3aed' },
      msgIncomingBg: { type: String, default: '#222530' },
      msgOutgoingBg: { type: String, default: '#7c3aed' },
      chatBg: { type: String, default: '#181a20' },
      sidebarBg: { type: String, default: '#1a1c23' },
      borderRadius: { type: String, default: '12px' },
      fontFamily: { type: String, default: 'Inter' }
    },
    // Chat Personality Studio Data
    personality: {
      activePersonalityId: { type: String, default: 'default' },
      globalWallpaperUrl: { type: String, default: '' },
      customWallpapers: [
        {
          id: { type: String },
          url: { type: String },
          name: { type: String },
          isFavorite: { type: Boolean, default: false },
          collectionName: { type: String, default: 'General' },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      perChatWallpapers: { type: Map, of: Object, default: {} },
      controls: {
        opacity: { type: Number, default: 0.85 },
        blur: { type: Number, default: 0 },
        brightness: { type: Number, default: 100 },
        contrast: { type: Number, default: 100 },
        saturation: { type: Number, default: 100 },
        scale: { type: Number, default: 100 },
        fitMode: { type: String, default: 'cover' },
        overlayColor: { type: String, default: '#000000' },
        overlayOpacity: { type: Number, default: 0.2 }
      }
    }
  },
  {
    timestamps: true
  }
);

// Auto-generate permanent publicId on document validation if not already present
userSchema.pre('validate', function (next) {
  if (!this.publicId) {
    this.publicId = generatePublicId();
  }
  next();
});

// Encrypt password before saving user
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) {
    // No password set (OAuth user)
    return false;
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
