const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Connect to MongoDB Atlas cluster instance using Mongoose
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/chat_application';
  const isProduction = process.env.NODE_ENV === 'production';

  // Event Listeners
  mongoose.connection.on('error', (err) => {
    logger.error(`[MongoDB Error] Connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('[MongoDB Warning] Disconnected from MongoDB cluster.');
  });

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    logger.info(`[MongoDB Atlas] Connected successfully to host: ${conn.connection.host} (DB: ${conn.connection.name})`);
    try {
      const { backfillPublicIds } = require("../scripts/backfillPublicIds");
      backfillPublicIds({ customLogger: logger }).catch(() => {});
    } catch (_err) { /* ignore */ }
    return conn;
  } catch (primaryErr) {
    logger.warn(`[MongoDB Warning] Primary connection to Atlas failed: ${primaryErr.message}`);

    if (isProduction) {
      logger.error('[MongoDB Error] Please verify Atlas Network Access allows 0.0.0.0/0 IP whitelist in MongoDB Cloud dashboard.');
      return null;
    }

    // In local dev fallback
    try {
      logger.info('[MongoDB] Initializing lightweight in-memory MongoDB server fallback for dev...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create({
        binary: {
          version: '6.0.14'
        }
      });
      const memoryUri = mongoServer.getUri();

      const conn = await mongoose.connect(memoryUri);
      logger.info(`[MongoDB Memory Server] Connected successfully to in-memory database!`);
      return conn;
    } catch (fallbackErr) {
      logger.error(`[MongoDB Fallback Error] ${fallbackErr.message}`);
    }
  }
};

module.exports = connectDB;
