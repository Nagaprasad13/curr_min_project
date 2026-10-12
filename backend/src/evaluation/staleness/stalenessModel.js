/**
 * CareBridge Staleness and Telemetry Drift Simulation Model
 * 
 * Generates observed capacity telemetry snapshots from the hidden TRUE network state
 * across controlled staleness levels, reporting mechanisms, and drift probabilities.
 * 
 * DETERMINISTIC & REPRODUCIBLE:
 * Pure function parameterized by a pseudo-random seed.
 */

const freshnessConfig = require('../../config/freshness.json');

/**
 * High-quality deterministic 32-bit PRNG (Mulberry32).
 * @param {number} seed 
 * @returns {() => number} Returns float in [0, 1)
 */
function createMulberry32(seed) {
  let a = (seed ^ 0x6D2B79F5) >>> 0;
  return function () {
    let t = (a += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates an observed snapshot from true network state with optional drift and aging.
 */
function buildHospitalSnapshot({
  hospId,
  trueState,
  bedType = 'icu',
  isAged = false,
  isDrifted = false,
  ageMinutes = 15,
  now = new Date(),
}) {
  const reportedAt = new Date(now.getTime() - ageMinutes * 60 * 1000);

  // Determine reported bed availability
  let reportedBedAvailable = trueState ? trueState.hasBedCapacity : false;
  let reportedCount = trueState ? trueState.availableBedCount : 0;

  if (isAged && isDrifted) {
    // DRIFT: True state has changed since the snapshot was filed!
    // If true state is unavailable, the old report claimed it was available.
    // If true state is available, the old report claimed it was unavailable.
    reportedBedAvailable = !reportedBedAvailable;
    reportedCount = reportedBedAvailable ? 3 : 0;
  }

  const reportedStatus = reportedBedAvailable ? 'available' : 'unavailable';

  return {
    hospitalId: hospId,
    timestamp: reportedAt,
    reportedAt: reportedAt,
    ageMinutesSimulated: ageMinutes,
    isAged,
    isDrifted,
    beds: {
      [bedType]: {
        available: reportedCount,
        total: 20,
        occupied: 20 - reportedCount,
        reportedStatus,
      },
      icu: {
        available: reportedCount,
        total: 20,
        occupied: 20 - reportedCount,
        reportedStatus,
      },
      emergency: {
        available: reportedCount,
        total: 15,
        occupied: 15 - reportedCount,
        reportedStatus,
      },
      general: {
        available: reportedCount,
        total: 50,
        occupied: 50 - reportedCount,
        reportedStatus,
      },
      ventilators: {
        available: reportedCount,
        total: 10,
        occupied: 10 - reportedCount,
        reportedStatus,
      },
    },
    services: {
      emergencyDepartment: {
        reportedStatus: trueState?.emergencyDepartmentOpen ? 'available' : 'unavailable',
        diversionActive: !trueState?.emergencyDepartmentOpen,
      },
      ctScan: { reportedStatus: 'available' },
      mri: { reportedStatus: 'available' },
      operatingTheatre: { reportedStatus: 'available' },
    },
  };
}

/**
 * Simulates staleness and telemetry drift over a set of hospitals and true network state.
 * 
 * @param {object} params
 * @param {Array<object>} params.hospitals Array of hospital objects (e.g. 40 facilities)
 * @param {object} params.scenario Referral scenario with trueNetworkState and inputs
 * @param {number} params.stalenessLevel Fraction of hospitals that are stale: 0.0 to 0.5 (0% to 50%)
 * @param {string} [params.mechanism='mixed'] 'aged' | 'missing' | 'mixed'
 * @param {number} [params.pDrift=0.3] Probability of state drift for aged reports (0.0 to 1.0)
 * @param {number} [params.seed=42] Pseudo-random generator seed
 * @param {boolean} [params.isBiased=false] If true, smaller Tier 3 facilities are stale more often
 * @param {Date} [params.now=new Date()] Reference timestamp
 * @returns {object} { observedSnapshots, staleHospitalIds, metrics }
 */
function simulateStaleness({
  hospitals,
  scenario,
  stalenessLevel = 0.0,
  mechanism = 'mixed',
  pDrift = 0.3,
  seed = 42,
  isBiased = false,
  now = new Date(),
}) {
  const urgency = scenario.inputs?.urgency || scenario.urgency || 'urgent';
  const bedType = scenario.inputs?.requiredBedType || scenario.requiredBedType || 'icu';
  const trueNetworkState = scenario.trueNetworkState || {};

  // Maximum allowed telemetry freshness threshold in minutes
  const maxAgeMinutes = freshnessConfig.maxAgeMinutes[urgency] || freshnessConfig.maxAgeMinutes.urgent;

  // Sanity check: At staleness 0, observed snapshots strictly reflect the true state (freshly reported)
  if (stalenessLevel === 0) {
    const observedSnapshots = {};
    for (const hosp of hospitals) {
      const hospId = hosp._id ? hosp._id.toString() : hosp.code;
      const trueState = trueNetworkState[hospId];
      observedSnapshots[hospId] = buildHospitalSnapshot({
        hospId,
        trueState,
        bedType,
        isAged: false,
        isDrifted: false,
        ageMinutes: 15, // Fresh (15m old)
        now,
      });
    }

    return {
      observedSnapshots,
      staleHospitalIds: [],
      staleCount: 0,
      agedCount: 0,
      missingCount: 0,
      driftedCount: 0,
      stalenessFraction: 0,
    };
  }

  // Deterministic PRNG seeded by combination of master seed and scenario ID
  const scenarioNumericId = typeof scenario.scenarioId === 'number'
    ? scenario.scenarioId
    : (parseInt(String(scenario.scenarioId || '').replace(/\D/g, ''), 10) || 1);
  const combinedSeed = (seed * 1000003 + scenarioNumericId * 37) >>> 0;
  const rand = createMulberry32(combinedSeed);

  const totalHospitals = hospitals.length;
  const targetStaleCount = Math.round(totalHospitals * stalenessLevel);

  // Compute selection weights for each hospital
  const weightedList = hospitals.map(h => {
    const hospId = h._id ? h._id.toString() : h.code;
    let weight = 1.0;
    if (isBiased) {
      const tier = h.tier || h.proposedTier || 'Tier 2';
      if (tier === 'Tier 3') weight = 3.0;     // Smaller facilities report less frequently
      else if (tier === 'Tier 2') weight = 1.5;
      else if (tier === 'Tier 1') weight = 0.5; // Major quaternary hubs report more reliably
    }
    return { hosp: h, hospId, weight };
  });

  // Seeded weighted sampling without replacement of targetStaleCount hospitals
  const remaining = [...weightedList];
  const selectedStale = [];

  while (selectedStale.length < targetStaleCount && remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, item) => sum + item.weight, 0);
    let r = rand() * totalWeight;
    let chosenIndex = 0;
    for (let i = 0; i < remaining.length; i++) {
      r -= remaining[i].weight;
      if (r <= 0) {
        chosenIndex = i;
        break;
      }
    }
    selectedStale.push(remaining[chosenIndex]);
    remaining.splice(chosenIndex, 1);
  }

  const staleHospitalIds = new Set(selectedStale.map(s => s.hospId));

  // Partition stale hospitals into aged and missing based on mechanism
  // Mechanism:
  // - 'aged': all stale are aged
  // - 'missing': all stale are missing
  // - 'mixed': half aged, half missing
  let agedSet = new Set();
  let missingSet = new Set();

  if (mechanism === 'aged') {
    agedSet = staleHospitalIds;
  } else if (mechanism === 'missing') {
    missingSet = staleHospitalIds;
  } else {
    // 'mixed': half aged, half missing
    const staleArray = Array.from(staleHospitalIds);
    const halfCount = Math.floor(staleArray.length / 2);
    for (let i = 0; i < staleArray.length; i++) {
      if (i < halfCount) {
        agedSet.add(staleArray[i]);
      } else {
        missingSet.add(staleArray[i]);
      }
    }
  }

  const observedSnapshots = {};
  let driftedCount = 0;
  let agedCount = 0;
  let missingCount = 0;

  for (const hosp of hospitals) {
    const hospId = hosp._id ? hosp._id.toString() : hosp.code;
    const trueState = trueNetworkState[hospId];

    if (missingSet.has(hospId)) {
      // MECHANISM B: Missing telemetry (hospital has never reported or network severed)
      observedSnapshots[hospId] = null;
      missingCount++;
    } else if (agedSet.has(hospId)) {
      // MECHANISM A: Aged telemetry
      // Telemetry age strictly exceeds the urgency threshold
      const excessMinutes = 30 + Math.floor(rand() * 180); // 30m to 210m beyond threshold
      const ageMinutes = maxAgeMinutes + excessMinutes;

      // DRIFT CHECK: Did true network state drift from historical reported value?
      const isDrifted = pDrift > 0 && rand() < pDrift;
      if (isDrifted) driftedCount++;
      agedCount++;

      observedSnapshots[hospId] = buildHospitalSnapshot({
        hospId,
        trueState,
        bedType,
        isAged: true,
        isDrifted,
        ageMinutes,
        now,
      });
    } else {
      // Fresh telemetry (compliant hospital)
      observedSnapshots[hospId] = buildHospitalSnapshot({
        hospId,
        trueState,
        bedType,
        isAged: false,
        isDrifted: false,
        ageMinutes: 15, // Fresh: 15m old
        now,
      });
    }
  }

  return {
    observedSnapshots,
    staleHospitalIds: Array.from(staleHospitalIds),
    staleCount: staleHospitalIds.size,
    agedCount,
    missingCount,
    driftedCount,
    stalenessFraction: totalHospitals > 0 ? staleHospitalIds.size / totalHospitals : 0,
  };
}

module.exports = {
  simulateStaleness,
  buildHospitalSnapshot,
  createMulberry32,
};
