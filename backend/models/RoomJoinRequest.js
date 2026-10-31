const mongoose = require('mongoose');

const roomJoinRequestSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      required: true
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    decidedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      default: '',
      maxlength: 200
    }
  },
  {
    timestamps: true
  }
);

// 🔒 Uniqueness: Ensure at most one active pending request per (room, user) pair.
// Uses a partialFilterExpression so that once a request is approved, rejected, or cancelled,
// the user can submit a new request if permitted, without hitting duplicate key errors.
roomJoinRequestSchema.index(
  { room: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

// Performance indexes for listing by room and by user
roomJoinRequestSchema.index({ room: 1, status: 1, createdAt: -1 });
roomJoinRequestSchema.index({ user: 1, status: 1, createdAt: -1 });

const RoomJoinRequest = mongoose.model('RoomJoinRequest', roomJoinRequestSchema);

module.exports = RoomJoinRequest;

