/**
 * CareBridge Phase 4 Unit & Integration Tests: Staleness Benchmark & Drift
 * 
 * Tests:
 * 1. Staleness model: s = 0 produces observed == true; stale fraction matches s; seed determinism.
 * 2. Drift model: p_drift = 0 preserves truth; p_drift = 1 drifts all aged reports.
 * 3. Metrics: Hand-computed examples for false-available, top-1 suitable, NDCG@3.
 * 4. Mode behavior: assume_available vs unknown_aware vs trust_last_reported.
 * 5. Seed protocol: Tuning and test seeds do not overlap.
 * 6. Reproducibility guarantee.
 */

const { generateSyntheticHospitals } = require('../scripts/syntheticDataGenerator');
const { generateEvaluationScenarios } = require('../evaluation/scenarioGenerator');
const { simulateStaleness, createMulberry32 } = require('../evaluation/staleness/stalenessModel');
const { evaluateScenarioResult, checkCapabilityMatch, computeBootstrapCI } = require('../evaluation/metrics');
const { evaluateResourceFreshness } = require('../services/freshnessService');
const { rankReferralHospitals } = require('../services/referralEngineService');
const { TEST_SEEDS, TUNING_SEEDS } = require('../evaluation/experimentRunner');

describe('Phase 4: Telemetry Staleness & Drift Experiments', () => {
  let hospitals;
  let testScenario;

  beforeAll(() => {
    hospitals = generateSyntheticHospitals(12345);
    const scenarios = generateEvaluationScenarios(hospitals, 42);
    testScenario = scenarios[0];
  });

  describe('1. Staleness Simulation Model & Invariants', () => {
    test('Invariant 1: At s = 0, observed snapshots strictly match true network state', () => {
      const sim = simulateStaleness({
        hospitals,
        scenario: testScenario,
        stalenessLevel: 0.0,
        mechanism: 'mixed',
        pDrift: 0.3,
        seed: 42,
      });

      expect(sim.staleCount).toBe(0);
      expect(sim.agedCount).toBe(0);
      expect(sim.missingCount).toBe(0);
      expect(sim.driftedCount).toBe(0);

      for (const hosp of hospitals) {
        const id = hosp._id ? hosp._id.toString() : hosp.code;
        const snap = sim.observedSnapshots[id];
        expect(snap).toBeDefined();
        expect(snap.isAged).toBe(false);
        expect(snap.isDrifted).toBe(false);

        const trueState = testScenario.trueNetworkState[id];
        const reportedStatus = snap.beds.icu.reportedStatus;
        const expectedStatus = trueState.hasBedCapacity ? 'available' : 'unavailable';
        expect(reportedStatus).toBe(expectedStatus);
      }
    });

    test('Invariant 2: Target stale fraction matches s within exact rounding tolerance', () => {
      const s = 0.20; // 20% of 40 = 8 hospitals
      const sim = simulateStaleness({
        hospitals,
        scenario: testScenario,
        stalenessLevel: s,
        mechanism: 'mixed',
        pDrift: 0.3,
        seed: 77,
      });

      const expectedCount = Math.round(hospitals.length * s);
      expect(sim.staleCount).toBe(expectedCount);
      expect(sim.staleHospitalIds.length).toBe(expectedCount);
      expect(sim.agedCount + sim.missingCount).toBe(expectedCount);
    });

    test('Invariant 3: PRNG is strictly deterministic given the same seed', () => {
      const sim1 = simulateStaleness({
        hospitals,
        scenario: testScenario,
        stalenessLevel: 0.30,
        mechanism: 'mixed',
        pDrift: 0.3,
        seed: 555,
      });

      const sim2 = simulateStaleness({
        hospitals,
        scenario: testScenario,
        stalenessLevel: 0.30,
        mechanism: 'mixed',
        pDrift: 0.3,
        seed: 555,
      });

      expect(sim1.staleHospitalIds).toEqual(sim2.staleHospitalIds);
      expect(sim1.driftedCount).toBe(sim2.driftedCount);
    });

    test('Invariant 4: Different seeds select different stale hospital subsets', () => {
      const simA = simulateStaleness({
        hospitals,
        scenario: testScenario,
        stalenessLevel: 0.30,
        mechanism: 'mixed',
        seed: 101,
      });

      const simB = simulateStaleness({
        hospitals,
        scenario: testScenario,
        stalenessLevel: 0.30,
        mechanism: 'mixed',
        seed: 102,
      });

      expect(simA.staleHospitalIds).not.toEqual(simB.staleHospitalIds);
    });
  });

  describe('2. Telemetry Drift Model', () => {
    test('Drift Boundary 1: When p_drift = 0, aged reports never differ from true state', () => {
      const sim = simulateStaleness({
        hospitals,
        scenario: testScenario,
        stalenessLevel: 0.50,
        mechanism: 'aged',
        pDrift: 0.0, // Zero drift
        seed: 999,
      });

      expect(sim.driftedCount).toBe(0);

      for (const id of sim.staleHospitalIds) {
        const snap = sim.observedSnapshots[id];
        expect(snap.isAged).toBe(true);
        expect(snap.isDrifted).toBe(false);

        const trueState = testScenario.trueNetworkState[id];
        const reportedStatus = snap.beds.icu.reportedStatus;
        const expectedStatus = trueState.hasBedCapacity ? 'available' : 'unavailable';
        expect(reportedStatus).toBe(expectedStatus);
      }
    });

    test('Drift Boundary 2: When p_drift = 1, all aged reports drift from true state', () => {
      const sim = simulateStaleness({
        hospitals,
        scenario: testScenario,
        stalenessLevel: 0.50,
        mechanism: 'aged',
        pDrift: 1.0, // 100% drift
        seed: 888,
      });

      expect(sim.driftedCount).toBe(sim.agedCount);

      for (const id of sim.staleHospitalIds) {
        const snap = sim.observedSnapshots[id];
        expect(snap.isAged).toBe(true);
        expect(snap.isDrifted).toBe(true);

        const trueState = testScenario.trueNetworkState[id];
        const reportedStatus = snap.beds.icu.reportedStatus;
        const oppositeStatus = trueState.hasBedCapacity ? 'unavailable' : 'available';
        expect(reportedStatus).toBe(oppositeStatus);
      }
    });
  });

  describe('3. Evaluation Metrics Hand-Computed Validation', () => {
    test('Calculates False-Available when recommended hospital has 0 true beds', () => {
      const mockTop1Id = 'HOSP-TEST-01';
      const mockRecommendations = [{ hospitalId: mockTop1Id, name: 'Test Hospital', score: 0.95 }];
      const mockTrueState = {
        [mockTop1Id]: { hasBedCapacity: false, availableBedCount: 0 },
      };

      const res = evaluateScenarioResult({
        recommendations: mockRecommendations,
        groundTruthSet: [],
        trueNetworkState: mockTrueState,
        scenario: testScenario,
        hospitals: [{ _id: mockTop1Id, code: mockTop1Id, verificationStatus: 'verified' }],
      });

      expect(res.isFalseAvailable).toBe(1);
      expect(res.isTop1Suitable).toBe(0);
    });

    test('Calculates Top-1 Suitable when recommended hospital is in ground truth', () => {
      const mockTop1Id = 'HOSP-TEST-02';
      const mockRecommendations = [{ hospitalId: mockTop1Id, name: 'Apex Hospital', score: 0.99 }];
      const mockTrueState = {
        [mockTop1Id]: { hasBedCapacity: true, availableBedCount: 4 },
      };

      const res = evaluateScenarioResult({
        recommendations: mockRecommendations,
        groundTruthSet: [mockTop1Id],
        trueNetworkState: mockTrueState,
        scenario: testScenario,
        hospitals: [{ _id: mockTop1Id, code: mockTop1Id, verificationStatus: 'verified' }],
      });

      expect(res.isFalseAvailable).toBe(0);
      expect(res.isTop1Suitable).toBe(1);
      expect(res.isTop3Hit).toBe(1);
      expect(res.ndcg3).toBeCloseTo(1.0, 4);
    });

    test('Hand-computed NDCG@3 with hit at Rank 2', () => {
      const mockRecommendations = [
        { hospitalId: 'HOSP-01' }, // Miss
        { hospitalId: 'HOSP-02' }, // Hit
        { hospitalId: 'HOSP-03' }, // Miss
      ];

      // DCG = 0 + 1 / log2(2 + 1) = 1 / log2(3) = 1 / 1.58496 = 0.6309
      // IDCG = 1 / log2(1 + 1) = 1 / 1 = 1.0
      // NDCG = 0.6309 / 1.0 = 0.6309
      const res = evaluateScenarioResult({
        recommendations: mockRecommendations,
        groundTruthSet: ['HOSP-02'],
        trueNetworkState: { 'HOSP-02': { hasBedCapacity: true } },
        scenario: testScenario,
        hospitals,
      });

      expect(res.ndcg3).toBeCloseTo(0.6309, 3);
      expect(res.mrr).toBeCloseTo(0.5, 3);
    });
  });

  describe('4. Engine Modes Capacity Handling', () => {
    test('assume_available never emits "unknown" capacity states or flags for stale snapshots', () => {
      const staleSnapshot = {
        reportedAt: new Date(Date.now() - 300 * 60 * 1000), // 5 hours old (stale for emergency)
        beds: { icu: { available: 2, reportedStatus: 'available' } },
      };

      const evalResult = evaluateResourceFreshness(
        staleSnapshot,
        'icu',
        'emergency',
        'assume_available'
      );

      expect(evalResult.effectiveState).toBe('available');
      expect(evalResult.isStale).toBe(true);
    });

    test('unknown_aware evaluates stale telemetry strictly as "unknown"', () => {
      const staleSnapshot = {
        reportedAt: new Date(Date.now() - 300 * 60 * 1000), // 5 hours old
        beds: { icu: { available: 2, reportedStatus: 'available' } },
      };

      const evalResult = evaluateResourceFreshness(
        staleSnapshot,
        'icu',
        'emergency',
        'unknown_aware'
      );

      expect(evalResult.effectiveState).toBe('unknown');
    });

    test('trust_last_reported trusts the historical snapshot without freshness discounting', () => {
      const staleSnapshot = {
        reportedAt: new Date(Date.now() - 300 * 60 * 1000),
        beds: { icu: { available: 3, reportedStatus: 'available' } },
      };

      const evalResult = evaluateResourceFreshness(
        staleSnapshot,
        'icu',
        'emergency',
        'trust_last_reported'
      );

      expect(evalResult.effectiveState).toBe('available');
    });
  });

  describe('5. Preregistered Protocol & Seed Guarantees', () => {
    test('Tuning and Test seeds are strictly non-overlapping', () => {
      expect(TUNING_SEEDS.length).toBe(10);
      expect(TEST_SEEDS.length).toBe(30);

      const intersection = TUNING_SEEDS.filter(s => TEST_SEEDS.includes(s));
      expect(intersection).toEqual([]);
    });

    test('Bootstrap CI function calculates valid 95% bounds', () => {
      const mockValues = [0.10, 0.12, 0.11, 0.09, 0.13, 0.10, 0.11, 0.12];
      const ci = computeBootstrapCI(mockValues, 500);

      expect(ci.mean).toBeCloseTo(0.11, 2);
      expect(ci.ciLower).toBeLessThanOrEqual(ci.mean);
      expect(ci.ciUpper).toBeGreaterThanOrEqual(ci.mean);
    });
  });
});
