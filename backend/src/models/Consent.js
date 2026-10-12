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
  fromHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: [true, 'Originating hospital ID is required'],
    index: true,
  },
  toHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: [true, 'Receiving hospital ID is required'],
    index: true,
  },
  referralId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Referral',
  },
  purpose: {
    type: String,
    enum: ['referral_evaluation', 'continuity_of_care', 'emergency_transfer'],
    default: 'referral_evaluation',
  },
  scope: [{
    type: String,
    enum: ['vitals', 'imaging_reports', 'lab_results', 'clinical_notes', 'discharge_summary'],
  }],
  status: {
    type: String,
    enum: ['requested', 'granted', 'revoked', 'expired'],
    default: 'granted',
    index: true,
  },
  grantedAt: {
    type: Date,
    default: Date.now,
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

ConsentSchema.index({ patientId: 1, toHospitalId: 1, status: 1 });

/**
 * Validates if the consent is actively granted and has not expired.
 * @param {Date} [atTime=new Date()]
 * @returns {boolean}
 */
ConsentSchema.methods.isActive = function (atTime = new Date()) {
  if (this.status !== 'granted') return false;
  if (!this.expiresAt) return false;
  return new Date(this.expiresAt) > atTime;
};

module.exports = mongoose.model('Consent', ConsentSchema);
