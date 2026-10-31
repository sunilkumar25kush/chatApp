const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const { generatePublicId, isValidPublicId } = require('../utils/publicId');
const logger = require('../utils/logger');

/**
 * Idempotent, resumable migration function to backfill public IDs for all existing users.
 * Safe to run multiple times. Never overwrites existing valid public IDs.
 * 
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - Preview changes without writing to DB
 * @param {Object} [options.customLogger=logger]
 * @returns {Promise<{ totalUsers: number, missingFound: number, backfilled: number, alreadyHadId: number, errors: number }>}
 */
async function backfillPublicIds(options = {}) {
  const { dryRun = false, customLogger = logger } = options;

  customLogger.info('[Migration] Starting Public ID backfill migration...');

  // Ensure unique index exists on publicId
  try {
    await User.collection.createIndex({ publicId: 1 }, { unique: true, sparse: true });
    customLogger.info('[Migration] Unique sparse index on publicId verified.');
  } catch (idxErr) {
    customLogger.warn(`[Migration] Note on index creation: ${idxErr.message}`);
  }

  const totalUsers = await User.countDocuments({});
  
  // Find users without a valid publicId
  const queryMissing = {
    $or: [
      { publicId: { $exists: false } },
      { publicId: null },
      { publicId: '' }
    ]
  };

  const usersMissingId = await User.find(queryMissing).select('_id username email publicId');
  const missingFound = usersMissingId.length;
  const alreadyHadId = totalUsers - missingFound;

  customLogger.info(`[Migration] Total users: ${totalUsers} | Already have ID: ${alreadyHadId} | Missing ID: ${missingFound}`);

  let backfilled = 0;
  let errors = 0;

  for (const user of usersMissingId) {
    if (dryRun) {
      customLogger.info(`[Migration] [Dry Run] Would generate ID for user ${user._id} (${user.username})`);
      backfilled++;
      continue;
    }

    let assigned = false;
    let attempts = 0;

    while (!assigned && attempts < 10) {
      attempts++;
      const newPublicId = generatePublicId();

      try {
        // Atomic update via native collection: only update if publicId is STILL missing (bypasses immutable restriction safely)
        const result = await User.collection.updateOne(
          {
            _id: user._id,
            $or: [
              { publicId: { $exists: false } },
              { publicId: null },
              { publicId: '' }
            ]
          },
          { $set: { publicId: newPublicId } }
        );

        if (result.modifiedCount > 0) {
          assigned = true;
          backfilled++;
          customLogger.info(`[Migration] User ${user.username} (${user._id}) assigned public ID: ${newPublicId}`);
        } else {
          // Document was already updated concurrently
          assigned = true;
          customLogger.info(`[Migration] User ${user.username} already updated concurrently.`);
        }
      } catch (err) {
        if (err.code === 11000 && err.keyPattern && err.keyPattern.publicId) {
          customLogger.warn(`[Migration] Collision on ${newPublicId}, retrying attempt ${attempts}...`);
          continue;
        }
        customLogger.error(`[Migration] Error updating user ${user._id}: ${err.message}`);
        errors++;
        break;
      }
    }

    if (!assigned && attempts >= 10) {
      customLogger.error(`[Migration] Failed to assign unique ID to user ${user._id} after 10 attempts.`);
      errors++;
    }
  }

  const summary = {
    totalUsers,
    alreadyHadId,
    missingFound,
    backfilled,
    errors
  };

  customLogger.info(`[Migration] Migration complete: ${JSON.stringify(summary)}`);
  return summary;
}

// Standalone CLI runner
if (require.main === module) {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/chat_application';
  
  (async () => {
    try {
      console.log(`Connecting to MongoDB at: ${mongoUri.replace(/:([^:@]{4})[^:@]*@/, ':****@')}`);
      await mongoose.connect(mongoUri);
      console.log('Connected to database. Running backfill...');
      
      const summary = await backfillPublicIds({ customLogger: console });
      console.log('Migration finished successfully:', summary);
      
      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      console.error('Migration failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = {
  backfillPublicIds
};
