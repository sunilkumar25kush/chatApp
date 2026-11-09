const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [120, 'Title must be under 120 characters']
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [2000, 'Message must be under 2000 characters']
    },
    audience: {
      type: String,
      enum: ['all', 'selected', 'online'],
      default: 'all',
      index: true
    },
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'],
      default: 'draft',
      index: true
    },
    scheduledFor: { type: Date, default: null, index: true },
    sentAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    stats: {
      recipients: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 }
    },
    failureReason: { type: String, default: '' },
    link: {
      screen: { type: String, default: null },
      id: { type: String, default: null }
    }
  },
  { timestamps: true }
);

announcementSchema.index({ status: 1, scheduledFor: 1 });
announcementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
