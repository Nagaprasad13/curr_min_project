const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * PatientRecord Schema (Phase 6 Metadata Collection)
 * 
 * Clinical data files live in protected storage outside MongoDB.
 * MongoDB stores metadata, provenance, sensitivity flags, and storage references only.
 * ALL DATA IS SYNTHETIC. RESEARCH PROTOTYPE ONLY.
 */
const PatientRecordSchema = new mongoose.Schema({
  recordId: {
    type: String,
    required: [true, 'Record ID is required'],
    unique: true,
    index: true,
    default: () => uuidv4(), // Random UUID, never sequential
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Patient ID is required'],
    index: true,
  },
  sourceHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: [true, 'Source hospital ID is required'],
    index: true,
  },
  type: {
    type: String,
    required: [true, 'Record type is required'],
    enum: [
      'lab_report',
      'prescription',
      'discharge_summary',
      'diagnosis',
      'allergy',
      'imaging_report'
    ],
    index: true,
  },
  title: {
    type: String,
    required: [true, 'Clinical title/summary is required'],
    trim: true,
  },
  recordDate: {
    type: Date,
    required: [true, 'Record date is required'],
    index: true,
  },
  provenance: {
    submittedBy: { type: String, required: true },
    sourceSystem: { type: String, required: true, default: 'Hospital-HIS-Simulated' },
    facilityName: { type: String, required: true },
    practitionerName: { type: String },
    facilityDistrict: { type: String },
  },
  contentRef: {
    type: String,
    required: [true, 'Content storage reference pointer is required'],
  },
  contentMimeType: {
    type: String,
    default: 'application/json',
  },
  sensitivityLevel: {
    type: String,
    enum: ['normal', 'sensitive'],
    default: 'normal',
    index: true,
  },
  sensitiveCategory: {
    type: String, // e.g., 'mental_health', 'reproductive_health', 'oncology_screening', 'hiv'
    default: null,
  },
  isSynthetic: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

PatientRecordSchema.index({ patientId: 1, type: 1, recordDate: -1 });

module.exports = mongoose.model('PatientRecord', PatientRecordSchema);
