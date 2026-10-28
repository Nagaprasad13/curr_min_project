const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  logId: {
    type: String,
    required: [true, 'Log ID is required'],
    unique: true,
    trim: true,
    index: true,
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  actorRole: {
    type: String,
    enum: ['patient', 'doctor', 'hospital_admin', 'triage_nurse', 'platform_reviewer', 'system'],
    required: true,
  },
  action: {
    type: String,
    enum: [
      'VIEW_PATIENT_RECORD',
      'SHARE_RECORD',
      'REQUEST_CONSENT',
      'GRANT_CONSENT',
      'DENY_CONSENT',
      'REVOKE_CONSENT',
      'EXPIRE_CONSENT',
      'DENIED_RECORD_ACCESS',
      'BREAK_GLASS_ACCESS',
      'CREATE_REFERRAL',
      'CONFIRM_REFERRAL',
      'OVERRIDE_REFERRAL',
      'UPDATE_CAPACITY',
      'UPDATE_MODEL_STATUS',
      'QUERY_REFERRAL_ENGINE',
      'EXPORT_REPORT',
      'REGISTER_HOSPITAL',
      'EDIT_HOSPITAL',
      'SUBMIT_FOR_VERIFICATION',
      'VERIFY_HOSPITAL',
      'REJECT_HOSPITAL',
      'TIER_RECLASSIFIED',
      'SYSTEM_AUDIT',
      'ASSESS_TRIAGE_SEVERITY',
      'PREDICT_TRIAGE_SEVERITY',
      'OVERRIDE_MODEL_URGENCY',
      'MATCH_SCHEME',
      'VERIFY_SCHEME',
      'CREATE_SCHEME',
      'UPDATE_SCHEME',
      'FLAG_OUTDATED_SCHEME',
      'REVIEW_SPECIALTY_MAP',
      'CREATE_TRIAGE_RECORD',
      'EDIT_TRIAGE_RECORD',
      'SUBMIT_TRIAGE_RECORD',
      'AMEND_TRIAGE_RECORD',
      'VIEW_TRIAGE_RECORD',
      'OVERRIDE_TRIAGE_URGENCY',
      'CONFIRM_TRIAGE_URGENCY',
      'REQUEST_REMEASURE',
      'CREATE_TRIAGE_ALERT',
      'ACK_TRIAGE_ALERT',
      'LIST_TRIAGE_RECORDS',
      'LIST_TRIAGE_INTAKE_PATIENTS',
      'VIEW_TRIAGE_ALERTS',
      'LIST_HOSPITAL_NURSES',
      'INVITE_TRIAGE_NURSE',
      'UPDATE_TRIAGE_NURSE',
      'VERIFY_NURSE',
      'REJECT_NURSE',
      'DEACTIVATE_NURSE'
    ],
    required: true,
    index: true,
  },
  resourceType: {
    type: String,
    enum: ['Hospital', 'HospitalCapacity', 'Referral', 'Consent', 'PatientRecord', 'Scheme', 'ClinicalDecisionSupport', 'ConditionSpecialtyMap', 'ModelRegistry', 'User', 'TriageRecord', 'TriageAlert'],
    required: true,
  },
  resourceId: {
    type: String,
    index: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    index: true,
  },
  accessGranted: {
    type: Boolean,
    required: true,
  },
  justification: {
    type: String,
    trim: true,
  },
  ipAddress: {
    type: String,
    default: '127.0.0.1',
  },
  userAgent: {
    type: String,
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true,
    index: true,
  },
}, {
  // Audit logs are append-only; disable update timestamp
  timestamps: false,
});

AuditLogSchema.index({ timestamp: -1, action: 1 });
AuditLogSchema.index({ patientId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
