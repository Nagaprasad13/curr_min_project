const { calculateHaversineDistance, STRAIGHT_LINE_NOTICE } = require('../../services/haversineService');

/**
 * Baseline 2: Always Tier 1
 * Recommends verified Tier 1 hospitals sorted strictly by straight-line Haversine distance,
 * under the common naive heuristic that top-tier hospitals are universally appropriate.
 */
function rankAlwaysTier1({ patientLocation }, hospitals = []) {
  const tier1Hospitals = hospitals.filter(h => h.verificationStatus === 'verified' && (h.tier === 'Tier 1' || h.proposedTier === 'Tier 1'));

  const candidates = tier1Hospitals.map(h => {
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
      effectiveTier: 'Tier 1',
      tier: 'Tier 1',
      score: Math.round(Math.max(0, 1 - distanceKm / 400.0) * 1000) / 1000,
      distanceKm,
      distanceNotice: STRAIGHT_LINE_NOTICE,
      capacityState: 'unknown',
      explanation: `Baseline (Always Tier 1): Picked nearest Tier 1 facility (${distanceKm} km). Patient-specific specialty match ignored.`,
    };
  });

  candidates.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    recommendations: candidates.map((c, i) => ({ rank: i + 1, ...c })),
    baselineName: 'alwaysTier1',
  };
}

module.exports = { rankAlwaysTier1 };
