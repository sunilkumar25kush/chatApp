const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      default: '',
      trim: true
    },
    fileUrl: {
      type: String,
      default: null
    },
    fileType: {
      type: String,
      enum: ['image', 'pdf', 'document', 'audio', 'call', null],
      default: null
    },
    fileName: {
      type: String,
      default: null
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    reactions: [
      {
        emoji: { type: String, required: true },
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
      }
    ],
    isEdited: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    // Gajim-style message features
    // "Delete for me": hides the message locally for those users
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    // Starred / bookmarked messages
    starredBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    // Message delivery receipts (Gajim: sent → delivered → read)
    deliveredTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    // Admin moderation metadata (restorable soft-removal)
    moderation: {
      removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
      removedAt: { type: Date, default: null },
      reason: { type: String, default: '' },
      originalContent: { type: String, default: null, select: false },
      originalFileUrl: { type: String, default: null, select: false },
      originalFileType: { type: String, default: null, select: false },
      originalFileName: { type: String, default: null, select: false },
      restoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
      restoredAt: { type: Date, default: null }
    }
  },
  {
    timestamps: true
  }
);

// Compound Index for room message querying performance
messageSchema.index({ room: 1, createdAt: 1 });
// Optimize: latest-message-per-room & read-receipt scans
messageSchema.index({ room: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
// Text index for message search
messageSchema.index({ content: 'text' });
messageSchema.index({ createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
