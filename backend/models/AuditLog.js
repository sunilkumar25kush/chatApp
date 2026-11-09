const mongoose = require('mongoose');

/**
 * Append-only admin audit trail.
 * Update/delete operations are blocked at the schema level.
 */
const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
      index: true
    },
    adminRole: { type: String, default: 'unknown' },
    adminEmail: { type: String, default: '' },
    action: {
      type: String,
      required: true,
      index: true,
      maxlength: 120
    },
    targetType: { type: String, default: null, index: true },
    targetId: { type: String, default: null, index: true },
    reason: { type: String, default: '', maxlength: 2000 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    outcome: {
      type: String,
      enum: ['success', 'failure'],
      default: 'success',
      index: true
    },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

const BLOCKED_OPERATIONS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
  'findOneAndReplace'
];

BLOCKED_OPERATIONS.forEach((operation) => {
  auditLogSchema.pre(operation, function blockAuditMutation(next) {
    next(new Error('Audit logs are append-only and cannot be modified or deleted'));
  });
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
