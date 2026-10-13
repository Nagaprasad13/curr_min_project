/**
 * CareBridge: Condition-Specialty Mapping Seed Data
 * Clinical Decision Support Reference Table for Platform Reviewer sign-off.
 * 
 * DISCLAIMER: Decision support only. Clinician review required.
 * Reference protocols based on standard emergency medicine triage pathways.
 */

const ConditionSpecialtyMap = require('../models/ConditionSpecialtyMap');

const INITIAL_CONDITION_MAP = [
  {
    condition_id: 'COND-ACS-001',
    name: 'Acute Coronary Syndrome (STEMI / NSTEMI)',
    icd10_code: 'I21.9',
    primary_specialty: 'Cardiology',
    secondary_specialty: 'Emergency Medicine',
    required_facilities: ['Cath Lab', 'ICU', '24x7 Emergency'],
    min_hospital_tier: 'Tier 1',
    escalation_rules: 'Door-to-balloon time target <90 min; immediate thrombolysis if transfer time >120 min.',
    status: 'PENDING CLINICIAN REVIEW',
  },
  {
    condition_id: 'COND-RESP-002',
    name: 'Acute Hypoxemic Respiratory Failure / ARDS',
    icd10_code: 'J96.0',
    primary_specialty: 'Pulmonology',
    secondary_specialty: 'Critical Care Medicine',
    required_facilities: ['Mechanical Ventilator', 'ICU', 'ABG Analysis'],
    min_hospital_tier: 'Tier 2',
    escalation_rules: 'Escalate to Tier 1 if ECMO or high-frequency oscillation is indicated.',
    status: 'REVIEWED_ACCEPTED',
  },
  {
    condition_id: 'COND-STROKE-003',
    name: 'Acute Ischemic Stroke (Hyperacute Window)',
    icd10_code: 'I63.9',
    primary_specialty: 'Neurology',
    secondary_specialty: 'Neurosurgery',
    required_facilities: ['CT Scanner (24x7)', 'Stroke Unit / ICU', 'IV Thrombolysis'],
    min_hospital_tier: 'Tier 1',
    escalation_rules: 'IV tPA window <4.5h; mechanical thrombectomy window <24h requires Tier 1 neuro-interventional suite.',
    status: 'REVIEWED_ACCEPTED',
  },
  {
    condition_id: 'COND-SEPSIS-004',
    name: 'Septic Shock with Multi-Organ Dysfunction',
    icd10_code: 'R65.21',
    primary_specialty: 'Emergency Medicine',
    secondary_specialty: 'Nephrology',
    required_facilities: ['ICU', 'Dialysis Facility', 'Central Venous Access'],
    min_hospital_tier: 'Tier 2',
    escalation_rules: 'Initiate broad-spectrum IV antimicrobials within 1 hour; escalate to Tier 1 if CRRT is required.',
    status: 'PENDING CLINICIAN REVIEW',
  },
  {
    condition_id: 'COND-POLYT-005',
    name: 'Major Polytrauma / Traumatic Brain Injury',
    icd10_code: 'T07',
    primary_specialty: 'General Surgery',
    secondary_specialty: 'Orthopedics',
    required_facilities: ['Blood Bank', 'Dedicated Trauma OT', 'CT Scanner', 'ICU'],
    min_hospital_tier: 'Tier 1',
    escalation_rules: 'Damage-control resuscitation within golden hour; transfer immediately if neurosurgical decompression needed.',
    status: 'PENDING CLINICIAN REVIEW',
  },
];

async function seedConditionSpecialtyMap() {
  await ConditionSpecialtyMap.deleteMany({});
  const inserted = await ConditionSpecialtyMap.insertMany(INITIAL_CONDITION_MAP);
  return inserted;
}

module.exports = {
  INITIAL_CONDITION_MAP,
  seedConditionSpecialtyMap,
};
