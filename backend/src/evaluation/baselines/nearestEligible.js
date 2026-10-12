const { calculateHaversineDistance, STRAIGHT_LINE_NOTICE } = require('../../services/haversineService');

/**
 * Baseline 4: Nearest Eligible
 * Passes all capability hard filters (verified, specialty, equipment),
 * but ranks strictly by minimum straight-line distance, completely ignoring
 * capacity telemetry and clinical depth scoring.
 * 
 * RESEARCH PURPOSE:
 * This strong baseline isolates the specific value of CareBridge's multi-criteria
 * capacity-aware and freshness-aware ranking.
 */
function rankNearestEligible(
  { requiredSpecialty, requiredEquipment = [], patientLocation },
  hospitals = []
) {
  const eligibleHospitals = hospitals.filter(h => {
    if (h.verificationStatus !== 'verified') return false;
    if (!(h.specialties || []).includes(requiredSpecialty)) return false;

    const equipment = h.equipment || {};
    for (const eqKey of requiredEquipment) {
      if (eqKey === 'bloodBank') {
        if (!equipment.bloodBank || !equipment.bloodBank.available) return false;
      } else {
        const eq = equipment[eqKey];
        if (!eq || !eq.available || (eq.count !== undefined && eq.count <= 0)) return false;
      }
    }
    return true;
  });

  const candidates = eligibleHospitals.map(h => {
    const hospId = h._id ? h._id.toString() : (h.id || h.code);
    const distanceKm = calculateHaversineDistance(
      patientLocation.latitude,
      patientLocation.longitude,
      h.location?.latitude || h.location?.lat,
      h.location?.longitude || h.location?.lng
    );

    return {
      hospitalId: hospId,
      name: h.name,
      code: h.code,
      district: h.district,
      verificationStatus: h.verificationStatus,
      effectiveTier: h.tier,
      tier: h.tier,
      score: Math.round(Math.max(0, 1 - distanceKm / 400.0) * 1000) / 1000,
      distanceKm,
      distanceNotice: STRAIGHT_LINE_NOTICE,
      capacityState: 'unknown',
      explanation: `Baseline (Nearest Eligible): Capability verified, sorted purely by minimum distance (${distanceKm} km). Capacity ignored.`,
    };
  });

  candidates.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    recommendations: candidates.map((c, i) => ({ rank: i + 1, ...c })),
    baselineName: 'nearestEligible',
  };
}

module.exports = { rankNearestEligible };
