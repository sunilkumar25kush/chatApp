const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * Resolve whether an account is currently allowed to use the API.
 * Expired temporary suspensions are lifted automatically.
 */
const enforceAccountAccess = async (user) => {
  if (!user) return { allowed: false, message: 'User not found' };
  const status = user.accountStatus || 'active';
  if (status === 'active') return { allowed: true };

  if (status === 'suspended' && user.suspendedUntil && new Date(user.suspendedUntil).getTime() <= Date.now()) {
    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(user._id)) {
      await User.updateOne(
        { _id: user._id },
        { $set: { accountStatus: 'active', suspendedUntil: null } }
      );
    }
    user.accountStatus = 'active';
    user.suspendedUntil = null;
    return { allowed: true };
  }

  if (status === 'deleted') {
    return { allowed: false, message: 'This account has been removed' };
  }
  if (status === 'banned') {
    return { allowed: false, message: 'This account has been banned' };
  }
  return { allowed: false, message: 'This account is temporarily suspended' };
};

module.exports = { enforceAccountAccess };
