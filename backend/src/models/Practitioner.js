const mongoose = require('mongoose');

/**
 * Practitioner Schema (Phase 8.2)
 * Represents doctors, medical specialists, and clinical staff associated with hospitals.
 * Hospital specialist counts are strictly DERIVED from active, verified practitioners.
 * ALL DATA IS SYNTHETIC. RESEARCH PROTOTYPE ONLY.
 */
const PractitionerSchema = new mongoose.Schema({
  practitionerId: {
    type: String,
    required: [true, 'practitionerId is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: [true, 'hospitalId is required'],
    index: true,
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
  },
  qualification: {
    type: String,
    required: [true, 'Medical qualification is required'],
    trim: true,
  },
  specialty: {
    type: String,
    required: [true, 'Specialty department is required'],
    trim: true,
    index: true,
  },
  registrationNumber: {
    type: String,
    required: [true, 'State medical council registration number is required'],
    trim: true,
    unique: true,
    index: true,
    match: [/^SYN-TNC-\d{4,}$/, 'Practitioner registration number must match format SYN-TNC-XXXX'],
  },
  employmentStatus: {
    type: String,
    enum: ['active', 'on_leave', 'resigned'],
    default: 'active',
    index: true,
  },
  availability: {
    type: String,
    enum: ['on_call_24x7', 'shift_day', 'shift_night', 'unavailable'],
    default: 'on_call_24x7',
    index: true,
  },
  verificationStatus: {
    type: String,
    enum: ['verified', 'pending_verification', 'rejected'],
    default: 'pending_verification',
    index: true,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  verifiedAt: {
    type: Date,
    default: null,
  },
  lastConfirmedAt: {
    type: Date,
    default: Date.now,
  },
  isSynthetic: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Composite index for rapid capability queries
PractitionerSchema.index({
  hospitalId: 1,
  specialty: 1,
  employmentStatus: 1,
  verificationStatus: 1,
});

module.exports = mongoose.model('Practitioner', PractitionerSchema);
