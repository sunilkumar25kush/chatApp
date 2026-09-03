const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    username: {
      type: String,
      default: ''
    },
    avatar: {
      type: String,
      default: ''
    },
    socketId: {
      type: String,
      default: null
    },
    role: {
      type: String,
      enum: ['host', 'participant'],
      default: 'participant'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date,
      default: null
    },
    audioMuted: {
      type: Boolean,
      default: false
    },
    videoDisabled: {
      type: Boolean,
      default: false
    },
    isScreenSharing: {
      type: Boolean,
      default: false
    },
    connectionStatus: {
      type: String,
      enum: ['connected', 'reconnecting', 'disconnected'],
      default: 'connected'
    }
  },
  { _id: true }
);

const callSessionSchema = new mongoose.Schema(
  {
    callId: {
      type: String,
      required: [true, 'Call ID is required'],
      unique: true,
      index: true
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: [true, 'Conversation/Room ID is required'],
      index: true
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    callType: {
      type: String,
      enum: ['voice', 'video'],
      default: 'video'
    },
    isGroup: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      enum: ['ringing', 'active', 'ended', 'missed', 'declined', 'cancelled'],
      default: 'active',
      index: true
    },
    endedReason: {
      type: String,
      enum: ['completed', 'missed', 'declined', 'busy', 'cancelled', 'host_ended', 'abandoned', null],
      default: null
    },
    sfuRoomName: {
      type: String,
      required: true,
      index: true
    },
    participants: [participantSchema],
    startedAt: {
      type: Date,
      default: Date.now
    },
    endedAt: {
      type: Date,
      default: null
    },
    duration: {
      type: Number,
      default: 0 // In seconds
    }
  },
  {
    timestamps: true
  }
);

// Indexes for fast lookup of call history & active calls per conversation
callSessionSchema.index({ conversationId: 1, createdAt: -1 });
callSessionSchema.index({ conversationId: 1, status: 1 });
callSessionSchema.index({ 'participants.user': 1, createdAt: -1 });
callSessionSchema.index({ creator: 1, createdAt: -1 });

module.exports = mongoose.model('CallSession', callSessionSchema);
