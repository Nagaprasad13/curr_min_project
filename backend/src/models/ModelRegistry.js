const mongoose = require('mongoose');

const ModelRegistrySchema = new mongoose.Schema({
  modelId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    enum: ['triage', 'ckd', 'diabetes', 'heart', 'liver', 'thyroid'],
    trim: true,
  },
  version: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['candidate', 'active', 'retired'],
    default: 'candidate',
    required: true,
  },
  datasetName: { type: String, required: true, trim: true },
  datasetSource: { type: String, required: true, trim: true },
  datasetRowCount: { type: Number, required: true, min: 1 },
  trainingDate: { type: Date, required: true },
  metrics: { type: mongoose.Schema.Types.Mixed, required: true },
  threshold: { type: Number, required: true, min: 0, max: 1 },
  thresholdPolicy: { type: String, required: true, trim: true },
  featureList: [{ type: String, trim: true }],
  calibrationMethod: { type: String, required: true, trim: true },
  artifactPath: { type: String, required: true, trim: true },
  artifactSha256: {
    type: String,
    required: true,
    lowercase: true,
    match: /^[a-f0-9]{64}$/,
  },
  modelCardRef: { type: String, required: true, trim: true },
  limitations: { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
});

ModelRegistrySchema.index({ name: 1, version: 1 }, { unique: true });
ModelRegistrySchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'one_active_version_per_model',
  }
);
ModelRegistrySchema.index({ status: 1, name: 1 });

module.exports = mongoose.model('ModelRegistry', ModelRegistrySchema);
