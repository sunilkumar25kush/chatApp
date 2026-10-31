const mongoose = require('mongoose');

const directMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation ID is required'],
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender ID is required'],
      index: true
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient ID is required'],
      index: true
    },
    content: {
      type: String,
      default: '',
      trim: true,
      maxlength: [4000, 'Direct message content cannot exceed 4000 characters']
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
    fileSize: {
      type: Number,
      default: null
    },
    // Delivery & Read state receipts
    isDelivered: {
      type: Boolean,
      default: true
    },
    deliveredAt: {
      type: Date,
      default: Date.now
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    // Message editing & deletion lifecycle
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date,
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    // Client-supplied idempotency key to prevent duplicate delivery on retry
    clientMsgId: {
      type: String,
      default: null,
      sparse: true
    }
  },
  {
    timestamps: true
  }
);

// Compound index for cursor-based paginated history retrieval
directMessageSchema.index({ conversation: 1, createdAt: -1 });
directMessageSchema.index({ conversation: 1, isRead: 1 });

const DirectMessage = mongoose.model('DirectMessage', directMessageSchema);

module.exports = DirectMessage;

