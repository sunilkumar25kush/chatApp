const mongoose = require('mongoose');

/**
 * Generates canonical pair key from two ObjectIds or ID strings.
 * Guarantees that whether User A interacts with User B or B interacts with A,
 * the resulting pairKey is identical and sort-invariant.
 * 
 * @param {string|mongoose.Types.ObjectId} id1 
 * @param {string|mongoose.Types.ObjectId} id2 
 * @returns {string} canonical pair key
 */
const makePairKey = (id1, id2) => {
  const str1 = id1?.toString();
  const str2 = id2?.toString();
  if (!str1 || !str2) return '';
  return str1 < str2 ? `${str1}_${str2}` : `${str2}_${str1}`;
};

const friendshipSchema = new mongoose.Schema(
  {
    // The user who initiated the friend request
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Requester ID is required'],
      index: true
    },
    // The recipient of the friend request
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient ID is required'],
      index: true
    },
    // Canonical pair key to enforce exactly ONE relationship per unordered user pair
    pairKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    // Relationship status lifecycle: pending -> accepted | rejected
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
      index: true
    },
    // Timestamp when the request was officially accepted
    acceptedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Pre-validate hook to populate pairKey if not already set
friendshipSchema.pre('validate', function (next) {
  if (!this.pairKey && this.requester && this.recipient) {
    this.pairKey = makePairKey(this.requester, this.recipient);
  }
  next();
});

// Compound indexes for performant friend roster and request listings
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ pairKey: 1, status: 1 });

// Attach helper static method
friendshipSchema.statics.makePairKey = makePairKey;

const Friendship = mongoose.model('Friendship', friendshipSchema);

module.exports = Friendship;

