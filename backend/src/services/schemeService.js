const Scheme = require('../models/Scheme');
const Hospital = require('../models/Hospital');
const { recordAuditLog } = require('./auditService');
const consentConfig = require('../config/consentConfig.json');

const MANDATORY_NOTICE = 'This is a possible match only, not confirmed eligibility. Eligibility, coverage and hospital participation must be confirmed with the scheme authority or the hospital. Coverage or free treatment is never guaranteed.';

// Prohibited terms check: ensure matching results NEVER state definitive approval
const FORBIDDEN_WORDS = [
  /\beligible\b/i,
  /\bcovered\b/i,
  /\bfree\b/i,
  /\bapproved\b/i,
];

/**
 * Validates that an output string or payload contains none of the forbidden phrases.
 * @param {string|object} data
 * @throws {Error} if forbidden phrase is detected
 */
function assertNoForbiddenPhrases(data) {
  let text = typeof data === 'string' ? data : JSON.stringify(data);
  // Exclude the mandatory notice disclaimer itself so its protective wording is not flagged
  text = text.split(MANDATORY_NOTICE).join('');
  for (const regex of FORBIDDEN_WORDS) {
    if (regex.test(text)) {
      throw new Error(`Forbidden phrase violation: match payload contains prohibited word "${regex}". Research safety policy prohibits guarantees.`);
    }
  }
}

/**
 * Checks for schemes with lastVerifiedDate older than threshold and flags them as outdated.
 */
async function flagOutdatedSchemes(maxAgeDays = consentConfig.schemeVerificationMaxAgeDays) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const result = await Scheme.updateMany(
    {
      status: 'verified',
      lastVerifiedDate: { $lt: cutoff },
    },
    {
      $set: { status: 'outdated' },
    }
  );
  return result;
}

/**
 * Transparent, rule-based matching for government schemes.
 * Collects minimum required inputs and avoids assumptions or guessing.
 * 
 * @param {object} params
 * @param {object} params.inputs - Minimal input parameters
 * @param {object} params.actor - Requesting user (patient or doctor)
 * @param {string} params.targetPatientId - Patient ID
 * @param {string} [params.clinicalPurpose] - Clinician stated purpose
 * @param {string} [params.ipAddress] - IP address for audit
 * @returns {Promise<Array<object>>} Array of scheme evaluation results
 */
async function evaluateSchemePotentialMatches({
  inputs = {},
  actor,
  targetPatientId = null,
  clinicalPurpose = 'Patient self-inquiry for welfare schemes',
  ipAddress = '127.0.0.1',
  userAgent = '',
}) {
  const schemes = await Scheme.find().lean();
  const evaluationResults = [];

  const {
    stateResident = null,         // boolean (e.g. true if Tamil Nadu resident)
    annualFamilyIncome = null,    // number (in INR)
    rationCardType = null,        // string ('PHH', 'AAY', 'NPHH', 'BPL', 'none', null)
    age = null,                   // number
    treatmentCategory = null,     // string (e.g. 'Cardiology', 'Oncology', etc.)
    hasLifeThreateningIllness = null, // boolean
    treatmentHospitalType = null, // 'government' | 'private' | null
  } = inputs;

  for (const scheme of schemes) {
    let matchStatus = 'cannot determine';
    const criteriaChecked = [];
    const criteriaToVerify = [];

    if (scheme.schemeId === 'CMCHIS') {
      // CMCHIS Criteria:
      // 1. Resident of Tamil Nadu
      // 2. Annual family income <= 1,20,000 INR or eligible ration card
      // 3. Treatment at empaneled hospital in Tamil Nadu

      let stateCheck = null;
      if (stateResident === null || stateResident === undefined) {
        criteriaToVerify.push('Tamil Nadu state residency verification (Aadhaar / Smart Ration Card)');
      } else if (stateResident === true) {
        stateCheck = true;
        criteriaChecked.push('Tamil Nadu residency declared');
      } else {
        stateCheck = false;
        criteriaChecked.push('Non-Tamil Nadu residency (outside state mandate)');
      }

      let incomeCheck = null;
      if (annualFamilyIncome === null || annualFamilyIncome === undefined) {
        criteriaToVerify.push('Annual family income certificate verification (official threshold < ₹1,20,000)');
      } else if (annualFamilyIncome <= 120000) {
        incomeCheck = true;
        criteriaChecked.push('Annual family income within ₹1,20,000 limit');
      } else {
        incomeCheck = false;
        criteriaChecked.push('Annual family income exceeds ₹1,20,000 limit');
      }

      if (stateCheck === false || incomeCheck === false) {
        matchStatus = 'unlikely';
      } else if (stateCheck === true && incomeCheck === true) {
        matchStatus = 'potential match';
      } else {
        matchStatus = 'cannot determine';
      }

    } else if (scheme.schemeId === 'PM-JAY') {
      // PM-JAY Criteria:
      // 1. SECC 2011 deprivation category / BPL or Senior Citizen (age >= 70)
      // 2. Secondary/Tertiary hospitalization

      let categoryCheck = null;
      let ageCheck = null;

      if (age !== null && age !== undefined && age >= 70) {
        ageCheck = true;
        criteriaChecked.push('Senior citizen criteria (70+ years expanded provision)');
      }

      if (rationCardType === null || rationCardType === undefined) {
        criteriaToVerify.push('SECC 2011 listing or Priority Household / BPL card status verification at Ayushman Mitra kiosk');
      } else if (['PHH', 'AAY', 'BPL'].includes(String(rationCardType).toUpperCase())) {
        categoryCheck = true;
        criteriaChecked.push(`Ration card category (${rationCardType}) aligns with vulnerable group criteria`);
      } else {
        categoryCheck = false;
        criteriaChecked.push(`Ration card category (${rationCardType}) does not meet standard deprivation criteria`);
      }

      if (ageCheck === true || categoryCheck === true) {
        matchStatus = 'potential match';
      } else if (categoryCheck === false && ageCheck !== true && (age !== null && age < 70)) {
        matchStatus = 'unlikely';
      } else {
        matchStatus = 'cannot determine';
      }

    } else if (scheme.schemeId === 'RAN') {
      // RAN Criteria:
      // 1. Below Poverty Line (BPL)
      // 2. Major life-threatening illness
      // 3. Treatment at Government super-speciality hospital / RCC (NOT private)

      let bplCheck = null;
      let illnessCheck = null;
      let hospTypeCheck = null;

      if (rationCardType === null || rationCardType === undefined) {
        criteriaToVerify.push('Below Poverty Line (BPL) income certificate verification');
      } else if (['BPL', 'AAY'].includes(String(rationCardType).toUpperCase())) {
        bplCheck = true;
        criteriaChecked.push('BPL status indicated by card type');
      } else {
        bplCheck = false;
        criteriaChecked.push('Non-BPL card type indicated');
      }

      if (hasLifeThreateningIllness === null || hasLifeThreateningIllness === undefined) {
        criteriaToVerify.push('Attending physician certification of life-threatening condition (cardiac, cancer, renal)');
      } else if (hasLifeThreateningIllness === true) {
        illnessCheck = true;
        criteriaChecked.push('Life-threatening condition declared by clinician');
      } else {
        illnessCheck = false;
        criteriaChecked.push('Condition not categorized as major life-threatening illness');
      }

      if (treatmentHospitalType === 'private') {
        hospTypeCheck = false;
        criteriaChecked.push('Treatment sought at private facility (RAN assistance restricted to Government institutions only)');
      } else if (treatmentHospitalType === 'government') {
        hospTypeCheck = true;
        criteriaChecked.push('Treatment sought at participating Government institution');
      } else {
        criteriaToVerify.push('Hospital verification: must be a participating Government hospital or Regional Cancer Centre');
      }

      if (hospTypeCheck === false || bplCheck === false || illnessCheck === false) {
        matchStatus = 'unlikely';
      } else if (bplCheck === true && illnessCheck === true && hospTypeCheck === true) {
        matchStatus = 'potential match';
      } else {
        matchStatus = 'cannot determine';
      }

    } else {
      // Generic fallback for additional custom scheme
      matchStatus = 'cannot determine';
      criteriaToVerify.push('Scheme rules require manual case-by-case verification with scheme desk');
    }

    const schemeResult = {
      schemeId: scheme.schemeId,
      schemeName: scheme.name,
      matchStatus,
      criteriaChecked,
      criteriaToVerify,
      requiredDocuments: scheme.requiredDocuments || [],
      participatingHospitalNote: 'hospital-reported, verify with scheme',
      officialLink: scheme.officialApplicationUrl || scheme.officialUrl,
      lastVerifiedDate: scheme.lastVerifiedDate,
      status: scheme.status,
      notice: MANDATORY_NOTICE,
    };

    evaluationResults.push(schemeResult);
  }

  // Audit log match request WITHOUT storing sensitive patient inputs
  await recordAuditLog({
    actorId: actor._id,
    actorRole: actor.role,
    action: 'MATCH_SCHEME',
    resourceType: 'Scheme',
    resourceId: 'CATALOGUE',
    patientId: targetPatientId || (actor.role === 'patient' ? actor._id : undefined),
    hospitalId: actor.hospitalId,
    accessGranted: true,
    justification: clinicalPurpose,
    ipAddress,
    userAgent,
    meta: {
      schemesEvaluated: evaluationResults.length,
      potentialMatchesCount: evaluationResults.filter(r => r.matchStatus === 'potential match').length,
      cannotDetermineCount: evaluationResults.filter(r => r.matchStatus === 'cannot determine').length,
      unlikelyCount: evaluationResults.filter(r => r.matchStatus === 'unlikely').length,
    },
  });

  return evaluationResults;
}

module.exports = {
  MANDATORY_NOTICE,
  FORBIDDEN_WORDS,
  assertNoForbiddenPhrases,
  flagOutdatedSchemes,
  evaluateSchemePotentialMatches,
};
