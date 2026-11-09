const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const loginHistorySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    success: { type: Boolean, default: false },
    reason: { type: String, default: '' }
  },
  { _id: false }
);

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long'],
      maxlength: [40, 'Username must be at most 40 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/, 'Please enter a valid email address']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'moderator', 'support'],
      default: 'support',
      index: true
    },
    // Extra granular permissions granted on top of the role defaults.
    permissions: [{ type: String }],
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true
    },
    suspendedReason: { type: String, default: '' },
    suspendedAt: { type: Date, default: null },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, default: null, select: false },
    pendingMfaSecret: { type: String, default: null, select: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: '' },
    // Incrementing this invalidates every previously issued admin JWT.
    sessionVersion: { type: Number, default: 0 },
    loginHistory: { type: [loginHistorySchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    notes: { type: String, default: '', maxlength: 1000 }
  },
  { timestamps: true }
);

adminSchema.index({ role: 1, status: 1 });
adminSchema.index({ createdAt: -1 });

adminSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  return next();
});

adminSchema.methods.matchPassword = function (enteredPassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(enteredPassword, this.passwordHash);
};

adminSchema.methods.isLocked = function () {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;
