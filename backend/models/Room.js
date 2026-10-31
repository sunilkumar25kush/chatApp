const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
      maxlength: [80, 'Room name must be under 80 characters']
    },
    code: {
      type: String,
      required: [true, 'Room code is required'],
      unique: true,
      uppercase: true,
      trim: true
    },
    category: {
      type: String,
      enum: ['General', 'Tech', 'Gaming', 'Music', 'Random', 'Custom'],
      default: 'General'
    },
    description: {
      type: String,
      default: '',
      maxlength: [300, 'Description must be under 300 characters']
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public'
    },
    isPrivate: {
      type: Boolean,
      default: false
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Original creator of the room — never changes, even if ownership is
    // transferred (owner leaves). Used for the "Created by" label in the UI.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // Gajim-style group chat roles: owner + admins (moderators)
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    icon: {
      type: String,
      default: ''
    },
    // Public invite link token (e.g. /join/<inviteCode>)
    inviteCode: {
      type: String,
      unique: true,
      sparse: true
    },
    maxMembers: {
      type: Number,
      default: 500
    },
    // Soft-delete flag for rooms (keeps message history references valid)
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Bidirectional synchronization between visibility ('public'|'private') and isPrivate (boolean)
roomSchema.pre('validate', function (next) {
  if (this.isModified('isPrivate') && !this.isModified('visibility')) {
    this.visibility = this.isPrivate ? 'private' : 'public';
  } else if (this.isModified('visibility')) {
    this.isPrivate = this.visibility === 'private';
  } else {
    if (this.visibility) {
      this.isPrivate = this.visibility === 'private';
    } else if (typeof this.isPrivate === 'boolean') {
      this.visibility = this.isPrivate ? 'private' : 'public';
    }
  }
  next();
});

// Indexes
roomSchema.index({ visibility: 1, category: 1, createdAt: -1 });
roomSchema.index({ isPrivate: 1, category: 1, createdAt: -1 });
roomSchema.index({ members: 1 });
roomSchema.index({ name: 'text', description: 'text' });

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
