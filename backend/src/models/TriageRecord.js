const mongoose = require('mongoose');

/**
 * TriageRecord Schema (Phase 8.4c)
 * Records objective clinical vitals, chief complaints, and preliminary assessment
 * captured by Triage Nurses under supervising doctors.
 * ALL DATA IS SYNTHETIC. RESEARCH PROTOTYPE ONLY.
 */
const TriageRecordSchema = new mongoose.Schema({
  triageId: {
    type: String,
    required: [true, 'triageId is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'patientId is required'],
    index: true,
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: [true, 'hospitalId is required'],
    index: true,
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'recordedBy is required'],
    index: true,
  },
  recordedByRole: {
    type: String,
    enum: ['triage_nurse', 'doctor'],
    default: 'triage_nurse',
  },
  supervisingDoctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  recordedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  arrivalMode: {
    type: String,
    enum: ['walk-in', 'ambulance', 'referral_transfer', 'referral', 'wheelchair', 'police_escort', 'police', 'self_referral', 'self-referral', 'other'],
    default: 'walk-in',
  },
  chiefComplaint: {
    category: {
      type: String,
      required: true,
      trim: true,
      default: 'General',
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  symptomDuration: {
    type: String,
    trim: true,
    default: '1 hour',
  },
  vitals: {
    systolicBp: { type: Number, required: true },
    diastolicBp: { type: Number, required: true },
    heartRate: { type: Number, required: true },
    respiratoryRate: { type: Number, required: true },
    spo2: { type: Number, required: true },
    temperature: { type: Number, required: true },
    painScore: { type: Number, default: 0 },
    bloodGlucose: { type: Number, default: null },
    consciousness: {
      type: String,
      enum: ['alert', 'voice', 'pain', 'unresponsive'],
      default: 'alert',
    },
  },
  measurementMethod: {
    type: String,
    enum: ['manual', 'device'],
    default: 'manual',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'reviewed', 'amended'],
    default: 'draft',
    index: true,
  },
  computedScores: {
    news2: { type: Number, default: 0 },
    label: { type: String, default: 'Approximate NEWS2' },
  },
  redFlags: [{
    type: String,
  }],
  modelSuggestedUrgency: {
    type: String,
    enum: ['emergency', 'urgent', 'routine'],
    default: 'routine',
  },
  confirmedUrgency: {
    type: String,
    enum: ['emergency', 'urgent', 'routine'],
    default: null,
  },
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  confirmedAt: {
    type: Date,
    default: null,
  },
  overrideReason: {
    type: String,
    default: null,
  },
  remeasureRequested: {
    type: Boolean,
    default: false,
  },
  remeasureReason: {
    type: String,
    default: null,
  },
  amendmentHistory: [{
    amendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amendedAt: { type: Date, default: Date.now },
    reason: { type: String, required: true },
    previousVitals: { type: Object },
    previousNotes: { type: String },
  }],
  isDoctorEntered: {
    type: Boolean,
    default: false,
  },
  isSynthetic: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

/**
 * Validates physiological plausibility.
 * Returns { valid: boolean, error?: string, warnings?: string[] }
 */
TriageRecordSchema.statics.validatePhysiologicalVitals = function (vitals) {
  if (!vitals) return { valid: false, error: 'Vitals object is required.' };

  const { systolicBp, diastolicBp, heartRate, respiratoryRate, spo2, temperature, painScore, bloodGlucose } = vitals;

  // Impossible ranges - Reject
  if (systolicBp < 40 || systolicBp > 300) {
    return { valid: false, error: `Systolic BP (${systolicBp} mmHg) is physiologically impossible (acceptable range: 40-300 mmHg).` };
  }
  if (diastolicBp < 20 || diastolicBp > 200) {
    return { valid: false, error: `Diastolic BP (${diastolicBp} mmHg) is physiologically impossible (acceptable range: 20-200 mmHg).` };
  }
  if (diastolicBp >= systolicBp) {
    return { valid: false, error: `Diastolic BP (${diastolicBp}) cannot be greater than or equal to systolic BP (${systolicBp}).` };
  }
  if (heartRate < 20 || heartRate > 300) {
    return { valid: false, error: `Heart rate (${heartRate} bpm) is physiologically impossible (acceptable range: 20-300 bpm).` };
  }
  if (respiratoryRate < 4 || respiratoryRate > 70) {
    return { valid: false, error: `Respiratory rate (${respiratoryRate} /min) is physiologically impossible (acceptable range: 4-70 /min).` };
  }
  if (spo2 < 30 || spo2 > 100) {
    return { valid: false, error: `SpO2 saturation (${spo2}%) is physiologically impossible (acceptable range: 30-100%).` };
  }
  if (temperature < 25 || temperature > 45) {
    return { valid: false, error: `Temperature (${temperature}°C) is physiologically impossible (acceptable range: 25-45°C).` };
  }
  if (painScore !== undefined && painScore !== null && (painScore < 0 || painScore > 10)) {
    return { valid: false, error: `Pain score (${painScore}) must be an integer between 0 and 10.` };
  }
  if (bloodGlucose !== undefined && bloodGlucose !== null && bloodGlucose !== '' && (bloodGlucose < 10 || bloodGlucose > 1000)) {
    return { valid: false, error: `Blood glucose (${bloodGlucose} mg/dL) is physiologically impossible (acceptable range: 10-1000 mg/dL).` };
  }

  // Borderline checks - Warnings (check measurement)
  const warnings = [];
  if (systolicBp < 90 || systolicBp > 180) warnings.push('Check Systolic BP measurement (borderline abnormal)');
  if (diastolicBp < 50 || diastolicBp > 110) warnings.push('Check Diastolic BP measurement (borderline abnormal)');
  if (heartRate < 50 || heartRate > 120) warnings.push('Check Heart Rate measurement (borderline abnormal)');
  if (respiratoryRate < 10 || respiratoryRate > 24) warnings.push('Check Respiratory Rate measurement (borderline abnormal)');
  if (spo2 < 92) warnings.push('Check SpO2 measurement (hypoxemia alert)');
  if (temperature < 35.5 || temperature > 38.5) warnings.push('Check Temperature measurement (borderline abnormal)');

  return { valid: true, warnings };
};

/**
 * Calculates NEWS2-style approximate score and detects red flags.
 */
TriageRecordSchema.statics.computeTriageScores = function (vitals) {
  const redFlags = [];
  let news2 = 0;

  const { systolicBp, heartRate, respiratoryRate, spo2, temperature, consciousness } = vitals;

  // Red flags detection
  if (spo2 < 90) redFlags.push('SpO2 < 90% (Critical hypoxemia)');
  if (systolicBp < 90) redFlags.push('Systolic BP < 90 mmHg (Severe hypotension / shock)');
  if (heartRate > 130) redFlags.push('Heart Rate > 130 bpm (Severe tachycardia)');
  if (heartRate < 40) redFlags.push('Heart Rate < 40 bpm (Critical bradycardia)');
  if (respiratoryRate > 30) redFlags.push('Respiratory Rate > 30 /min (Severe tachypnea)');
  if (respiratoryRate < 8) redFlags.push('Respiratory Rate < 8 /min (Critical bradypnea / respiratory depression)');
  if (consciousness && consciousness !== 'alert') redFlags.push(`Consciousness level: ${consciousness.toUpperCase()} (Altered mental state)`);
  if (temperature > 40) redFlags.push('Temperature > 40°C (Hyperpyrexia)');
  if (temperature < 35) redFlags.push('Temperature < 35°C (Hypothermia)');

  // NEWS2 scoring
  // Respiratory Rate
  if (respiratoryRate <= 8 || respiratoryRate >= 25) news2 += 3;
  else if (respiratoryRate >= 21) news2 += 2;
  else if (respiratoryRate <= 11) news2 += 1;

  // SpO2
  if (spo2 <= 91) news2 += 3;
  else if (spo2 <= 93) news2 += 2;
  else if (spo2 <= 95) news2 += 1;

  // Systolic BP
  if (systolicBp <= 90 || systolicBp >= 220) news2 += 3;
  else if (systolicBp <= 100) news2 += 2;
  else if (systolicBp <= 110) news2 += 1;

  // Heart Rate
  if (heartRate <= 40 || heartRate >= 131) news2 += 3;
  else if (heartRate >= 111) news2 += 2;
  else if (heartRate <= 50 || heartRate >= 91) news2 += 1;

  // Consciousness
  if (consciousness && consciousness !== 'alert') news2 += 3;

  // Temperature
  if (temperature <= 35.0) news2 += 3;
  else if (temperature >= 39.1) news2 += 2;
  else if (temperature <= 36.0 || temperature >= 38.1) news2 += 1;

  // Determine suggested priority label
  let modelSuggestedUrgency = 'routine';
  if (redFlags.length > 0 || news2 >= 7) {
    modelSuggestedUrgency = 'emergency';
  } else if (news2 >= 4) {
    modelSuggestedUrgency = 'urgent';
  }

  return {
    news2,
    redFlags,
    modelSuggestedUrgency,
  };
};

module.exports = mongoose.model('TriageRecord', TriageRecordSchema);
