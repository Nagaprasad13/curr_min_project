const mongoose = require('mongoose');

const SchemeCriteriaSchema = new mongoose.Schema({
  criterion: {
    type: String,
    required: true,
  },
  sourceUrl: {
    type: String,
    required: true,
  },
  isConfirmed: {
    type: Boolean,
    default: true,
  },
  fieldKey: {
    type: String, // e.g. 'incomeLimit', 'stateResident', 'rationCardType', 'ageMin', 'diseaseCategory'
  },
  thresholdValue: {
    type: mongoose.Schema.Types.Mixed,
  },
  verificationNote: {
    type: String,
  },
}, { _id: false });

const SchemeSchema = new mongoose.Schema({
  schemeId: {
    type: String,
    required: [true, 'Scheme ID is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  schemeCode: {
    type: String,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Scheme name is required'],
    trim: true,
  },
  authority: {
    type: String,
    required: [true, 'Authority is required'],
    trim: true,
  },
  shortDescription: {
    type: String,
    required: [true, 'Short description is required'],
  },
  eligibilityCriteria: [SchemeCriteriaSchema],
  requiredDocuments: [{
    type: String,
    trim: true,
  }],
  coveredTreatmentNotes: {
    type: String,
    required: true,
  },
  participatingHospitalInfo: {
    type: String,
    default: 'hospital-reported, verify with scheme',
  },
  officialApplicationUrl: {
    type: String,
    required: true,
  },
  officialUrl: {
    type: String,
  },
  helplineInfo: {
    type: String,
  },
  sourceUrls: [{
    type: String,
    trim: true,
  }],
  lastVerifiedDate: {
    type: Date,
    required: [true, 'Last verified date is required'],
    index: true,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  status: {
    type: String,
    enum: ['draft', 'verified', 'outdated'],
    default: 'draft',
    index: true,
  },
  rulesVersion: {
    type: String,
    default: '1.0',
  },
  // Mandatory research notice: never use "eligible", "covered", "free", or "approved"
  notice: {
    type: String,
    default: 'This is a possible match only, not confirmed eligibility. Eligibility, coverage and hospital participation must be confirmed with the scheme authority or the hospital. Coverage or free treatment is never guaranteed.',
  },
  disclaimer: {
    type: String,
    default: 'This is a possible match only, not confirmed eligibility. Eligibility, coverage and hospital participation must be confirmed with the scheme authority or the hospital. Coverage or free treatment is never guaranteed.',
  },
  summary: {
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

// Pre-validate hook to synchronize schemeCode & schemeId, officialUrl & officialApplicationUrl, summary & shortDescription
SchemeSchema.pre('validate', function (next) {
  if (!this.schemeCode && this.schemeId) {
    this.schemeCode = this.schemeId;
  } else if (!this.schemeId && this.schemeCode) {
    this.schemeId = this.schemeCode;
  }

  if (!this.officialUrl && this.officialApplicationUrl) {
    this.officialUrl = this.officialApplicationUrl;
  } else if (!this.officialApplicationUrl && this.officialUrl) {
    this.officialApplicationUrl = this.officialUrl;
  }

  if (!this.summary && this.shortDescription) {
    this.summary = this.shortDescription;
  } else if (!this.shortDescription && this.summary) {
    this.shortDescription = this.summary;
  }

  if (!this.coveredTreatmentNotes) {
    this.coveredTreatmentNotes = this.summary || this.shortDescription || 'Secondary and tertiary hospitalization coverage';
  }

  next();
});

module.exports = mongoose.model('Scheme', SchemeSchema);
