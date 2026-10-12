const { calculateHaversineDistance, STRAIGHT_LINE_NOTICE } = require('../../services/haversineService');

/**
 * Deterministic pseudo-random number generator for reproducible baseline shuffling.
 */
function createSeededRandom(seed = 987654321) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Baseline 3: Random Eligible
 * Recommends a randomly selected hospital that meets verified status, specialty, and equipment,
 * ignoring capacity, distance optimization, and clinical depth.
 */
function rankRandomEligible(
  { requiredSpecialty, requiredEquipment = [], patientLocation, randomSeed = 42 },
  hospitals = []
) {
  const rand = createSeededRandom(randomSeed);

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
      randomWeight: rand(),
      distanceKm,
      distanceNotice: STRAIGHT_LINE_NOTICE,
      capacityState: 'unknown',
      explanation: `Baseline (Random Eligible): Selected randomly from eligible capability pool.`,
    };
  });

  // Sort randomly
  candidates.sort((a, b) => a.randomWeight - b.randomWeight);

  return {
    recommendations: candidates.map((c, i) => ({ rank: i + 1, ...c })),
    baselineName: 'randomEligible',
  };
}

module.exports = { rankRandomEligible };
