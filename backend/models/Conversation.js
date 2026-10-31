const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    // Canonical pair key to ensure at most one conversation between any pair of users
    pairKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    // Array of exactly two user ObjectIds
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    // Reference to the underlying accepted friendship
    friendship: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Friendship'
    },
    // Metadata for the most recent message in this conversation
    lastMessage: {
      content: { type: String, default: '' },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      fileType: { type: String, default: null },
      createdAt: { type: Date, default: null },
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'DirectMessage' }
    },
    // Timestamp of last message or conversation activity (used for sorting conversations)
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    // Unread message counters keyed by stringified userId: { "userId": count }
    unreadCounts: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for fast user lookup and conversation feed ordering
conversationSchema.index({ participants: 1, lastActivityAt: -1 });

/**
 * Computes canonical pair key for conversations.
 */
conversationSchema.statics.makePairKey = (id1, id2) => {
  const str1 = id1?.toString();
  const str2 = id2?.toString();
  if (!str1 || !str2) return '';
  return str1 < str2 ? `${str1}_${str2}` : `${str2}_${str1}`;
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;

