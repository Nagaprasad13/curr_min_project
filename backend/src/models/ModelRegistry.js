const mongoose = require('mongoose');

/**
 * ModelRegistry Schema (Phase 8.3)
 * Tracks machine learning model artifacts, versions, operating thresholds,
 * performance metrics, and cryptographic SHA-256 hashes.
 * ALL CLINICAL MODELS ARE RESEARCH PROTOTYPES ONLY.
 */
const ModelRegistrySchema = new mongoose.Schema({
  modelId: {
    type: String,
    required: [true, 'modelId is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Model name is required'],
    trim: true,
  },
  version: {
    type: String,
    required: [true, 'Model version is required (e.g. 1.0.0)'],
    trim: true,
  },
  modelType: {
    type: String,
    enum: ['triage', 'screening'],
    required: true,
    index: true,
  },
  condition: {
    type: String,
    required: true,
    trim: true,
    index: true, // 'triage', 'ckd', 'diabetes', 'heart', 'liver', 'thyroid'
  },
  status: {
    type: String,
    enum: ['candidate', 'active', 'retired'],
    default: 'active',
    index: true,
  },
  operatingThreshold: {
    type: Number,
    required: true,
    min: 0.0,
    max: 1.0,
  },
  metrics: {
    rocAuc: { type: Number, min: 0.0, max: 1.0 },
    f1: { type: Number, min: 0.0, max: 1.0 },
    sensitivity: { type: Number, min: 0.0, max: 1.0 },
    specificity: { type: Number, min: 0.0, max: 1.0 },
    brierScore: { type: Number, min: 0.0, max: 1.0 },
    sampleSize: { type: Number },
  },
  artifactPath: {
    type: String,
    required: [true, 'Relative artifact path is required'],
    trim: true,
  },
  artifactSha256: {
    type: String,
    required: [true, 'Cryptographic SHA-256 hash of model artifact is required'],
    trim: true,
    lowercase: true,
    match: [/^[a-f0-9]{64}$/, 'artifactSha256 must be a valid 64-character hex string'],
  },
  featureNames: [{
    type: String,
    trim: true,
  }],
  datasetLineage: {
    source: { type: String, trim: true },
    recordCount: { type: Number },
    splitSeed: { type: Number },
  },
  modelCardRef: {
    type: String,
    trim: true,
  },
  promotedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  promotedAt: {
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

// Composite index for querying active condition model
ModelRegistrySchema.index({ condition: 1, status: 1 });

module.exports = mongoose.model('ModelRegistry', ModelRegistrySchema);
