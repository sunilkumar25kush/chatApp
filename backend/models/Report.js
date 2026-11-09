const mongoose = require('mongoose');

const reportCategories = [
  'harassment',
  'spam',
  'impersonation',
  'inappropriate_content',
  'fake_account',
  'threats',
  'suspicious_activity',
  'room_abuse',
  'other'
];

const reportStatuses = ['pending', 'under_review', 'resolved', 'rejected', 'escalated'];

const historyEntrySchema = new mongoose.Schema(
  {
    status: { type: String, enum: reportStatuses, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    note: { type: String, default: '', maxlength: 2000 },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    targetType: {
      type: String,
      enum: ['user', 'room', 'message', 'direct_message', 'call'],
      required: true,
      index: true
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    // For message targets: which collection the targetId belongs to.
    messageModel: {
      type: String,
      enum: ['Message', 'DirectMessage', null],
      default: null
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
      index: true
    },
    category: {
      type: String,
      enum: reportCategories,
      required: true,
      index: true
    },
    description: {
      type: String,
      required: [true, 'A description is required'],
      trim: true,
      maxlength: [2000, 'Description must be under 2000 characters']
    },
    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: reportStatuses,
      default: 'pending',
      index: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
      index: true
    },
    assignedAt: { type: Date, default: null },
    resolution: {
      decision: { type: String, enum: ['resolved', 'rejected', 'escalated', null], default: null },
      action: { type: String, default: null },
      reason: { type: String, default: '' },
      note: { type: String, default: '' },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
      at: { type: Date, default: null }
    },
    history: { type: [historyEntrySchema], default: [] }
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, priority: 1, createdAt: -1 });
reportSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1, status: 1 });
reportSchema.index({ room: 1, status: 1, createdAt: -1 });
reportSchema.index({ targetUser: 1, status: 1, createdAt: -1 });
reportSchema.index({ createdAt: -1 });

reportSchema.statics.categories = reportCategories;
reportSchema.statics.statuses = reportStatuses;

module.exports = mongoose.model('Report', reportSchema);
