const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const Hospital = require('../models/Hospital');
const HospitalCapacity = require('../models/HospitalCapacity');
const Consent = require('../models/Consent');
const AuditLog = require('../models/AuditLog');
const Scheme = require('../models/Scheme');
const {
  generateSyntheticHospitals,
  generateSyntheticCapacities,
  generateSyntheticReferralScenarios,
  generateSchemeCatalogue,
  haversineDistance,
} = require('../scripts/syntheticDataGenerator');

jest.setTimeout(30000);

describe('Phase 1: Schemas, Freshness Logic & Synthetic Data Verification', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('Hospital Schema & Constraints', () => {
    it('should create and validate a synthetic hospital in Salem, Tamil Nadu', async () => {
      const testHosp = new Hospital({
        name: 'Synthetic - Test Hospital Salem',
        code: 'HOSP-TEST-001',
        district: 'Salem',
        location: { latitude: 11.6643, longitude: 78.1460 },
        ownership: 'government',
        verificationStatus: 'verified',
        tier: 'Tier 1',
        specialties: ['Cardiology', 'Pulmonology', 'Emergency Medicine'],
        equipment: {
          ventilators: { available: true, count: 12 },
          ctScan: { available: true, count: 2 },
          bloodBank: { available: true, licenseValid: true },
        },
        bedCounts: { general: 300, emergency: 30, icu: 40 },
        isSynthetic: true,
      });

      const saved = await testHosp.save();
      expect(saved._id).toBeDefined();
      expect(saved.state).toBe('Tamil Nadu');
      expect(saved.verificationStatus).toBe('verified');
      expect(saved.tier).toBe('Tier 1');
      await Hospital.deleteOne({ _id: saved._id });
    });

    it('should reject coordinates outside Tamil Nadu bounds', async () => {
      const invalidHosp = new Hospital({
        name: 'Invalid Geo Hospital',
        code: 'HOSP-INVALID-GEO',
        district: 'Delhi',
        location: { latitude: 28.6139, longitude: 77.2090 }, // In Delhi, outside TN bounds (8-14 lat)
        ownership: 'government',
      });

      let err = null;
      try {
        await invalidHosp.validate();
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect(err.errors['location.latitude']).toBeDefined();
    });
  });

  describe('HospitalCapacity Staleness & Evaluation Logic', () => {
    it('should treat fresh data (< threshold) as reported status', () => {
      const refTime = new Date('2026-10-12T12:00:00Z');
      const freshTimestamp = new Date('2026-10-12T11:30:00Z'); // 30 minutes old (threshold 120m)

      const capacity = new HospitalCapacity({
        hospitalId: new mongoose.Types.ObjectId(),
        timestamp: freshTimestamp,
        stalenessThresholdMinutes: 120,
        beds: {
          icu: { total: 20, occupied: 15, available: 5, reportedStatus: 'available' },
          emergency: { total: 10, occupied: 10, available: 0, reportedStatus: 'unavailable' },
        },
        services: {
          emergencyDepartment: { reportedStatus: 'available', diversionActive: false },
        },
      });

      expect(capacity.isStale(refTime)).toBe(false);
      const evaluated = capacity.getEvaluatedCapacity(refTime);
      expect(evaluated.isStale).toBe(false);
      expect(evaluated.beds.icu.effectiveStatus).toBe('available');
      expect(evaluated.beds.emergency.effectiveStatus).toBe('unavailable');
      expect(evaluated.services.emergencyDepartment.effectiveStatus).toBe('available');
    });

    it('CORE REQUIREMENT: should treat stale data (> threshold) as "unknown" rather than "available"', () => {
      const refTime = new Date('2026-10-12T15:00:00Z');
      const staleTimestamp = new Date('2026-10-12T12:00:00Z'); // 180 minutes old (> threshold 120m)

      const capacity = new HospitalCapacity({
        hospitalId: new mongoose.Types.ObjectId(),
        timestamp: staleTimestamp,
        stalenessThresholdMinutes: 120,
        beds: {
          icu: { total: 20, occupied: 15, available: 5, reportedStatus: 'available' },
        },
        services: {
          emergencyDepartment: { reportedStatus: 'available' },
        },
      });

      expect(capacity.isStale(refTime)).toBe(true);
      const evaluated = capacity.getEvaluatedCapacity(refTime);
      expect(evaluated.isStale).toBe(true);
      // Stale data MUST be marked unknown in CareBridge
      expect(evaluated.beds.icu.effectiveStatus).toBe('unknown');
      expect(evaluated.services.emergencyDepartment.effectiveStatus).toBe('unknown');
    });

    it('should support baseline mode (assumeAvailableIfStale=true) for experimental comparison', () => {
      const refTime = new Date('2026-10-12T15:00:00Z');
      const staleTimestamp = new Date('2026-10-12T12:00:00Z'); // 180 minutes old

      const capacity = new HospitalCapacity({
        hospitalId: new mongoose.Types.ObjectId(),
        timestamp: staleTimestamp,
        stalenessThresholdMinutes: 120,
        beds: {
          icu: { total: 20, occupied: 15, available: 5, reportedStatus: 'available' },
        },
      });

      const evaluatedBaseline = capacity.getEvaluatedCapacity(refTime, 120, true);
      // In naive baseline mode, stale available beds are assumed still available
      expect(evaluatedBaseline.beds.icu.effectiveStatus).toBe('available');
    });
  });

  describe('Consent & Audit Log Schemas', () => {
    it('should accurately determine active and expired consents', () => {
      const now = new Date('2026-10-12T12:00:00Z');
      const validConsent = new Consent({
        consentId: 'CNS-001',
        patientId: new mongoose.Types.ObjectId(),
        fromHospitalId: new mongoose.Types.ObjectId(),
        toHospitalId: new mongoose.Types.ObjectId(),
        status: 'granted',
        grantedAt: new Date('2026-10-12T10:00:00Z'),
        expiresAt: new Date('2026-10-12T18:00:00Z'), // expires in future
        scope: ['vitals', 'imaging_reports'],
      });
      expect(validConsent.isActive(now)).toBe(true);

      const expiredConsent = new Consent({
        consentId: 'CNS-002',
        patientId: new mongoose.Types.ObjectId(),
        fromHospitalId: new mongoose.Types.ObjectId(),
        toHospitalId: new mongoose.Types.ObjectId(),
        status: 'granted',
        grantedAt: new Date('2026-10-11T10:00:00Z'),
        expiresAt: new Date('2026-10-12T08:00:00Z'), // expired 4h ago
        scope: ['vitals'],
      });
      expect(expiredConsent.isActive(now)).toBe(false);
    });

    it('should validate audit log creation with immutable timestamp', async () => {
      const log = new AuditLog({
        logId: 'AUD-TEST-001',
        actorRole: 'doctor',
        action: 'QUERY_REFERRAL_ENGINE',
        resourceType: 'Referral',
        resourceId: 'REF-001',
        accessGranted: true,
        justification: 'Clinician initiating emergency referral search',
      });
      const saved = await log.save();
      expect(saved.timestamp).toBeDefined();
      expect(saved.action).toBe('QUERY_REFERRAL_ENGINE');
      await AuditLog.deleteOne({ _id: saved._id });
    });
  });

  describe('Synthetic Data Generator Integrity', () => {
    it('should generate exactly 40 synthetic Tamil Nadu hospitals with realistic spread', () => {
      const hospitals = generateSyntheticHospitals();
      expect(hospitals.length).toBe(40);

      // Check district distribution
      const districts = new Set(hospitals.map(h => h.district));
      expect(districts.has('Salem')).toBe(true);
      expect(districts.has('Erode')).toBe(true);
      expect(districts.has('Coimbatore')).toBe(true);
      expect(districts.has('Chennai')).toBe(true);
      expect(districts.has('Madurai')).toBe(true);

      // Check verification statuses
      const verified = hospitals.filter(h => h.verificationStatus === 'verified');
      const pending = hospitals.filter(h => h.verificationStatus === 'pending');
      const unverified = hospitals.filter(h => h.verificationStatus === 'unverified');
      const rejected = hospitals.filter(h => h.verificationStatus === 'rejected');

      expect(verified.length).toBeGreaterThanOrEqual(25);
      expect(pending.length).toBeGreaterThan(0);
      expect(unverified.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);

      // Check all have synthetic label
      expect(hospitals.every(h => h.isSynthetic === true)).toBe(true);
      expect(hospitals.every(h => h.name.startsWith('Synthetic -'))).toBe(true);
    });

    it('should generate 500 synthetic referral scenarios with ground-truth suitability', () => {
      const hospitals = generateSyntheticHospitals();
      const scenarios = generateSyntheticReferralScenarios(hospitals);
      expect(scenarios.length).toBe(500);

      // Every scenario has requirements and ground truth
      const firstScn = scenarios[0];
      expect(firstScn.referralId).toBe('REF-SCN-001');
      expect(firstScn.requirements.requiredSpecialty).toBeDefined();
      expect(Array.isArray(firstScn.requirements.requiredEquipment)).toBe(true);
      expect(Array.isArray(firstScn.groundTruthSuitableHospitalCodes)).toBe(true);
      expect(firstScn.patientSummary.vitals).toBeDefined();
      expect(firstScn.patientSummary.vitals.spo2).toBeDefined();

      // Check ground-truth validity: All ground-truth suitable hospitals must be verified
      const hospitalMap = new Map(hospitals.map(h => [h.code, h]));
      for (let i = 0; i < 20; i++) {
        const scn = scenarios[i];
        scn.groundTruthSuitableHospitalCodes.forEach(code => {
          const hosp = hospitalMap.get(code);
          expect(hosp.verificationStatus).toBe('verified');
          expect(hosp.specialties).toContain(scn.requirements.requiredSpecialty);
        });
      }
    });

    it('should compute Haversine distance correctly between Coimbatore and Salem', () => {
      // Coimbatore (~11.0168, 76.9558) to Salem (~11.6643, 78.1460) is ~145-155 km
      const dist = haversineDistance(11.0168, 76.9558, 11.6643, 78.1460);
      expect(dist).toBeGreaterThan(140);
      expect(dist).toBeLessThan(160);
    });

    it('should include CMCHIS and PM-JAY in scheme catalogue with disclaimers', () => {
      const schemes = generateSchemeCatalogue();
      expect(schemes.length).toBe(2);
      expect(schemes.some(s => s.schemeCode === 'CMCHIS')).toBe(true);
      expect(schemes.some(s => s.schemeCode === 'PM-JAY')).toBe(true);
      // Must contain disclaimer "potential match, verify eligibility"
      schemes.forEach(s => {
        expect(s.disclaimer.toLowerCase()).toContain('potential match, verify eligibility');
      });
    });
  });
});
