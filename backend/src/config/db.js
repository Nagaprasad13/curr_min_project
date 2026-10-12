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

  // In test mode or when explicitly requested, use MongoMemoryServer immediately
  if (process.env.NODE_ENV === 'test' && !process.env.MONGODB_URI) {
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

  try {
    // Attempt standard connection with a short timeout if uri wasn't explicitly provided
    await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: 1500,
    });
    console.log(`[CareBridge Database] Connected to MongoDB at: ${targetUri}`);
    return mongoose.connection;
  } catch (err) {
    console.warn(`[CareBridge Database] Standard MongoDB connection failed (${err.message}).`);
    console.log(`[CareBridge Database] Initializing embedded in-memory MongoDB server for research prototype...`);

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
