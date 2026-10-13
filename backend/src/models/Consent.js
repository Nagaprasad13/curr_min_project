const mongoose = require('mongoose');

const ConsentSchema = new mongoose.Schema({
  consentId: {
    type: String,
    required: [true, 'Consent ID is required'],
    unique: true,
    trim: true,
    index: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Patient ID is required'],
    index: true,
  },
  requestingHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    index: true,
  },
  // Backward compatibility alias with Phase 1
  toHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    index: true,
  },
  fromHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    index: true,
  },
  requestingDoctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  referralId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Referral',
  },
  purpose: {
    type: String,
    enum: [
      'referral',
      'continuing_care',
      'emergency',
      'referral_evaluation',
      'continuity_of_care',
      'emergency_transfer'
    ],
    default: 'referral',
    required: true,
  },
  recordTypes: [{
    type: String,
    enum: [
      'lab_report',
      'prescription',
      'discharge_summary',
      'diagnosis',
      'allergy',
      'imaging_report',
      'vitals',
      'imaging_reports',
      'lab_results',
      'clinical_notes'
    ],
  }],
  // Backward compatibility alias for scope
  scope: [{
    type: String,
  }],
  dateRange: {
    fromDate: { type: Date, default: null },
    toDate: { type: Date, default: null },
  },
  status: {
    type: String,
    enum: ['requested', 'granted', 'denied', 'expired', 'revoked'],
    default: 'requested',
    index: true,
  },
  includeSensitiveRecords: {
    type: Boolean,
    default: false,
  },
  grantedAt: {
    type: Date,
  },
  expiresAt: {
    type: Date,
    required: [true, 'Consent expiration date is required'],
  },
  revokedAt: {
    type: Date,
  },
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  decisionHistory: [{
    status: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String, trim: true },
    consentTextVersion: { type: String, default: 'v1.0-research-consent' },
  }],
  consentTextVersion: {
    type: String,
    default: 'v1.0-research-consent',
  },
  breakGlass: {
    used: { type: Boolean, default: false },
    reason: { type: String },
    accessedAt: { type: Date },
    accessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  digitalSignature: {
    signedBy: { type: String, trim: true },
    timestamp: { type: Date, default: Date.now },
    consentMethod: {
      type: String,
      enum: ['otp_sms', 'digital_token', 'patient_portal', 'written_witnessed', 'synthetic_simulation'],
      default: 'patient_portal',
    },
  },
  isSynthetic: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

ConsentSchema.index({ patientId: 1, requestingHospitalId: 1, status: 1 });
ConsentSchema.index({ patientId: 1, toHospitalId: 1, status: 1 });

// Pre-save synchronization for backward compatibility
ConsentSchema.pre('save', function (next) {
  if (this.requestingHospitalId && !this.toHospitalId) {
    this.toHospitalId = this.requestingHospitalId;
  } else if (this.toHospitalId && !this.requestingHospitalId) {
    this.requestingHospitalId = this.toHospitalId;
  }

  if (this.recordTypes && this.recordTypes.length > 0 && (!this.scope || this.scope.length === 0)) {
    this.scope = this.recordTypes;
  } else if (this.scope && this.scope.length > 0 && (!this.recordTypes || this.recordTypes.length === 0)) {
    this.recordTypes = this.scope;
  }

  next();
});

/**
 * Validates if the consent is actively granted and has not expired.
 * @param {Date} [atTime=new Date()]
 * @returns {boolean}
 */
ConsentSchema.methods.isActive = function (atTime = new Date()) {
  if (this.status !== 'granted') return false;
  if (!this.expiresAt) return false;
  if (this.revokedAt) return false;
  return new Date(this.expiresAt) > atTime;
};

/**
 * Checks whether this consent permits viewing a specific PatientRecord.
 * @param {object} record
 * @returns {boolean}
 */
ConsentSchema.methods.allowsRecord = function (record) {
  if (!this.isActive()) return false;

  // Sensitive record check
  if (record.sensitivityLevel === 'sensitive' && !this.includeSensitiveRecords) {
    return false;
  }

  // Record type check
  const allowedTypes = (this.recordTypes || []).concat(this.scope || []);
  if (!allowedTypes.includes(record.type)) {
    return false;
  }

  // Date range check
  if (this.dateRange) {
    if (this.dateRange.fromDate && new Date(record.recordDate) < new Date(this.dateRange.fromDate)) {
      return false;
    }
    if (this.dateRange.toDate && new Date(record.recordDate) > new Date(this.dateRange.toDate)) {
      return false;
    }
  }

  return true;
};

module.exports = mongoose.model('Consent', ConsentSchema);
