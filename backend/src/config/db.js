require('dotenv').config();
const mongoose = require('mongoose');

let mongoMemoryServerInstance = null;

/**
 * Connect to MongoDB.
 * Attempts URI first (process.env.MONGODB_URI or default localhost).
 * If no local MongoDB is detected or in test mode, falls back gracefully to MongoMemoryServer
 * to provide a seamless, zero-friction developer experience on any machine.
 */
async function connectDB(uri = process.env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Jest always uses MongoMemoryServer, regardless of inherited environment variables or URI.
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    if (!mongoMemoryServerInstance) {
      mongoMemoryServerInstance = await MongoMemoryServer.create();
    }
    const memUri = mongoMemoryServerInstance.getUri();
    await mongoose.connect(memUri);
    console.log(`[CareBridge Database] Connected to test in-memory MongoDB at: ${memUri}`);
    return mongoose.connection;
  }

  const targetUri = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/carebridge';
  const timeoutMs = process.env.MONGODB_URI ? 10000 : 2000;
  const maskedUri = targetUri.replace(/:([^:@]+)@/, ':****@');

  try {
    await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: timeoutMs,
    });
    console.log(`[CareBridge Database] Connected to MongoDB at: ${maskedUri}`);
    return mongoose.connection;
  } catch (err) {
    console.warn(`[CareBridge Database] MongoDB connection failed (${err.message}).`);
    console.log(`[CareBridge Database] Initializing embedded in-memory MongoDB fallback server...`);

    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongoMemoryServerInstance = await MongoMemoryServer.create();
      const memUri = mongoMemoryServerInstance.getUri();
      await mongoose.connect(memUri);
      console.log(`[CareBridge Database] Connected to in-memory MongoDB at: ${memUri}`);
      return mongoose.connection;
    } catch (memErr) {
      console.error(`[CareBridge Database] Failed to initialize in-memory database:`, memErr);
      throw memErr;
    }
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoMemoryServerInstance) {
    await mongoMemoryServerInstance.stop();
    mongoMemoryServerInstance = null;
  }
  console.log('[CareBridge Database] Disconnected successfully.');
}

module.exports = {
  connectDB,
  disconnectDB,
};
