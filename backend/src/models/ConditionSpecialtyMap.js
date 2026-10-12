const mongoose = require('mongoose');

const ConditionSpecialtyMapSchema = new mongoose.Schema({
  condition_id: {
    type: String,
    required: [true, 'condition_id is required'],
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  icd10_code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  primary_specialty: {
    type: String,
    required: true,
    trim: true,
  },
  secondary_specialty: {
    type: String,
    trim: true,
  },
  required_facilities: [{
    type: String,
    trim: true,
  }],
  min_hospital_tier: {
    type: String,
    enum: ['Tier 1', 'Tier 2', 'Tier 3'],
    default: 'Tier 2',
  },
  escalation_rules: {
    type: String,
    trim: true,
  },
  reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  last_reviewed: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['PENDING CLINICIAN REVIEW', 'REVIEWED_ACCEPTED', 'MODIFIED'],
    default: 'PENDING CLINICIAN REVIEW',
  },
}, {
  timestamps: true,
  collection: 'conditionSpecialtyMap',
});

module.exports = mongoose.model('ConditionSpecialtyMap', ConditionSpecialtyMapSchema);
