/**
 * CareBridge Proposed Hospital Capability Tier Classification Service
 * 
 * NOTE: These capability tiers (Tier 1 advanced, Tier 2 secondary, Tier 3 basic)
 * are proposed research categories for clinical decision support, NOT official
 * statutory or government classifications.
 * 
 * CRITICAL CLINICAL DESIGN PRINCIPLE:
 * A hospital's tier category does NOT imply suitability for a specific patient.
 * Tier represents baseline institutional capability infrastructure.
 * Patient suitability, actual dynamic bed capacity, and real-time specialist
 * availability are evaluated separately by the CareBridge Referral Engine (Phase 3).
 */

const tierRulesConfig = require('../config/tierRules.json');

/**
 * Pure and deterministic function evaluating hospital capability data.
 * 
 * @param {object} hospital Capability data of the hospital
 * @param {boolean} [isVerified=false] Whether the hospital is currently verified
 * @returns {object} Classification result containing proposedTier, rulesMet, rulesMissed, gapToNextTier
 */
function classifyHospitalTier(hospital = {}, isVerified = false) {
  const t1Criteria = tierRulesConfig.rules['Tier 1'].criteria;
  const t1Desc = tierRulesConfig.rules['Tier 1'].descriptions;
  const t2Criteria = tierRulesConfig.rules['Tier 2'].criteria;
  const t2Desc = tierRulesConfig.rules['Tier 2'].descriptions;

  // Extract counts safely with defaults
  const bedCounts = hospital.bedCounts || {};
  const generalBeds = Number(bedCounts.general) || 0;
  const emergencyBeds = Number(bedCounts.emergency) || 0;
  const icuBeds = Number(bedCounts.icu) || 0;
  const totalInpatientBeds = generalBeds + emergencyBeds + icuBeds;

  const equipment = hospital.equipment || {};
  const ventilatorsCount = equipment.ventilators?.available ? (Number(equipment.ventilators.count) || 0) : 0;
  const hasCt = Boolean(equipment.ctScan?.available && (equipment.ctScan.count > 0 || equipment.ctScan.count === undefined));
  const hasMri = Boolean(equipment.mri?.available && (equipment.mri.count > 0 || equipment.mri.count === undefined));
  const hasXray = Boolean(equipment.xray?.available && (equipment.xray.count > 0 || equipment.xray.count === undefined));
  const hasUltrasound = Boolean(equipment.ultrasound?.available && (equipment.ultrasound.count > 0 || equipment.ultrasound.count === undefined));
  const hasLab = Boolean(equipment.lab?.available);
  const otCount = equipment.operationTheatres?.available ? (Number(equipment.operationTheatres.count) || 0) : 0;

  const specialtiesCount = Array.isArray(hospital.specialties) ? hospital.specialties.length : 0;
  const has24x7Emergency = Boolean(hospital.has24x7Emergency);

  // Evaluate Tier 1 Criteria
  const t1Evaluations = [
    { key: 'has24x7Emergency', met: has24x7Emergency, desc: t1Desc.has24x7Emergency, current: has24x7Emergency ? 'Yes' : 'No' },
    { key: 'minIcuBeds', met: icuBeds >= t1Criteria.minIcuBeds, desc: `${t1Desc.minIcuBeds} (Current: ${icuBeds})`, current: icuBeds, target: t1Criteria.minIcuBeds },
    { key: 'minVentilators', met: ventilatorsCount >= t1Criteria.minVentilators, desc: `${t1Desc.minVentilators} (Current: ${ventilatorsCount})`, current: ventilatorsCount, target: t1Criteria.minVentilators },
    { key: 'requiresCt', met: hasCt, desc: t1Desc.requiresCt, current: hasCt ? 'Available' : 'Missing' },
    { key: 'requiresMri', met: hasMri, desc: t1Desc.requiresMri, current: hasMri ? 'Available' : 'Missing' },
    { key: 'requiresLab', met: hasLab, desc: t1Desc.requiresLab, current: hasLab ? 'Available' : 'Missing' },
    { key: 'minOperationTheatres', met: otCount >= t1Criteria.minOperationTheatres, desc: `${t1Desc.minOperationTheatres} (Current: ${otCount})`, current: otCount, target: t1Criteria.minOperationTheatres },
    { key: 'minSpecialties', met: specialtiesCount >= t1Criteria.minSpecialties, desc: `${t1Desc.minSpecialties} (Current: ${specialtiesCount})`, current: specialtiesCount, target: t1Criteria.minSpecialties },
  ];

  const t1Passed = t1Evaluations.every(e => e.met);

  // Evaluate Tier 2 Criteria
  const t2Evaluations = [
    { key: 'minInpatientBeds', met: totalInpatientBeds >= t2Criteria.minInpatientBeds, desc: `${t2Desc.minInpatientBeds} (Current: ${totalInpatientBeds})`, current: totalInpatientBeds, target: t2Criteria.minInpatientBeds },
    { key: 'requiresLab', met: hasLab, desc: t2Desc.requiresLab, current: hasLab ? 'Available' : 'Missing' },
    { key: 'requiresXray', met: hasXray, desc: t2Desc.requiresXray, current: hasXray ? 'Available' : 'Missing' },
    { key: 'requiresUltrasound', met: hasUltrasound, desc: t2Desc.requiresUltrasound, current: hasUltrasound ? 'Available' : 'Missing' },
    { key: 'minOperationTheatres', met: otCount >= t2Criteria.minOperationTheatres, desc: `${t2Desc.minOperationTheatres} (Current: ${otCount})`, current: otCount, target: t2Criteria.minOperationTheatres },
    { key: 'minSpecialties', met: specialtiesCount >= t2Criteria.minSpecialties, desc: `${t2Desc.minSpecialties} (Current: ${specialtiesCount})`, current: specialtiesCount, target: t2Criteria.minSpecialties },
  ];

  const t2Passed = t2Evaluations.every(e => e.met);

  let proposedTier = 'Tier 3';
  let rulesMet = [];
  let rulesMissed = [];
  let gapToNextTier = [];

  if (t1Passed) {
    proposedTier = 'Tier 1';
    rulesMet = t1Evaluations.map(e => e.desc);
    rulesMissed = [];
    gapToNextTier = []; // Already highest capability tier
  } else if (t2Passed) {
    proposedTier = 'Tier 2';
    rulesMet = t2Evaluations.map(e => e.desc);
    rulesMissed = t1Evaluations.filter(e => !e.met).map(e => `[Tier 1 Deficit] ${e.desc}`);
    // Gap to reach Tier 1
    gapToNextTier = t1Evaluations
      .filter(e => !e.met)
      .map(e => `Need to fulfill Tier 1 requirement: ${e.desc}`);
  } else {
    proposedTier = 'Tier 3';
    rulesMet = ['Hospital establishment registered in database'];
    rulesMissed = t2Evaluations.filter(e => !e.met).map(e => `[Tier 2 Deficit] ${e.desc}`);
    // Gap to reach Tier 2
    gapToNextTier = t2Evaluations
      .filter(e => !e.met)
      .map(e => `Need to fulfill Tier 2 requirement: ${e.desc}`);
  }

  // Only a VERIFIED hospital receives an effective tier. Unverified or pending hospitals show "unconfirmed".
  const tierStatus = isVerified ? 'confirmed' : 'unconfirmed';
  const effectiveTier = isVerified ? proposedTier : proposedTier; // Displayed with unconfirmed label if not verified

  return {
    proposedTier,
    effectiveTier,
    tierStatus,
    rulesMet,
    rulesMissed,
    gapToNextTier,
    computedAt: new Date(),
    rulesVersion: tierRulesConfig.version,
    disclaimer: tierRulesConfig.disclaimer,
  };
}

module.exports = {
  classifyHospitalTier,
  tierRulesConfig,
};
