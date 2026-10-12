/**
 * CareBridge Evaluation Metrics Module
 * 
 * Formal implementations of primary and secondary referral evaluation metrics.
 * Pure mathematical functions for deterministic replication.
 */

/**
 * Checks if a hospital object matches required specialty and equipment.
 */
function checkCapabilityMatch(hosp, requiredSpecialty, requiredEquipment, urgency) {
  if (!hosp) return false;
  if (hosp.verificationStatus !== 'verified') return false;

  const specialties = hosp.specialties || [];
  if (!specialties.includes(requiredSpecialty)) return false;

  const equipment = hosp.equipment || {};
  for (const eqKey of requiredEquipment || []) {
    if (eqKey === 'bloodBank') {
      if (!equipment.bloodBank || !equipment.bloodBank.available) return false;
    } else {
      const eq = equipment[eqKey];
      if (!eq || !eq.available || (eq.count !== undefined && eq.count <= 0)) return false;
    }
  }

  if (urgency === 'emergency' && !hosp.has24x7Emergency) return false;

  return true;
}

/**
 * Evaluates a single scenario recommendation result against ground truth and hidden network state.
 * 
 * @param {object} params
 * @param {Array<object>} params.recommendations Ranked recommendations from model
 * @param {Array<string>} params.groundTruthSet IDs of hospitals that are suitable (capability + true capacity)
 * @param {object} params.trueNetworkState Hidden actual bed and ED availability
 * @param {object} params.scenario Referral scenario details
 * @param {Array<object>} params.hospitals Network hospital objects
 * @returns {object} Individual scenario metric scores
 */
function evaluateScenarioResult({
  recommendations = [],
  groundTruthSet = [],
  trueNetworkState = {},
  scenario = {},
  hospitals = [],
}) {
  const gtSet = new Set(groundTruthSet);
  const top1 = recommendations[0] || null;
  const top3 = recommendations.slice(0, 3);
  const inputs = scenario.inputs || scenario;
  const urgency = inputs.urgency || 'urgent';
  const requiredSpecialty = inputs.requiredSpecialty;
  const requiredEquipment = inputs.requiredEquipment || [];

  const top1Id = top1 ? (top1.hospitalId || top1.code) : null;
  const top1Hosp = hospitals.find(h => (h._id ? h._id.toString() : h.code) === top1Id);

  // 1. Primary Metric: False-Available in Top-1
  // Recommended hospital was selected, BUT in hidden TRUE network state, it actually has NO capacity!
  let isFalseAvailable = 0;
  if (top1 && top1Id) {
    const trueState = trueNetworkState[top1Id];
    if (trueState && !trueState.hasBedCapacity) {
      isFalseAvailable = 1;
    }
  }

  // 2. Top-1 Suitable (capability AND truly has capacity)
  const isTop1Suitable = top1 && top1Id && gtSet.has(top1Id) ? 1 : 0;

  // 3. Top-3 Hit Rate (at least one in top 3 is suitable)
  const isTop3Hit = top3.some(rec => {
    const id = rec.hospitalId || rec.code;
    return gtSet.has(id);
  }) ? 1 : 0;

  // 4. NDCG@3 against ground truth
  let dcg3 = 0;
  for (let r = 0; r < Math.min(3, recommendations.length); r++) {
    const id = recommendations[r].hospitalId || recommendations[r].code;
    if (gtSet.has(id)) {
      dcg3 += 1.0 / Math.log2((r + 1) + 1);
    }
  }

  let idcg3 = 0;
  const idealHits = Math.min(3, gtSet.size);
  for (let r = 0; r < idealHits; r++) {
    idcg3 += 1.0 / Math.log2((r + 1) + 1);
  }
  const ndcg3 = idcg3 > 0 ? (dcg3 / idcg3) : (gtSet.size === 0 ? 1.0 : 0.0);

  // 5. MRR (Mean Reciprocal Rank)
  let mrr = 0;
  for (let r = 0; r < Math.min(3, recommendations.length); r++) {
    const id = recommendations[r].hospitalId || recommendations[r].code;
    if (gtSet.has(id)) {
      mrr = 1.0 / (r + 1);
      break;
    }
  }

  // 6. Capability Match Rate of Top-1
  let isCapabilityMatch = 0;
  if (top1Hosp) {
    isCapabilityMatch = checkCapabilityMatch(top1Hosp, requiredSpecialty, requiredEquipment, urgency) ? 1 : 0;
  }

  // 7. Flagged Unknown Rate in Top-1
  let isFlaggedUnknown = 0;
  if (top1) {
    const isUnknownState = top1.capacityState === 'unknown';
    const hasUnknownFlag = Array.isArray(top1.flags) && top1.flags.some(f =>
      f.toLowerCase().includes('unknown') || f.toLowerCase().includes('telephone')
    );
    if (isUnknownState || hasUnknownFlag) {
      isFlaggedUnknown = 1;
    }
  }

  // 8. Missed Opportunity Rate
  // Truly suitable hospital existed in network, but NONE appeared in top 3
  const isMissedOpportunity = (gtSet.size > 0 && isTop3Hit === 0) ? 1 : 0;

  // 9. No-Result Rate
  const isNoResult = recommendations.length === 0 ? 1 : 0;

  // 10. Straight-Line Distance of Top-1
  const top1DistanceKm = top1 ? (Number(top1.distanceKm) || 0) : null;

  return {
    isFalseAvailable,
    isTop1Suitable,
    isTop3Hit,
    ndcg3,
    mrr,
    isCapabilityMatch,
    isFlaggedUnknown,
    isMissedOpportunity,
    isNoResult,
    top1DistanceKm,
  };
}

/**
 * Computes summary statistics over an array of numbers.
 */
function computeMean(arr) {
  if (!arr || arr.length === 0) return 0;
  const valid = arr.filter(v => v !== null && !isNaN(v));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/**
 * Computes 95% bootstrap confidence interval using percentile bootstrap.
 * 
 * @param {Array<number>} data Values across seeds
 * @param {number} [numResamples=1000]
 * @returns {{ mean: number, ciLower: number, ciUpper: number, stdDev: number }}
 */
function computeBootstrapCI(data, numResamples = 1000) {
  if (!data || data.length === 0) {
    return { mean: 0, ciLower: 0, ciUpper: 0, stdDev: 0 };
  }

  const valid = data.filter(v => v !== null && !isNaN(v));
  const n = valid.length;
  if (n === 0) return { mean: 0, ciLower: 0, ciUpper: 0, stdDev: 0 };

  const mean = computeMean(valid);
  if (n === 1) return { mean, ciLower: mean, ciUpper: mean, stdDev: 0 };

  // Variance & StdDev
  const variance = valid.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  // Deterministic LCG for reproducible bootstrap resamples
  let s = 987654321;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const resampleMeans = [];
  for (let b = 0; b < numResamples; b++) {
    let bSum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rand() * n);
      bSum += valid[idx];
    }
    resampleMeans.push(bSum / n);
  }

  resampleMeans.sort((a, b) => a - b);
  const lowIdx = Math.floor(0.025 * numResamples);
  const highIdx = Math.min(numResamples - 1, Math.floor(0.975 * numResamples));

  return {
    mean: Math.round(mean * 10000) / 10000,
    ciLower: Math.round(resampleMeans[lowIdx] * 10000) / 10000,
    ciUpper: Math.round(resampleMeans[highIdx] * 10000) / 10000,
    stdDev: Math.round(stdDev * 10000) / 10000,
  };
}

/**
 * Computes paired differences, effect sizes, and p-value between two models across seeds.
 * 
 * @param {Array<number>} modelA Seed-level metric values for unknown_aware
 * @param {Array<number>} modelB Seed-level metric values for assume_available
 * @returns {object} Paired difference analysis
 */
function computePairedComparison(modelA, modelB) {
  const n = Math.min(modelA.length, modelB.length);
  if (n === 0) return null;

  const diffs = [];
  for (let i = 0; i < n; i++) {
    diffs.push(modelA[i] - modelB[i]);
  }

  const diffCI = computeBootstrapCI(diffs, 1000);

  // Wilcoxon Signed-Rank Test (Normal approximation with continuity correction)
  const nonZeroDiffs = diffs.filter(d => Math.abs(d) > 1e-9);
  const nNonZero = nonZeroDiffs.length;

  let pValue = 1.0;
  let zScore = 0.0;

  if (nNonZero >= 5) {
    const ranked = nonZeroDiffs
      .map(d => ({ diff: d, absDiff: Math.abs(d), sign: d > 0 ? 1 : -1 }))
      .sort((a, b) => a.absDiff - b.absDiff);

    let positiveRankSum = 0;
    for (let i = 0; i < ranked.length; i++) {
      const rank = i + 1;
      if (ranked[i].sign > 0) {
        positiveRankSum += rank;
      }
    }

    const expectedMean = (nNonZero * (nNonZero + 1)) / 4;
    const stdRank = Math.sqrt((nNonZero * (nNonZero + 1) * (2 * nNonZero + 1)) / 24);

    if (stdRank > 0) {
      zScore = (positiveRankSum - expectedMean) / stdRank;
      // Two-sided standard normal p-value via Abramowitz and Stegun approximation
      const t = 1.0 / (1.0 + 0.2316419 * Math.abs(zScore));
      const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
      const normalCDF = 1.0 - (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * zScore * zScore) * poly;
      pValue = Math.min(1.0, 2.0 * (1.0 - normalCDF));
    }
  } else if (nNonZero > 0) {
    // Permutation p-value for very small n
    pValue = diffs.every(d => d <= 0) || diffs.every(d => d >= 0) ? 0.05 : 0.50;
  }

  // Cliff's Delta effect size
  let more = 0, less = 0;
  for (let i = 0; i < modelA.length; i++) {
    for (let j = 0; j < modelB.length; j++) {
      if (modelA[i] > modelB[j]) more++;
      else if (modelA[i] < modelB[j]) less++;
    }
  }
  const totalPairs = modelA.length * modelB.length;
  const cliffsDelta = totalPairs > 0 ? (more - less) / totalPairs : 0;

  return {
    meanDifference: diffCI.mean,
    ciLower: diffCI.ciLower,
    ciUpper: diffCI.ciUpper,
    pValue: Math.round(pValue * 10000) / 10000,
    zScore: Math.round(zScore * 1000) / 1000,
    cliffsDelta: Math.round(cliffsDelta * 1000) / 1000,
    isSignificant: pValue < 0.05,
  };
}

module.exports = {
  evaluateScenarioResult,
  checkCapabilityMatch,
  computeBootstrapCI,
  computePairedComparison,
  computeMean,
};
