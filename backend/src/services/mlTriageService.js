/**
 * mlTriageService.js
 * ------------------
 * Client service connecting the Node.js backend to the Python FastAPI
 * ML Decision Support microservice.
 *
 * Provides:
 * 1. predictSeverity(vitalsAndIntake): Triage urgency prediction.
 * 2. assessPatient(patientData): Full multi-condition risk screening, red-flag detection,
 *    specialty mapping, and urgency reconciliation.
 * 3. Graceful fallback to rule-based decision support when ML service is unavailable,
 *    ensuring platform resilience and clinical continuity.
 *
 * Strict Constraint:
 * Prototype only. Outputs are clinical decision support for doctor review, never diagnoses.
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
const DEFAULT_TIMEOUT_MS = parseInt(process.env.ML_SERVICE_TIMEOUT_MS || '4000', 10);
const MANDATORY_DISCLAIMER = 'Decision support only. A clinician must review.';

/**
 * Embedded clinical red flag evaluator (used for fallback).
 */
function evaluateRedFlagsFallback(p) {
  const flags = [];
  const sbp = p.sbp !== undefined ? p.sbp : p.trestbps;
  const dbp = p.dbp;

  if (sbp !== undefined && dbp !== undefined && sbp >= 180 && dbp >= 120) {
    flags.push({
      flag: 'HYPERTENSIVE_CRISIS',
      severity: 'emergency',
      guideline: 'ACC/AHA 2017 Hypertensive Emergency Guidelines',
      clinical_rationale: `Extreme blood pressure elevation (${sbp}/${dbp} mmHg) with immediate risk of target organ damage.`,
      recommended_action: 'Immediate emergency department resuscitation and IV antihypertensive titration.',
    });
  }

  if (p.stroke_signs || p.fast_positive) {
    flags.push({
      flag: 'ACUTE_STROKE_SYMPTOMS',
      severity: 'emergency',
      guideline: 'AHA/ASA Acute Ischemic Stroke Guidelines',
      clinical_rationale: 'Focal neurological deficits or FAST positive screen indicate acute cerebrovascular event.',
      recommended_action: 'Immediate emergency stroke code activation and non-contrast head CT within 20 minutes.',
    });
  }

  if (p.chest_pain && ((sbp && sbp < 90) || (p.heartrate && p.heartrate > 120))) {
    flags.push({
      flag: 'HEMODYNAMICALLY_UNSTABLE_CHEST_PAIN',
      severity: 'emergency',
      guideline: 'ESC/AHA Acute Coronary Syndrome & Cardiogenic Shock Guidelines',
      clinical_rationale: 'Chest pain accompanied by hypotension or severe tachycardia suggests acute coronary syndrome.',
      recommended_action: 'Immediate emergency resuscitation, 12-lead ECG, cardiology consult, and cath lab activation.',
    });
  }

  if (p.altered_consciousness || (p.avpu && ['Voice', 'Pain', 'Unresponsive'].includes(p.avpu))) {
    flags.push({
      flag: 'ACUTE_ALTERED_MENTAL_STATUS',
      severity: 'emergency',
      guideline: 'ACEP Altered Mental Status Clinical Policy',
      clinical_rationale: 'Reduced responsiveness requires emergency airway protection and diagnostic evaluation.',
      recommended_action: 'Airway assessment, blood glucose check, immediate medical evaluation.',
    });
  }

  if (p.o2sat !== undefined && p.o2sat < 88) {
    flags.push({
      flag: 'SEVERE_HYPOXEMIA',
      severity: 'emergency',
      guideline: 'BTS Oxygen Guidelines',
      clinical_rationale: `Critical oxygen desaturation (SpO2 ${p.o2sat}%) indicates impending respiratory failure.`,
      recommended_action: 'Immediate high-flow oxygen, airway evaluation, and urgent escalation.',
    });
  }

  return flags;
}

/**
 * Embedded rule-based fallback when ML microservice is unreachable.
 */
function createFallbackAssessment(patientData, reason = 'ML microservice unreachable') {
  const redFlags = evaluateRedFlagsFallback(patientData);
  const sbp = patientData.sbp !== undefined ? patientData.sbp : patientData.trestbps;
  const o2sat = patientData.o2sat;
  const hr = patientData.heartrate;
  const rr = patientData.resprate;

  // Triage urgency
  let triageUrgency = 'routine';
  const triageContributors = [];
  if (o2sat !== undefined && o2sat < 94) {
    triageUrgency = 'urgent';
    triageContributors.push(`Subnormal SpO2 (${o2sat}%)`);
  }
  if (hr !== undefined && (hr > 105 || hr < 50)) {
    triageUrgency = 'urgent';
    triageContributors.push(`Abnormal heart rate (${hr} bpm)`);
  }
  if (sbp !== undefined && (sbp > 150 || sbp < 95)) {
    triageUrgency = 'urgent';
    triageContributors.push(`Abnormal blood pressure (${sbp} mmHg)`);
  }
  if (rr !== undefined && (rr > 22 || rr < 10)) {
    triageUrgency = 'urgent';
    triageContributors.push(`Abnormal respiratory rate (${rr} breaths/min)`);
  }
  if (patientData.arrival_transport === 'AMBULANCE') {
    triageUrgency = 'urgent';
    triageContributors.push('Ambulance arrival mode');
  }

  // Condition screening rules
  const risks = [];
  const flaggedSpecialties = [];
  const requiredFacilities = new Set(['lab']);
  const conditionUrgencies = [];
  const explanations = [...triageContributors];

  // Diabetes rule
  const glucose = patientData.Glucose || patientData.bgr;
  if (glucose !== undefined && glucose >= 140) {
    risks.push({
      condition: 'Diabetes',
      icd10: 'E11',
      specialty: 'Endocrinology',
      risk_score: glucose >= 200 ? 0.85 : 0.65,
      threshold: 0.35,
      flagged: true,
      top_contributors: [`Elevated blood glucose (${glucose} mg/dL)`],
    });
    flaggedSpecialties.push('Endocrinology');
    conditionUrgencies.push('urgent');
    requiredFacilities.add('lab');
    explanations.push(`Elevated glucose (${glucose} mg/dL)`);
  }

  // Cardiac rule
  if (patientData.chest_pain || (patientData.chol && patientData.chol >= 240) || (patientData.oldpeak && patientData.oldpeak > 1.5)) {
    risks.push({
      condition: 'Heart Disease',
      icd10: 'I25.1',
      specialty: 'Cardiology',
      risk_score: 0.80,
      threshold: 0.40,
      flagged: true,
      top_contributors: ['Reported chest pain / cardiac findings'],
    });
    flaggedSpecialties.push('Cardiology');
    conditionUrgencies.push('urgent');
    requiredFacilities.add('ecg');
    requiredFacilities.add('echo');
    requiredFacilities.add('cathLab');
    explanations.push('Suspected coronary syndrome / cardiac risk');
  }

  // Renal rule
  const sc = patientData.sc;
  if (sc !== undefined && sc >= 1.4) {
    risks.push({
      condition: 'Chronic Kidney Disease',
      icd10: 'N18.9',
      specialty: 'Nephrology',
      risk_score: 0.90,
      threshold: 0.30,
      flagged: true,
      top_contributors: [`Elevated serum creatinine (${sc} mg/dL)`],
    });
    flaggedSpecialties.push('Nephrology');
    conditionUrgencies.push('urgent');
    requiredFacilities.add('dialysisUnit');
    requiredFacilities.add('lab');
    explanations.push(`Elevated serum creatinine (${sc} mg/dL)`);
  }

  // Liver rule
  const tb = patientData.tb;
  if (tb !== undefined && tb >= 2.0) {
    risks.push({
      condition: 'Liver Disease',
      icd10: 'K76.9',
      specialty: 'Gastroenterology',
      risk_score: 0.75,
      threshold: 0.35,
      flagged: true,
      top_contributors: [`Elevated total bilirubin (${tb} mg/dL)`],
    });
    flaggedSpecialties.push('Gastroenterology');
    conditionUrgencies.push('urgent');
    requiredFacilities.add('ultrasound');
    requiredFacilities.add('lab');
    explanations.push(`Elevated total bilirubin (${tb} mg/dL)`);
  }

  // Thyroid rule
  const tsh = patientData.TSH;
  if (tsh !== undefined && (tsh >= 6.0 || tsh < 0.3)) {
    risks.push({
      condition: 'Thyroid Disease',
      icd10: 'E03.9',
      specialty: 'Endocrinology',
      risk_score: 0.70,
      threshold: 0.30,
      flagged: true,
      top_contributors: [`Abnormal TSH level (${tsh} mIU/L)`],
    });
    flaggedSpecialties.push('Endocrinology');
    conditionUrgencies.push('routine');
    requiredFacilities.add('lab');
    explanations.push(`Abnormal TSH (${tsh} mIU/L)`);
  }

  // Anemia rule
  const hemo = patientData.hemo;
  if (hemo !== undefined && hemo < 12.0) {
    risks.push({
      condition: 'Anemia',
      icd10: 'D64.9',
      specialty: 'General Medicine',
      risk_score: 0.80,
      threshold: 12.0,
      flagged: true,
      severity: hemo < 8.0 ? 'severe' : 'moderate',
      top_contributors: [`Hemoglobin ${hemo} g/dL`],
    });
    flaggedSpecialties.push('General Medicine');
    conditionUrgencies.push(hemo < 8.0 ? 'urgent' : 'routine');
    requiredFacilities.add('lab');
    if (hemo < 8.0) requiredFacilities.add('bloodBank');
    explanations.push(`Hemoglobin ${hemo} g/dL`);
  }

  // Hypertension rule
  if (sbp !== undefined && sbp >= 130) {
    risks.push({
      condition: 'Hypertension',
      icd10: 'I10',
      specialty: 'General Medicine',
      risk_score: 0.85,
      threshold: 130,
      flagged: true,
      stage: sbp >= 140 ? 'Stage 2 Hypertension' : 'Stage 1 Hypertension',
      top_contributors: [`Systolic blood pressure ${sbp} mmHg`],
    });
    flaggedSpecialties.push('General Medicine');
    conditionUrgencies.push(sbp >= 160 ? 'urgent' : 'routine');
    requiredFacilities.add('ecg');
    explanations.push(`Hypertension (SBP ${sbp} mmHg)`);
  }

  if (flaggedSpecialties.length === 0) {
    flaggedSpecialties.push('General Medicine');
  }

  // Urgency reconciliation
  let finalUrgency = 'routine';
  if (redFlags.length > 0) {
    finalUrgency = 'emergency';
  } else if (triageUrgency === 'urgent' || conditionUrgencies.includes('urgent')) {
    finalUrgency = 'urgent';
  }

  const uniqueSpecialties = Array.from(new Set(flaggedSpecialties));

  return {
    status: 'success',
    urgency: finalUrgency,
    triage_urgency_suggestion: triageUrgency,
    specialties: uniqueSpecialties.slice(0, 3),
    required_facilities: Array.from(requiredFacilities).sort(),
    red_flags: redFlags,
    condition_risks: risks,
    missing_tests: [],
    explanations: Array.from(new Set(explanations)).slice(0, 5),
    model_versions: {
      triage: 'fallback_clinical_rules_1.0',
      screening_pipeline: 'fallback_clinical_rules_1.0',
      red_flags_config: '1.0.0',
    },
    serviceFallback: true,
    fallbackReason: reason,
    disclaimer: MANDATORY_DISCLAIMER,
  };
}

/**
 * Check if the Python ML microservice is reachable.
 */
async function isMlServiceAvailable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const resp = await fetch(`${ML_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Predict triage severity using the ML microservice.
 * Falls back to clinical rules if microservice is offline.
 *
 * @param {object} payload
 * @returns {Promise<object>} Triage severity response
 */
async function predictSeverity(payload) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const res = await fetch(`${ML_SERVICE_URL}/predict-severity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[ML Service HTTP ${res.status}]: ${errBody}. Using fallback.`);
      return fallbackSeverity(payload, `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn(`[ML Service predictSeverity error: ${err.message}]. Using fallback.`);
    return fallbackSeverity(payload, err.message);
  }
}

function fallbackSeverity(payload, reason) {
  const o2sat = payload.o2sat;
  const hr = payload.heartrate;
  const sbp = payload.sbp;
  const isHigh = (o2sat !== undefined && o2sat < 94) || (hr !== undefined && (hr > 105 || hr < 50)) || (sbp !== undefined && (sbp > 150 || sbp < 95));
  return {
    riskScore: isHigh ? 0.72 : 0.28,
    riskCategory: isHigh ? 'high_acuity' : 'lower_acuity',
    thresholdUsed: 0.51,
    topContributors: isHigh ? ['Abnormal physiological vitals'] : ['Baseline vital parameters within non-critical range'],
    missingInputs: [],
    modelVersion: 'fallback_news2_1.0',
    dataSource: 'Rule-Based NEWS2 Approximation Fallback',
    serviceFallback: true,
    fallbackReason: reason,
    notice: MANDATORY_DISCLAIMER,
  };
}

/**
 * Full clinical assessment: triage + screening models + red flags + specialty mapping.
 * Falls back gracefully to rule-based engine if microservice is offline.
 *
 * @param {object} patientData
 * @returns {Promise<object>} Full assessment object
 */
async function assessPatient(patientData) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const res = await fetch(`${ML_SERVICE_URL}/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patientData),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[ML Service /assess HTTP ${res.status}]: ${errBody}. Using fallback.`);
      return createFallbackAssessment(patientData, `HTTP ${res.status}`);
    }

    const data = await res.json();
    data.serviceFallback = false;
    return data;
  } catch (err) {
    console.warn(`[ML Service assessPatient error: ${err.message}]. Using fallback.`);
    return createFallbackAssessment(patientData, err.message);
  }
}

module.exports = {
  predictSeverity,
  assessPatient,
  isMlServiceAvailable,
  evaluateRedFlagsFallback,
  createFallbackAssessment,
  MANDATORY_DISCLAIMER,
};
