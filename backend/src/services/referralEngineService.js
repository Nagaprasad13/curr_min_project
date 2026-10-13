/**
 * CareBridge Referral Engine Core
 * 
 * Pure, deterministic recommendation algorithm. Zero database calls inside this module.
 * Takes hospitals and capacity snapshots as arguments for full testability and reproducible evaluation.
 * 
 * CORE PRINCIPLES:
 * 1. Verified Clinical Capability First (Hard Filter)
 * 2. Freshness-Aware Capacity (Stale or Missing = Unknown)
 * 3. Straight-line Distance (Haversine)
 * 4. Transparent Multi-Criteria Weighted Ranking
 * 5. Hospital Tier is NOT a ranking input (Tier 2 with specialist outranks Tier 1 without)
 * 6. Decision Support Only (Clinician review required)
 */

const { calculateHaversineDistance, STRAIGHT_LINE_NOTICE } = require('./haversineService');
const { evaluateResourceFreshness } = require('./freshnessService');
const rankingRules = require('../config/rankingRules.json');

const CLINICAL_DECISION_SUPPORT_NOTICE = 'Decision support only. A clinician must review.';

/**
 * Executes the referral engine pipeline.
 * 
 * @param {object} params
 * @param {string} params.requiredSpecialty Medical specialty needed (e.g. 'Cardiology', 'Pulmonology')
 * @param {string} [params.urgency='urgent'] 'emergency' | 'urgent' | 'routine'
 * @param {Array<string>} [params.requiredEquipment=[]] List of equipment keys (e.g. ['ventilators', 'ctScan'])
 * @param {string} [params.requiredBedType='none'] 'general' | 'emergency' | 'icu' | 'none'
 * @param {object} params.patientLocation { latitude: number, longitude: number }
 * @param {string|null} [params.referringHospitalId=null] ID of referring hospital (excluded)
 * @param {string|null} [params.preferredScheme=null] Preferred health scheme (e.g. 'CMCHIS', 'PM-JAY')
 * @param {string} [params.capacityMode='unknown_aware'] 'unknown_aware' (CareBridge) or 'assume_available' (naive baseline)
 * @param {Date} [params.now=new Date()] Evaluation timestamp
 * @param {Array<object>} hospitals Array of hospital objects
 * @param {Map<string, object>|object} capacitySnapshots Map or object mapping hospitalId -> latest capacity snapshot
 * 
 * @returns {object} { recommendations: Array<object>, excludedHospitals: Array<object>, summary: object, notice: string }
 */
function rankReferralHospitals(params = {}, hospitalsArg = null, capacitySnapshotsArg = null) {
  const {
    requiredSpecialty,
    urgency = 'urgent',
    requiredEquipment = [],
    requiredBedType = 'none',
    patientLocation,
    referringHospitalId = null,
    preferredScheme = null,
    capacityMode = 'unknown_aware',
    rankingRulesOverride = null,
    now = new Date(),
  } = params;

  const hospitals = hospitalsArg || params.hospitals || [];
  const capacitySnapshots = capacitySnapshotsArg || params.capacitySnapshots || {};
  const normUrgency = ['emergency', 'urgent', 'routine'].includes(urgency) ? urgency : 'urgent';
  const weights = rankingRules.weightsByUrgency[normUrgency] || rankingRules.weightsByUrgency.urgent;

  if (!patientLocation || patientLocation.latitude === undefined || patientLocation.longitude === undefined) {
    throw new Error('Valid patientLocation { latitude, longitude } is required for referral ranking.');
  }
  if (!requiredSpecialty) {
    throw new Error('requiredSpecialty is required for referral ranking.');
  }

  // Helper to extract latest capacity snapshot for a hospital
  const getSnapshot = (hosp) => {
    const hospId = hosp._id ? hosp._id.toString() : hosp.code;
    if (capacitySnapshots instanceof Map) {
      return capacitySnapshots.get(hospId) || capacitySnapshots.get(hosp.code) || null;
    }
    return capacitySnapshots[hospId] || capacitySnapshots[hosp.code] || null;
  };

  const eligibleCandidates = [];
  const excludedHospitals = [];

  // =========================================================================
  // STEP 1: HARD FILTERS
  // =========================================================================
  for (const hosp of hospitals) {
    const hospId = hosp._id ? hosp._id.toString() : (hosp.id || hosp.code);
    const hospName = hosp.name || hosp.code;

    // Filter 1.1: Verification Status must be 'verified'
    if (hosp.verificationStatus !== 'verified') {
      excludedHospitals.push({
        hospitalId: hospId,
        hospitalName: hospName,
        reason: `Hospital verification status is "${hosp.verificationStatus || 'unverified'}". Only verified facilities are referable.`,
        filterCode: 'NOT_VERIFIED',
      });
      continue;
    }

    // Filter 1.2: Referring hospital is strictly excluded
    if (referringHospitalId && (referringHospitalId.toString() === hospId || referringHospitalId.toString() === hosp.code)) {
      excludedHospitals.push({
        hospitalId: hospId,
        hospitalName: hospName,
        reason: 'Hospital is the originating referring facility.',
        filterCode: 'ORIGINATING_FACILITY',
      });
      continue;
    }

    // Filter 1.3: Required specialty with specialist count > 0
    const specialties = hosp.specialties || [];
    if (!specialties.includes(requiredSpecialty)) {
      excludedHospitals.push({
        hospitalId: hospId,
        hospitalName: hospName,
        reason: `Lacks required specialty: ${requiredSpecialty}`,
        filterCode: 'MISSING_SPECIALTY',
      });
      continue;
    }

    const specialistInfo = (hosp.specialists || []).find(s => s.specialty === requiredSpecialty);
    const specialistCount = specialistInfo ? Number(specialistInfo.count) : 0;
    if (specialistCount <= 0) {
      excludedHospitals.push({
        hospitalId: hospId,
        hospitalName: hospName,
        reason: `No active verified specialist practitioner available for ${requiredSpecialty}.`,
        filterCode: 'NO_SPECIALIST_COUNT',
      });
      continue;
    }

    // Filter 1.4: Required equipment check
    const equipment = hosp.equipment || {};
    let missingEquipment = null;
    for (const eqKey of requiredEquipment) {
      if (eqKey === 'bloodBank') {
        if (!equipment.bloodBank || !equipment.bloodBank.available) {
          missingEquipment = 'bloodBank';
          break;
        }
      } else {
        const eq = equipment[eqKey];
        if (!eq || !eq.available || (eq.count !== undefined && eq.count <= 0)) {
          missingEquipment = eqKey;
          break;
        }
      }
    }
    if (missingEquipment) {
      excludedHospitals.push({
        hospitalId: hospId,
        hospitalName: hospName,
        reason: `Lacks required clinical equipment: ${missingEquipment}`,
        filterCode: 'MISSING_EQUIPMENT',
      });
      continue;
    }

    // Filter 1.5: 24x7 Emergency service required for emergency urgency
    if (normUrgency === 'emergency' && !hosp.has24x7Emergency) {
      excludedHospitals.push({
        hospitalId: hospId,
        hospitalName: hospName,
        reason: 'Emergency urgency requires verified 24x7 Emergency Medical Service.',
        filterCode: 'NO_24X7_EMERGENCY',
      });
      continue;
    }

    // Filter 1.6: Required bed type not freshly reported "unavailable"
    const snapshot = getSnapshot(hosp);
    if (requiredBedType && requiredBedType !== 'none') {
      const bedFreshness = evaluateResourceFreshness(snapshot, requiredBedType, normUrgency, capacityMode, now);
      // If freshly reported as 'unavailable', exclude (do not divert patients to full beds)
      if (bedFreshness.freshnessStatus === 'fresh' && bedFreshness.reportedState === 'unavailable') {
        excludedHospitals.push({
          hospitalId: hospId,
          hospitalName: hospName,
          reason: `Designated bed type (${requiredBedType}) is confirmed unavailable via fresh telemetry (${bedFreshness.ageLabel}).`,
          filterCode: 'BED_FRESHLY_UNAVAILABLE',
        });
        continue;
      }
    }

    // Hospital passed all hard filters!
    eligibleCandidates.push({ hosp, snapshot, specialistInfo, specialistCount });
  }

  // =========================================================================
  // STEP 2 & 3: FRESHNESS EVALUATION & HAVERSINE DISTANCE
  // =========================================================================
  const scoredCandidates = eligibleCandidates.map(({ hosp, snapshot, specialistInfo, specialistCount }) => {
    const hospId = hosp._id ? hosp._id.toString() : (hosp.id || hosp.code);

    // Evaluate capacity freshness for primary required bed or general intake
    const targetResource = (requiredBedType && requiredBedType !== 'none') ? requiredBedType : 'icu';
    const capacityEval = evaluateResourceFreshness(snapshot, targetResource, normUrgency, capacityMode, now);

    // Haversine straight-line distance
    const hospLat = hosp.location?.latitude || hosp.location?.lat;
    const hospLon = hosp.location?.longitude || hosp.location?.lng;
    const distanceKm = calculateHaversineDistance(
      patientLocation.latitude,
      patientLocation.longitude,
      hospLat,
      hospLon
    );

    // =========================================================================
    // STEP 4: TRANSPARENT MULTI-CRITERIA SCORING
    // =========================================================================

    // Criterion 1: Clinical Suitability Score [0.85 to 1.0]
    // All required capabilities are verified (base = 0.85)
    let clinicalSuitabilityScore = 0.85;
    if (specialistCount >= 2) {
      clinicalSuitabilityScore += 0.08; // Multi-specialist depth
    }
    if (specialistInfo && specialistInfo.onCall24x7) {
      clinicalSuitabilityScore += 0.07; // Dedicated 24x7 on-call coverage
    }
    clinicalSuitabilityScore = Math.min(1.0, clinicalSuitabilityScore);

    // Criterion 2: Capacity Score [0.0, 0.3, 1.0]
    // Available = 1.0, Unknown = 0.3, Unavailable = 0.0
    const capacityScore = rankingRules.capacityScores[capacityEval.effectiveState] !== undefined
      ? rankingRules.capacityScores[capacityEval.effectiveState]
      : rankingRules.capacityScores.unknown;

    // Criterion 3: Distance Score [0.0 to 1.0]
    // Inverted normalised distance up to max cutoff (default 400 km)
    const maxDist = rankingRules.maxDistanceCutoffKm || 400.0;
    const distanceScore = Math.max(0.0, Math.min(1.0, 1.0 - (distanceKm / maxDist)));

    // Scheme Participation Tie-Breaker
    let schemeMatched = false;
    let schemeTieBreakerScore = 0.0;
    if (preferredScheme && Array.isArray(hosp.schemeParticipation)) {
      schemeMatched = hosp.schemeParticipation.some(sp => sp.schemeCode === preferredScheme && sp.empaneled);
      if (schemeMatched) {
        schemeTieBreakerScore = rankingRules.schemeTieBreakerBonus || 0.02;
      }
    }

    // Total Weighted Score
    const totalScore =
      weights.clinicalSuitability * clinicalSuitabilityScore +
      weights.capacity * capacityScore +
      weights.distance * distanceScore +
      schemeTieBreakerScore;

    const roundedTotalScore = Math.round(totalScore * 10000) / 10000;

    // Flags & Explanation
    const flags = [];
    if (capacityEval.effectiveState === 'unknown') {
      flags.push('Capacity unknown: confirm bed and specialist availability by telephone prior to transfer dispatch.');
    }
    if (capacityEval.isStale && capacityMode === 'assume_available') {
      flags.push('WARNING: Naive evaluation mode active (stale telemetry assumed available).');
    }
    if (capacityEval.isStale && capacityMode === 'trust_last_reported') {
      flags.push('WARNING: Historical mode active (stale telemetry trusted directly without freshness check).');
    }
    if (distanceKm > 100.0) {
      flags.push(`Long-distance transit: ${distanceKm} km straight-line distance.`);
    }

    const matchedCapabilities = [
      `${requiredSpecialty} (${specialistCount} specialist${specialistCount > 1 ? 's' : ''}${specialistInfo?.onCall24x7 ? ', 24x7 on-call' : ''})`,
      ...requiredEquipment,
    ];

    // Transparent Clinical Explanation
    const explanationParts = [
      `Verified ${hosp.tier || hosp.proposedTier}.`,
      `Has ${requiredSpecialty} (${specialistCount} specialist${specialistCount > 1 ? 's' : ''}${specialistInfo?.onCall24x7 ? ', 24x7 on-call' : ''}).`,
      `${targetResource.toUpperCase()} capacity is ${capacityEval.effectiveState} (${capacityEval.ageLabel}).`,
      `${distanceKm} km straight-line distance (${STRAIGHT_LINE_NOTICE}).`,
    ];
    if (schemeMatched) {
      explanationParts.push(`Empaneled under ${preferredScheme} (potential match, verify eligibility).`);
    }

    return {
      hospitalId: hospId,
      name: hosp.name,
      code: hosp.code,
      district: hosp.district,
      verificationStatus: hosp.verificationStatus,
      effectiveTier: hosp.verificationStatus === 'verified' ? (hosp.tier || hosp.proposedTier) : `${hosp.proposedTier || 'Tier 3'} (unconfirmed)`,
      tier: hosp.tier || hosp.proposedTier,
      score: roundedTotalScore,
      totalScore: roundedTotalScore,
      scoreBreakdown: {
        clinicalSuitability: Math.round(clinicalSuitabilityScore * 1000) / 1000,
        clinicalSuitabilityWeighted: Math.round(weights.clinicalSuitability * clinicalSuitabilityScore * 1000) / 1000,
        capacity: capacityScore,
        capacityWeighted: Math.round(weights.capacity * capacityScore * 1000) / 1000,
        distance: Math.round(distanceScore * 1000) / 1000,
        distanceWeighted: Math.round(weights.distance * distanceScore * 1000) / 1000,
        schemeTieBreaker: schemeTieBreakerScore,
        weightsUsed: weights,
      },
      distanceKm,
      distanceNotice: STRAIGHT_LINE_NOTICE,
      capacityState: capacityEval.effectiveState,
      capacityReportedState: capacityEval.reportedState,
      capacityAgeMinutes: capacityEval.ageMinutes,
      capacityAgeLabel: capacityEval.ageLabel,
      isCapacityStale: capacityEval.isStale,
      matchedCapabilities,
      flags,
      schemeParticipation: hosp.schemeParticipation || [],
      schemeMatched,
      explanation: explanationParts.join(' '),
    };
  });

  // =========================================================================
  // STEP 5: DETERMINISTIC SORTING & TIE BREAKING
  // =========================================================================
  scoredCandidates.sort((a, b) => {
    // 1. Higher total score
    if (Math.abs(b.score - a.score) > 0.0001) {
      return b.score - a.score;
    }
    // 2. Shorter distance
    if (Math.abs(a.distanceKm - b.distanceKm) > 0.01) {
      return a.distanceKm - b.distanceKm;
    }
    // 3. Deterministic hospital ID / Code collation
    return String(a.hospitalId).localeCompare(String(b.hospitalId));
  });

  // Assign ranks
  const rankedRecommendations = scoredCandidates.map((cand, index) => ({
    rank: index + 1,
    ...cand,
  }));

  return {
    recommendations: rankedRecommendations,
    excludedHospitals,
    summary: {
      totalHospitalsEvaluated: hospitals.length,
      eligibleCount: rankedRecommendations.length,
      excludedCount: excludedHospitals.length,
      capacityMode,
      urgency: normUrgency,
      requiredSpecialty,
      requiredEquipment,
      requiredBedType,
      evaluationTimestamp: now,
    },
    decisionSupportNotice: CLINICAL_DECISION_SUPPORT_NOTICE,
  };
}

module.exports = {
  rankReferralHospitals,
  CLINICAL_DECISION_SUPPORT_NOTICE,
};
