const mongoose = require('mongoose');

/**
 * TriageAlert Schema (Phase 8.4c)
 * In-app critical alerts created when red-flag physiological triggers fire during nurse triage.
 * Delivered to supervising doctors and hospital doctors on duty.
 * ALL DATA IS SYNTHETIC. RESEARCH PROTOTYPE ONLY.
 */
const TriageAlertSchema = new mongoose.Schema({
  triageId: {
    type: String,
    required: true,
    index: true,
  },
  triageRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TriageRecord',
    required: true,
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true,
    index: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  patientName: {
    type: String,
    required: true,
  },
  redFlags: [{
    type: String,
  }],
  news2Score: {
    type: Number,
    default: 0,
  },
  severity: {
    type: String,
    enum: ['critical', 'high'],
    default: 'critical',
  },
  message: {
    type: String,
    required: true,
  },
  acknowledged: {
    type: Boolean,
    default: false,
    index: true,
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  acknowledgedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model('TriageAlert', TriageAlertSchema);
