const mongoose = require('mongoose');

const RecommendationItemSchema = new mongoose.Schema({
  hospitalId: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  name: { type: String },
  hospitalName: { type: String },
  code: { type: String },
  district: { type: String },
  hospitalDistrict: { type: String },
  rank: { type: Number, required: true },
  tier: { type: String },
  effectiveTier: { type: String },
  score: { type: Number },
  totalScore: { type: Number },
  scoreBreakdown: { type: mongoose.Schema.Types.Mixed },
  distanceKm: { type: Number },
  distanceNotice: { type: String },
  capacityState: { type: String },
  capacityReportedState: { type: String },
  capacityAgeMinutes: { type: Number },
  capacityAgeLabel: { type: String },
  isCapacityStale: { type: Boolean, default: false },
  matchedCapabilities: [{ type: String }],
  flags: [{ type: String }],
  schemeParticipation: { type: mongoose.Schema.Types.Mixed },
  schemeMatched: { type: Boolean },
  explanation: { type: String },
}, { _id: false });

const ReferralSchema = new mongoose.Schema({
  referralId: {
    type: String,
    required: [true, 'Referral ID is required'],
    unique: true,
    trim: true,
    index: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  patientName: {
    type: String,
    required: [true, 'Patient name is required'],
    trim: true,
  },
  referringDoctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  referringHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
  },
  patientSummary: {
    age: { type: Number, min: 0, max: 120 },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    chiefComplaint: { type: String, trim: true },
    provisionalDiagnosis: { type: String, trim: true },
    vitals: {
      bpSystolic: { type: Number },
      bpDiastolic: { type: Number },
      heartRate: { type: Number },
      respiratoryRate: { type: Number },
      spo2: { type: Number },
      gcs: { type: Number },
      tempCelsius: { type: Number },
    },
    triageSeverity: {
      score: { type: Number, default: 3 },
      category: {
        type: String,
        enum: ['immediate', 'urgent', 'delayed', 'normal'],
        default: 'urgent',
      },
      predictedBy: {
        type: String,
        enum: ['clinical_rule', 'ml_severity_model', 'clinician'],
        default: 'clinical_rule',
      },
      highRiskProbability: { type: Number, min: 0, max: 1 },
    },
  },
  requirements: {
    requiredSpecialty: {
      type: String,
      required: [true, 'Required specialty is required'],
      trim: true,
    },
    urgency: {
      type: String,
      enum: ['emergency', 'urgent', 'routine', 'immediate', 'standard', 'elective'],
      default: 'urgent',
    },
    requiredEquipment: [{
      type: String,
      trim: true,
    }],
    requiredServices: [{
      type: String,
      trim: true,
    }],
    patientCoordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      district: { type: String, trim: true },
    },
    preferredScheme: {
      type: String,
      enum: ['CMCHIS', 'PM-JAY', 'none', null],
      default: null,
    },
    capacityMode: {
      type: String,
      enum: ['unknown_aware', 'assume_available'],
      default: 'unknown_aware',
    },
    modelSuggestedUrgency: {
      type: String,
      enum: ['emergency', 'urgent', 'routine', null],
      default: null,
    },
    urgencyConfirmedByDoctor: {
      type: Boolean,
      default: true,
    },
    urgencyOverrideReason: {
      type: String,
      trim: true,
    },
  },
  mlAssessment: {
    assessedAt: { type: Date },
    modelVersion: { type: String },
    triageScore: { type: Number },
    triageCategory: { type: String },
    flaggedConditions: [{ type: String }],
    topContributors: [{ type: String }],
    rawAssessment: { type: mongoose.Schema.Types.Mixed },
  },
  engineVersion: {
    type: String,
    default: '1.0.0',
  },
  configSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  candidates: [RecommendationItemSchema],
  rankedRecommendations: [RecommendationItemSchema],
  excludedHospitals: [{
    hospitalId: { type: String },
    hospitalName: { type: String },
    reason: { type: String },
    filterCode: { type: String },
  }],
  selectedHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
  },
  // Workflow states: draft -> reviewed -> sent -> accepted | declined | cancelled
  status: {
    type: String,
    enum: ['draft', 'reviewed', 'sent', 'accepted', 'declined', 'cancelled', 'submitted'],
    default: 'draft',
    index: true,
  },
  clinicianReview: {
    clinicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    clinicianName: { type: String },
    selectedHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    notes: { type: String, trim: true },
    overrideReason: { type: String, trim: true },
    reviewedAt: { type: Date },
  },
  doctorNotes: {
    type: String,
    trim: true,
  },
  clinicalDisclaimerAcknowledged: {
    type: Boolean,
    default: true,
  },
  decisionSupportDisclaimer: {
    type: String,
    default: 'Decision support only. A clinician must review.',
  },
  isSynthetic: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

ReferralSchema.index({ referringDoctorId: 1, createdAt: -1 });
ReferralSchema.index({ selectedHospitalId: 1, status: 1 });

module.exports = mongoose.model('Referral', ReferralSchema);
