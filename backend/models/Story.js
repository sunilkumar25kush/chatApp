const mongoose = require('mongoose');

const storySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required for a story'],
      index: true
    },
    // Backwards-compatible alias for existing frontend/population
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    mediaType: {
      type: String,
      enum: ['image', 'photo', 'video', 'text'],
      required: [true, 'Media type is required']
    },
    mediaUrl: {
      type: String,
      default: ''
    },
    thumbnailUrl: {
      type: String,
      default: ''
    },
    textContent: {
      type: String,
      maxlength: [500, 'Text content cannot exceed 500 characters'],
      default: ''
    },
    backgroundColor: {
      type: String,
      default: 'linear-gradient(135deg, #6366f1, #a855f7)'
    },
    textColor: {
      type: String,
      default: '#ffffff'
    },
    caption: {
      type: String,
      maxlength: [500, 'Caption cannot exceed 500 characters'],
      default: ''
    },
    visibility: {
      type: String,
      enum: ['friends', 'public', 'custom'],
      default: 'friends'
    },
    allowedViewers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    excludedViewers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    duration: {
      type: Number,
      default: 5 // seconds
    },
    // Backwards compatibility for existing textConfig structure
    textConfig: {
      text: { type: String, maxlength: 500, default: '' },
      background: { type: String, default: 'linear-gradient(135deg, #6366f1, #a855f7)' },
      textColor: { type: String, default: '#ffffff' },
      textAlign: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
      fontStyle: { type: String, default: 'normal' }
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: true
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Keep user and userId in sync
storySchema.pre('validate', function (next) {
  if (!this.userId && this.user) {
    this.userId = this.user;
  }
  if (!this.user && this.userId) {
    this.user = this.userId;
  }
  // Normalize photo -> image
  if (this.mediaType === 'photo') {
    this.mediaType = 'image';
  }
  // Sync textContent and textConfig
  if (this.mediaType === 'text') {
    if (!this.textContent && this.textConfig?.text) {
      this.textContent = this.textConfig.text;
    }
    if (!this.textConfig?.text && this.textContent) {
      this.textConfig = {
        ...this.textConfig,
        text: this.textContent,
        background: this.backgroundColor || this.textConfig?.background,
        textColor: this.textColor || this.textConfig?.textColor
      };
    }
  }
  next();
});

// Compound indexes for performant feed retrieval
storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1, isArchived: 1 });
storySchema.index({ createdAt: -1 });

const Story = mongoose.model('Story', storySchema);

module.exports = Story;
