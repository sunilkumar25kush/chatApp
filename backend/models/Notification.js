const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    type: {
      type: String,
      required: true,
      enum: [
        'friend_request',
        'friend_accepted',
        'room_join_request',
        'room_join_approved',
        'room_join_rejected',
        'system'
      ]
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    link: {
      screen: {
        type: String,
        enum: ['friends', 'room', 'direct'],
        required: true
      },
      id: {
        type: String,
        default: null
      },
      tab: {
        type: String,
        default: null
      }
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    dedupKey: {
      type: String,
      default: null,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Compound index for querying user notifications sorted by most recent
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

// Partial unique index for deduplication: avoids duplicate notifications for same event
notificationSchema.index(
  { recipient: 1, dedupKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupKey: { $type: 'string' } }
  }
);

module.exports = mongoose.model('Notification', notificationSchema);

