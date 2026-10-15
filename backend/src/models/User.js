const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
  },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'hospital_admin', 'platform_reviewer'],
    required: [true, 'Role is required'],
    index: true,
  },
  // If role is doctor or hospital_admin, associate with a hospital
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
  },
  phone: {
    type: String,
    trim: true,
  },
  district: {
    type: String,
    trim: true,
  },
  isSynthetic: {
    type: Boolean,
    default: false,
  },
  // Optional 2FA (TOTP)
  isTwoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: {
    type: String,
    default: null,
  },
  // Password reset fields
  passwordResetToken: {
    type: String,
    default: null,
    index: true,
  },
  passwordResetExpires: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Pre-save password hash hook
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Instance method to compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
