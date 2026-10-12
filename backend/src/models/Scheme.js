const mongoose = require('mongoose');

const SchemeSchema = new mongoose.Schema({
  schemeCode: {
    type: String,
    required: [true, 'Scheme code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Scheme name is required'],
    trim: true,
  },
  authority: {
    type: String,
    required: true,
    trim: true,
  },
  officialUrl: {
    type: String,
    required: true,
    trim: true,
  },
  lastVerifiedDate: {
    type: Date,
    required: true,
  },
  summary: {
    type: String,
    required: true,
  },
  // CRITICAL REQUIREMENT: Must show "potential match, verify eligibility", never "covered/free".
  disclaimer: {
    type: String,
    default: 'Potential match, verify eligibility. This indicator does not guarantee insurance coverage or free care. Clinician and hospital pre-authorization required.',
  },
  eligibleBeneficiariesDescription: {
    type: String,
  },
  coveredSpecialties: [{
    type: String,
    trim: true,
  }],
  annualCoverageInr: {
    type: Number,
  },
  isSynthetic: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Scheme', SchemeSchema);
