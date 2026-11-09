const mongoose = require('mongoose');

const DEFAULT_ALLOWED_FORMATS = [
  'jpeg', 'jpg', 'png', 'gif', 'webp',
  'pdf', 'doc', 'docx', 'txt', 'zip', 'rar', 'xlsx',
  'webm', 'mp3', 'wav', 'm4a', 'ogg', 'mp4'
];

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'platform', immutable: true },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: {
      type: String,
      default: 'ChatRoom is temporarily under maintenance. Please check back soon.',
      maxlength: 500
    },
    maxMessageLength: { type: Number, default: 2000, min: 1, max: 10000 },
    maxRoomMembers: { type: Number, default: 500, min: 2, max: 100000 },
    maxFileSizeMB: { type: Number, default: 25, min: 1, max: 1024 },
    allowedUploadFormats: { type: [String], default: DEFAULT_ALLOWED_FORMATS },
    rateLimit: {
      windowMinutes: { type: Number, default: 15, min: 1, max: 1440 },
      maxRequests: { type: Number, default: 1000, min: 10, max: 100000 },
      authMaxAttempts: { type: Number, default: 50, min: 3, max: 1000 },
      friendRequestMax: { type: Number, default: 30, min: 1, max: 1000 }
    },
    registrationEnabled: { type: Boolean, default: true },
    friendRequestsEnabled: { type: Boolean, default: true },
    publicRoomCreationEnabled: { type: Boolean, default: true },
    privateRoomCreationEnabled: { type: Boolean, default: true },
    featureFlags: {
      voiceCalls: { type: Boolean, default: true },
      videoCalls: { type: Boolean, default: true },
      screenSharing: { type: Boolean, default: true },
      fileUploads: { type: Boolean, default: true },
      googleAuth: { type: Boolean, default: true },
      directMessages: { type: Boolean, default: true }
    },
    announcement: {
      enabled: { type: Boolean, default: true },
      bannerEnabled: { type: Boolean, default: false },
      bannerText: { type: String, default: '', maxlength: 300 },
      bannerType: { type: String, enum: ['info', 'warning', 'maintenance'], default: 'info' }
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
  },
  { timestamps: true }
);

settingsSchema.statics.defaultAllowedFormats = () => DEFAULT_ALLOWED_FORMATS.slice();

settingsSchema.statics.getSingleton = async function getSingleton() {
  let settings = await this.findOne({ key: 'platform' });
  if (settings) return settings;
  try {
    settings = await this.create({ key: 'platform' });
  } catch (err) {
    if (err.code === 11000) {
      settings = await this.findOne({ key: 'platform' });
    } else {
      throw err;
    }
  }
  return settings;
};

module.exports = mongoose.model('SystemSettings', settingsSchema);
