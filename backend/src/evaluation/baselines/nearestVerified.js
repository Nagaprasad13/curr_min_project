const { calculateHaversineDistance, STRAIGHT_LINE_NOTICE } = require('../../services/haversineService');

/**
 * Baseline 1: Nearest Verified
 * Recommends verified hospitals sorted strictly by straight-line Haversine distance,
 * completely ignoring required clinical specialty, equipment, and capacity.
 */
function rankNearestVerified({ patientLocation }, hospitals = []) {
  const verifiedHospitals = hospitals.filter(h => h.verificationStatus === 'verified');

  const candidates = verifiedHospitals.map(h => {
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
      explanation: `Baseline (Nearest Verified): Picked strictly by straight-line distance (${distanceKm} km). Specialty match ignored.`,
    };
  });

  candidates.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    recommendations: candidates.map((c, i) => ({ rank: i + 1, ...c })),
    baselineName: 'nearestVerified',
  };
}

module.exports = { rankNearestVerified };
