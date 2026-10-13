const mongoose = require('mongoose');

const LoginLockoutSchema = new mongoose.Schema({
  identifier: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true, // email or ip:email combination
  },
  failedAttempts: {
    type: Number,
    default: 0,
  },
  lockedUntil: {
    type: Date,
    default: null,
    index: true,
  },
  lastAttemptAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// TTL index to automatically clean up inactive lockout tracking documents after 2 hours
LoginLockoutSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 2 * 60 * 60 });

module.exports = mongoose.model('LoginLockout', LoginLockoutSchema);
