const mongoose = require('mongoose');

const RefreshTokenSchema = new mongoose.Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
  revokedReason: {
    type: String,
    default: null,
  },
  replacedByTokenHash: {
    type: String,
    default: null,
  },
  ipAddress: {
    type: String,
    default: '127.0.0.1',
  },
  userAgent: {
    type: String,
    default: 'Unknown',
  },
}, {
  timestamps: true,
});

// Auto-expire documents after 30 days from creation
RefreshTokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

RefreshTokenSchema.methods.isActive = function () {
  return !this.revokedAt && new Date() < this.expiresAt;
};

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);
