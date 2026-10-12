const mongoose = require('mongoose');

const SpecialistSchema = new mongoose.Schema({
  specialty: { type: String, required: true },
  count: { type: Number, default: 1, min: 0 },
  onCall24x7: { type: Boolean, default: false }
}, { _id: false });

const EquipmentUnitSchema = new mongoose.Schema({
  available: { type: Boolean, default: false },
  count: { type: Number, default: 0, min: 0 }
}, { _id: false });

const SchemeParticipationSchema = new mongoose.Schema({
  schemeCode: { type: String, enum: ['CMCHIS', 'PM-JAY'], required: true },
  empaneled: { type: Boolean, default: false },
  validUntil: { type: Date },
  specialtiesCovered: [{ type: String }]
}, { _id: false });

const EvidenceDocumentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['hospital_license', 'clinical_establishment_reg', 'fire_safety_noc', 'pollution_control_cert', 'nabh_accreditation', 'radiology_aerb_license'],
    required: true,
  },
  fileReference: { type: String, required: true }, // Local path in protected folder, NOT in database
  originalFileName: { type: String, required: true },
  mimeType: { type: String, default: 'application/pdf' },
  fileSize: { type: Number, min: 0 },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const ConsistencyWarningSchema = new mongoose.Schema({
  code: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  detectedAt: { type: Date, default: Date.now },
}, { _id: false });

const VerificationHistorySchema = new mongoose.Schema({
  action: { type: String, required: true },
  fromState: { type: String, required: true },
  toState: { type: String, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: { type: String, required: true },
  reason: { type: String },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const HospitalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Hospital name is required'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Hospital code is required'],
    unique: true,
    uppercase: true,
    trim: true,
  },
  registrationNumber: {
    type: String,
    trim: true,
    index: true,
  },
  licenseNumber: {
    type: String,
    trim: true,
  },
  adminUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  district: {
    type: String,
    required: [true, 'District is required'],
    trim: true,
    index: true,
  },
  state: {
    type: String,
    default: 'Tamil Nadu',
    trim: true,
  },
  location: {
    latitude: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: [8.0, 'Latitude must be within Tamil Nadu (>= 8.0)'],
      max: [14.0, 'Latitude must be within Tamil Nadu (<= 14.0)'],
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: [76.0, 'Longitude must be within Tamil Nadu (>= 76.0)'],
      max: [81.0, 'Longitude must be within Tamil Nadu (<= 81.0)'],
    },
  },
  address: {
    type: String,
    trim: true,
  },
  ownership: {
    type: String,
    enum: ['government', 'private_trust', 'private_corporate'],
    required: true,
    default: 'government',
  },
  has24x7Emergency: {
    type: Boolean,
    default: false,
  },
  // Workflow States: unverified -> pending -> verified | rejected
  verificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'pending',
    index: true,
  },
  verifiedAt: {
    type: Date,
  },
  verifiedBy: {
    type: String,
    trim: true,
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  // Rule-based capability tier classification (Tier 1 advanced, Tier 2 secondary, Tier 3 basic: proposed capability categories, NOT official government tiers)
  tier: {
    type: String,
    enum: ['Tier 1', 'Tier 2', 'Tier 3'],
    default: 'Tier 3',
    index: true,
  },
  proposedTier: {
    type: String,
    enum: ['Tier 1', 'Tier 2', 'Tier 3'],
    default: 'Tier 3',
  },
  // Only a VERIFIED hospital gets an "effective/confirmed" tier. Unverified/pending show unconfirmed.
  tierStatus: {
    type: String,
    enum: ['confirmed', 'unconfirmed'],
    default: 'unconfirmed',
  },
  tierRationale: [{
    type: String,
  }],
  tierDetails: {
    rulesMet: [{ type: String }],
    rulesMissed: [{ type: String }],
    gapToNextTier: [{ type: String }],
    computedAt: { type: Date, default: Date.now },
    rulesVersion: { type: String, default: '1.0.0' },
  },
  departments: [{
    type: String,
    trim: true,
  }],
  specialties: [{
    type: String,
    trim: true,
    index: true,
  }],
  specialists: [SpecialistSchema],
  equipment: {
    ventilators: EquipmentUnitSchema,
    ctScan: EquipmentUnitSchema,
    mri: EquipmentUnitSchema,
    xray: EquipmentUnitSchema,
    ultrasound: EquipmentUnitSchema,
    operationTheatres: EquipmentUnitSchema,
    bloodBank: {
      available: { type: Boolean, default: false },
      licenseValid: { type: Boolean, default: false },
    },
    dialysis: EquipmentUnitSchema,
    cardiacCathLab: EquipmentUnitSchema,
    ecg: EquipmentUnitSchema,
    echo: EquipmentUnitSchema,
    strokeUnit: EquipmentUnitSchema,
    endocrinologyLab: EquipmentUnitSchema,
    lab: {
      available: { type: Boolean, default: false },
      level: {
        type: String,
        enum: ['basic', 'advanced', 'reference'],
        default: 'basic',
      },
    },
  },
  bedCounts: {
    general: { type: Number, default: 0, min: 0 },
    emergency: { type: Number, default: 0, min: 0 },
    icu: { type: Number, default: 0, min: 0 },
    nicu: { type: Number, default: 0, min: 0 },
  },
  schemeParticipation: [SchemeParticipationSchema],
  // Metadata for uploaded compliance evidence documents (Files stored outside MongoDB in protected folder)
  evidenceDocuments: [EvidenceDocumentSchema],
  // Simulated consistency check warnings generated upon submission
  consistencyWarnings: [ConsistencyWarningSchema],
  // Immutable audit trail of verification actions
  verificationHistory: [VerificationHistorySchema],
  contact: {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    emergencyHelpline: { type: String, trim: true },
  },
  isSynthetic: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

HospitalSchema.index({ district: 1, verificationStatus: 1, tier: 1 });

module.exports = mongoose.model('Hospital', HospitalSchema);
