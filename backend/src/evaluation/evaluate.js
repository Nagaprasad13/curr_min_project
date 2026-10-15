/**
 * CareBridge Benchmark Evaluation Script
 * 
 * Evaluates the CareBridge Freshness-Aware Referral Engine against four baseline methods
 * across 500 synthetic referral scenarios at 0% staleness:
 * 1. CareBridge Referral Engine (Pure Multi-Criteria Freshness-Aware Ranker)
 * 2. Nearest Verified Baseline (Distance-only among verified)
 * 3. Always Tier 1 Baseline (Nearest tertiary center)
 * 4. Nearest Eligible Baseline (Capability-matched, distance-only)
 * 5. Random Eligible Baseline (Random capability-matched selection)
 * 
 * Reports standard health-informatics metrics:
 * - Capability-match rate (Top-1)
 * - Suitable rate (Top-1: capability AND true real-time bed capacity)
 * - Top-3 hit rate
 * - Mean Reciprocal Rank (MRR)
 * - False-available rate (recommended hospital actually had no beds)
 * - No-result rate & mean straight-line distance
 * - Median query latency (ms)
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const Practitioner = require('../models/Practitioner');
const {
  generateSyntheticHospitals,
  generateSyntheticPractitioners,
} = require('../scripts/syntheticDataGenerator');
const { generateEvaluationScenarios } = require('./scenarioGenerator');
const { rankReferralHospitals } = require('../services/referralEngineService');
const { rankNearestVerified } = require('./baselines/nearestVerified');
const { rankAlwaysTier1 } = require('./baselines/alwaysTier1');
const { rankNearestEligible } = require('./baselines/nearestEligible');
const { rankRandomEligible } = require('./baselines/randomEligible');

/**
 * Checks whether a hospital strictly satisfies capability criteria.
 */
function checkHospitalCapabilityMatch(hospital, scenario) {
  if (!hospital || hospital.verificationStatus !== 'verified') return false;
  if (!(hospital.specialties || []).includes(scenario.requiredSpecialty)) return false;

  const equipment = hospital.equipment || {};
  for (const eqKey of scenario.requiredEquipment) {
    if (eqKey === 'bloodBank') {
      if (!equipment.bloodBank || !equipment.bloodBank.available) return false;
    } else {
      const eq = equipment[eqKey];
      if (!eq || !eq.available || (eq.count !== undefined && eq.count <= 0)) return false;
    }
  }

  if (scenario.urgency === 'emergency' && !hospital.has24x7Emergency) return false;
  return true;
}

/**
 * Evaluates a single ranking algorithm across all scenarios.
 */
function evaluateMethod(name, runFn, scenarios, hospitals) {
  const hospitalMap = new Map();
  hospitals.forEach(h => {
    const id = h._id ? h._id.toString() : h.code;
    hospitalMap.set(id, h);
    hospitalMap.set(h.code, h);
  });

  let top1CapabilityMatches = 0;
  let top1SuitableCount = 0;
  let top3HitCount = 0;
  let reciprocalRankSum = 0;
  let falseAvailableCount = 0;
  let falseAvailableDenom = 0;
  let noResultCount = 0;
  let distanceSum = 0;
  let distanceCount = 0;
  const latencies = [];

  for (const scn of scenarios) {
    const t0 = process.hrtime.bigint();
    const result = runFn(scn, hospitals);
    const t1 = process.hrtime.bigint();
    const latencyMs = Number(t1 - t0) / 1e6;
    latencies.push(latencyMs);

    const recs = result.recommendations || [];

    if (recs.length === 0) {
      noResultCount++;
      continue;
    }

    const top1 = recs[0];
    const top1Id = top1.hospitalId;
    const top1Hosp = hospitalMap.get(top1Id);

    // 1. Top-1 Capability Match
    if (checkHospitalCapabilityMatch(top1Hosp, scn)) {
      top1CapabilityMatches++;
    }

    // 2. Top-1 Suitable Match (In Ground Truth Set)
    const isTop1Suitable = scn.groundTruthSuitableHospitalIds.includes(top1Id);
    if (isTop1Suitable) {
      top1SuitableCount++;
    }

    // 3. Top-3 Hit Rate
    const top3 = recs.slice(0, 3);
    const hasTop3Hit = top3.some(r => scn.groundTruthSuitableHospitalIds.includes(r.hospitalId));
    if (hasTop3Hit) {
      top3HitCount++;
    }

    // 4. Reciprocal Rank
    let firstSuitableRank = 0;
    for (let r = 0; r < recs.length; r++) {
      if (scn.groundTruthSuitableHospitalIds.includes(recs[r].hospitalId)) {
        firstSuitableRank = r + 1;
        break;
      }
    }
    if (firstSuitableRank > 0) {
      reciprocalRankSum += (1.0 / firstSuitableRank);
    }

    // 5. False Available Rate
    // If recommended top-1 hospital, but in true network state it had 0 available beds
    const trueState = scn.trueNetworkState[top1Id];
    if (top1.capacityState === 'available' || top1.capacityState === undefined) {
      falseAvailableDenom++;
      if (trueState && !trueState.hasBedCapacity) {
        falseAvailableCount++;
      }
    }

    // 6. Distance
    if (top1.distanceKm !== undefined) {
      distanceSum += top1.distanceKm;
      distanceCount++;
    }
  }

  latencies.sort((a, b) => a - b);
  const medianLatency = latencies[Math.floor(latencies.length / 2)] || 0;
  const totalScenarios = scenarios.length;

  return {
    method: name,
    totalScenarios,
    top1CapabilityMatchRate: Math.round((top1CapabilityMatches / totalScenarios) * 1000) / 10,
    top1SuitableRate: Math.round((top1SuitableCount / totalScenarios) * 1000) / 10,
    top3HitRate: Math.round((top3HitCount / totalScenarios) * 1000) / 10,
    mrr: Math.round((reciprocalRankSum / totalScenarios) * 1000) / 1000,
    falseAvailableRate: falseAvailableDenom > 0 ? Math.round((falseAvailableCount / falseAvailableDenom) * 1000) / 10 : 0.0,
    noResultRate: Math.round((noResultCount / totalScenarios) * 1000) / 10,
    meanTop1DistanceKm: distanceCount > 0 ? Math.round((distanceSum / distanceCount) * 10) / 10 : 0.0,
    medianRuntimeMs: Math.round(medianLatency * 100) / 100,
  };
}

/**
 * Runs complete benchmark evaluation across all models.
 */
async function runEvaluationBenchmark() {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';

  try {
    await connectDB();
    const hospitals = generateSyntheticHospitals();
    hospitals.forEach(hospital => {
      hospital._id = new mongoose.Types.ObjectId();
    });

    await Practitioner.deleteMany({});
    await Practitioner.insertMany(generateSyntheticPractitioners(hospitals));
    const practitioners = await Practitioner.find({
      employmentStatus: 'active',
      verificationStatus: 'verified',
    }).select('hospitalId specialty employmentStatus verificationStatus').lean();

    return runBenchmark(hospitals, practitioners);
  } finally {
    await disconnectDB();
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
}

function runBenchmark(hospitals, practitioners) {
  console.log('========================================================================');
  console.log(' CareBridge Referral Engine: Benchmark Evaluation (0% Staleness)');
  console.log(' Datasets: 40 Tamil Nadu Hospitals, 500 Evaluation Scenarios');
  console.log(' Disclaimer: Decision support only. Clinician review required.');
  console.log('========================================================================\n');

  const scenarios = generateEvaluationScenarios(hospitals, 42, practitioners);

  // Method 1: CareBridge Engine (unknown_aware)
  const carebridgeRunner = (scn, hosps) => {
    return rankReferralHospitals({
      requiredSpecialty: scn.requiredSpecialty,
      urgency: scn.urgency,
      requiredEquipment: scn.requiredEquipment,
      requiredBedType: scn.requiredBedType,
      patientLocation: scn.patientLocation,
      preferredScheme: scn.preferredScheme,
      capacityMode: 'unknown_aware',
      now: new Date(),
    }, hosps, scn.observedSnapshots);
  };

  // Method 2: Nearest Verified Baseline
  const nearestVerifiedRunner = (scn, hosps) => {
    return rankNearestVerified({ patientLocation: scn.patientLocation }, hosps);
  };

  // Method 3: Always Tier 1 Baseline
  const alwaysTier1Runner = (scn, hosps) => {
    return rankAlwaysTier1({ patientLocation: scn.patientLocation }, hosps);
  };

  // Method 4: Nearest Eligible Baseline
  const nearestEligibleRunner = (scn, hosps) => {
    return rankNearestEligible({
      requiredSpecialty: scn.requiredSpecialty,
      requiredEquipment: scn.requiredEquipment,
      patientLocation: scn.patientLocation,
    }, hosps);
  };

  // Method 5: Random Eligible Baseline
  const randomEligibleRunner = (scn, hosps) => {
    return rankRandomEligible({
      requiredSpecialty: scn.requiredSpecialty,
      requiredEquipment: scn.requiredEquipment,
      patientLocation: scn.patientLocation,
      randomSeed: scn.scenarioIndex * 17,
    }, hosps);
  };

  console.log('Running evaluation over 500 scenarios per model...');
  const results = [
    evaluateMethod('CareBridge (Ours)', carebridgeRunner, scenarios, hospitals),
    evaluateMethod('Nearest Eligible', nearestEligibleRunner, scenarios, hospitals),
    evaluateMethod('Nearest Verified', nearestVerifiedRunner, scenarios, hospitals),
    evaluateMethod('Always Tier 1', alwaysTier1Runner, scenarios, hospitals),
    evaluateMethod('Random Eligible', randomEligibleRunner, scenarios, hospitals),
  ];

  // Output ASCII report table
  console.log('\n--- RESEARCH EVALUATION RESULTS TABLE (0% Staleness, Practitioner-Collection Ground Truth) ---');
  console.log('| Model / Method     | Cap Match (%) | Top-1 Suit (%) | Top-3 Hit (%) |   MRR   | False Avail (%) | Dist (straight-line km) | Latency (ms) |');
  console.log('| :----------------- | ------------: | -------------: | ------------: | ------: | --------------: | ----------------------: | -----------: |');
  results.forEach(r => {
    const pad = (str, len, right = false) => {
      const s = String(str);
      return right ? s.padStart(len) : s.padEnd(len);
    };
    console.log(`| ${pad(r.method, 18)} | ${pad(r.top1CapabilityMatchRate + '%', 13, true)} | ${pad(r.top1SuitableRate + '%', 14, true)} | ${pad(r.top3HitRate + '%', 13, true)} | ${pad(r.mrr.toFixed(3), 7, true)} | ${pad(r.falseAvailableRate + '%', 15, true)} | ${pad(r.meanTop1DistanceKm + ' km', 23, true)} | ${pad(r.medianRuntimeMs + ' ms', 12, true)} |`);
  });
  console.log('------------------------------------------------------------------------------------------------\n');
  console.log('Evaluation Note: Synthetic active/verified practitioner documents in the practitioners collection supply ground truth.');
  console.log('A 100% capability match and MRR 1.000');
  console.log('at 0% staleness is expected by construction because fresh observed snapshots perfectly mirror true network');
  console.log('ground truth. Algorithmic divergence and degradation manifest under non-zero staleness levels (Phases 4 & 7).\n');

  // Save results to CSV and JSON
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const jsonOut = path.join(resultsDir, 'evaluation_results_0pct_staleness.json');
  fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2), 'utf-8');

  const csvRows = [
    'Model,Top1CapabilityMatchRate,Top1SuitableRate,Top3HitRate,MRR,FalseAvailableRate,NoResultRate,MeanTop1DistanceKm,MedianRuntimeMs',
    ...results.map(r => `${r.method},${r.top1CapabilityMatchRate},${r.top1SuitableRate},${r.top3HitRate},${r.mrr},${r.falseAvailableRate},${r.noResultRate},${r.meanTop1DistanceKm},${r.medianRuntimeMs}`)
  ];
  const csvOut = path.join(resultsDir, 'evaluation_results_0pct_staleness.csv');
  fs.writeFileSync(csvOut, csvRows.join('\n'), 'utf-8');

  console.log(`✓ Saved benchmark JSON results to ${jsonOut}`);
  console.log(`✓ Saved benchmark CSV table to ${csvOut}`);

  return results;
}

if (require.main === module) {
  runEvaluationBenchmark().catch(err => {
    console.error('Phase 3 evaluation failed:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  runEvaluationBenchmark,
  evaluateMethod,
};
