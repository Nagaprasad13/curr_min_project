const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const Hospital = require('../models/Hospital');
const HospitalCapacity = require('../models/HospitalCapacity');
const Referral = require('../models/Referral');
const User = require('../models/User');
const { signToken } = require('../config/jwt');
const { calculateHaversineDistance, STRAIGHT_LINE_NOTICE } = require('../services/haversineService');
const { evaluateResourceFreshness } = require('../services/freshnessService');
const { rankReferralHospitals } = require('../services/referralEngineService');

jest.setTimeout(30000);

describe('Phase 3: Capacity Data, Referral Engine & Baselines', () => {
  let doctorUser1, doctorUser2, adminUser1, adminUser2, patientUser;
  let doctorToken1, doctorToken2, adminToken1, adminToken2, patientToken;
  let hospTier1, hospTier2, hospBasic;

  beforeAll(async () => {
    await connectDB();
    await Hospital.deleteMany({});
    await HospitalCapacity.deleteMany({});
    await Referral.deleteMany({});
    await User.deleteMany({});

    // Users
    doctorUser1 = await new User({
      name: 'Dr. S. Sundaram',
      email: 'doctor1@test.synthetic',
      password: 'Password123!',
      role: 'doctor',
    }).save();
    doctorToken1 = signToken({ id: doctorUser1._id, role: doctorUser1.role, email: doctorUser1.email });

    doctorUser2 = await new User({
      name: 'Dr. R. Raman',
      email: 'doctor2@test.synthetic',
      password: 'Password123!',
      role: 'doctor',
    }).save();
    doctorToken2 = signToken({ id: doctorUser2._id, role: doctorUser2.role, email: doctorUser2.email });

    adminUser1 = await new User({
      name: 'Admin Hospital 1',
      email: 'admin1@test.synthetic',
      password: 'Password123!',
      role: 'hospital_admin',
    }).save();
    adminToken1 = signToken({ id: adminUser1._id, role: adminUser1.role, email: adminUser1.email });

    adminUser2 = await new User({
      name: 'Admin Hospital 2',
      email: 'admin2@test.synthetic',
      password: 'Password123!',
      role: 'hospital_admin',
    }).save();
    adminToken2 = signToken({ id: adminUser2._id, role: adminUser2.role, email: adminUser2.email });

    patientUser = await new User({
      name: 'M. Anandhi',
      email: 'patient@test.synthetic',
      password: 'Password123!',
      role: 'patient',
    }).save();
    patientToken = signToken({ id: patientUser._id, role: patientUser.role, email: patientUser.email });

    // Seed Hospitals
    hospTier1 = await new Hospital({
      name: 'Synthetic Kovai Apex Tertiary Institute',
      code: 'HOSP-P3-T1',
      registrationNumber: 'CEA-TN-P3-001',
      adminUserId: adminUser1._id,
      district: 'Coimbatore',
      location: { latitude: 11.0168, longitude: 76.9558 },
      ownership: 'private_corporate',
      has24x7Emergency: true,
      verificationStatus: 'verified',
      tier: 'Tier 1',
      specialties: ['Cardiology', 'Emergency Medicine'],
      specialists: [{ specialty: 'Cardiology', count: 3, onCall24x7: true }],
      equipment: {
        ventilators: { available: true, count: 20 },
        cardiacCathLab: { available: true, count: 2 },
        ctScan: { available: true, count: 2 },
        mri: { available: true, count: 1 },
        bloodBank: { available: true, licenseValid: true },
        lab: { available: true, level: 'advanced' },
      },
      bedCounts: { general: 300, emergency: 30, icu: 35 },
      schemeParticipation: [{ schemeCode: 'CMCHIS', empaneled: true }],
      isSynthetic: true,
    }).save();
    await User.findByIdAndUpdate(adminUser1._id, { hospitalId: hospTier1._id });

    hospTier2 = await new Hospital({
      name: 'Synthetic Salem Pulmonology Specialty Hospital',
      code: 'HOSP-P3-T2',
      registrationNumber: 'CEA-TN-P3-002',
      adminUserId: adminUser2._id,
      district: 'Salem',
      location: { latitude: 11.6643, longitude: 78.1460 },
      ownership: 'private_trust',
      has24x7Emergency: true,
      verificationStatus: 'verified',
      tier: 'Tier 2',
      specialties: ['Pulmonology', 'Emergency Medicine'],
      specialists: [{ specialty: 'Pulmonology', count: 2, onCall24x7: true }],
      equipment: {
        ventilators: { available: true, count: 6 },
        ctScan: { available: true, count: 1 },
        bloodBank: { available: true, licenseValid: true },
        lab: { available: true, level: 'advanced' },
      },
      bedCounts: { general: 80, emergency: 12, icu: 10 },
      schemeParticipation: [{ schemeCode: 'CMCHIS', empaneled: true }],
      isSynthetic: true,
    }).save();
    await User.findByIdAndUpdate(adminUser2._id, { hospitalId: hospTier2._id });

    hospBasic = await new Hospital({
      name: 'Synthetic Erode Basic Taluk Clinic',
      code: 'HOSP-P3-T3',
      registrationNumber: 'CEA-TN-P3-003',
      district: 'Erode',
      location: { latitude: 11.3410, longitude: 77.7172 },
      ownership: 'government',
      has24x7Emergency: false,
      verificationStatus: 'unverified',
      tier: 'Tier 3',
      specialties: ['General Medicine'],
      equipment: { lab: { available: true, level: 'basic' } },
      bedCounts: { general: 20, emergency: 4, icu: 0 },
      isSynthetic: true,
    }).save();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Haversine Distance Service', () => {
    it('should compute distance accurately for known city pair: Salem to Chennai (~280-300 km straight-line)', () => {
      // Salem: 11.6643, 78.1460; Chennai: 13.0827, 80.2707
      const dist = calculateHaversineDistance(11.6643, 78.1460, 13.0827, 80.2707);
      expect(dist).toBeGreaterThan(275.0);
      expect(dist).toBeLessThan(305.0);
    });

    it('should return 0.0 for identical coordinates', () => {
      const dist = calculateHaversineDistance(11.0168, 76.9558, 11.0168, 76.9558);
      expect(dist).toBe(0.0);
    });

    it('should satisfy symmetry: distance(A, B) === distance(B, A)', () => {
      const distAB = calculateHaversineDistance(11.0168, 76.9558, 11.6643, 78.1460);
      const distBA = calculateHaversineDistance(11.6643, 78.1460, 11.0168, 76.9558);
      expect(distAB).toBe(distBA);
    });
  });

  describe('2. Freshness Evaluation Service', () => {
    it('boundary test at max age: 119m is fresh, 121m is stale (emergency max age 120m)', () => {
      const now = new Date('2026-10-12T14:00:00Z');

      // 119 minutes old (fresh)
      const snap119 = {
        reportedAt: new Date(now.getTime() - 119 * 60 * 1000),
        beds: { icu: { available: 4, reportedStatus: 'available' } },
      };
      const res119 = evaluateResourceFreshness(snap119, 'icu', 'emergency', 'unknown_aware', now);
      expect(res119.isStale).toBe(false);
      expect(res119.effectiveState).toBe('available');

      // 121 minutes old (stale)
      const snap121 = {
        reportedAt: new Date(now.getTime() - 121 * 60 * 1000),
        beds: { icu: { available: 4, reportedStatus: 'available' } },
      };
      const res121 = evaluateResourceFreshness(snap121, 'icu', 'emergency', 'unknown_aware', now);
      expect(res121.isStale).toBe(true);
      expect(res121.effectiveState).toBe('unknown'); // Stale evaluated as unknown!
    });

    it('never-reported telemetry evaluates strictly as "unknown", never "available"', () => {
      const resNever = evaluateResourceFreshness(null, 'icu', 'emergency', 'unknown_aware', new Date());
      expect(resNever.effectiveState).toBe('unknown');
      expect(resNever.freshnessStatus).toBe('never_reported');
    });

    it('evaluates urgency thresholds differently (emergency 2h vs routine 24h)', () => {
      const now = new Date('2026-10-12T14:00:00Z');
      // 5 hours old (300 minutes old)
      const snap300m = {
        reportedAt: new Date(now.getTime() - 300 * 60 * 1000),
        beds: { icu: { available: 5, reportedStatus: 'available' } },
      };

      // In emergency (cutoff 120m), 300m is stale -> unknown
      const resEmergency = evaluateResourceFreshness(snap300m, 'icu', 'emergency', 'unknown_aware', now);
      expect(resEmergency.effectiveState).toBe('unknown');

      // In routine (cutoff 1440m / 24h), 300m is fresh -> available
      const resRoutine = evaluateResourceFreshness(snap300m, 'icu', 'routine', 'unknown_aware', now);
      expect(resRoutine.effectiveState).toBe('available');
    });

    it('capacityMode toggle: assume_available treats stale as available, unknown_aware does not', () => {
      const now = new Date('2026-10-12T14:00:00Z');
      const staleSnap = {
        reportedAt: new Date(now.getTime() - 200 * 60 * 1000),
        beds: { icu: { available: 4, reportedStatus: 'available' } },
      };

      // CareBridge Core Mode
      const resAware = evaluateResourceFreshness(staleSnap, 'icu', 'emergency', 'unknown_aware', now);
      expect(resAware.effectiveState).toBe('unknown');

      // Naive Baseline Mode
      const resNaive = evaluateResourceFreshness(staleSnap, 'icu', 'emergency', 'assume_available', now);
      expect(resNaive.effectiveState).toBe('available');
    });
  });

  describe('3. Core Referral Engine & Hard Filters', () => {
    const testHospitals = [
      {
        _id: 'HOSP-A',
        name: 'Verified Tier 2 with Pulmonologist',
        verificationStatus: 'verified',
        tier: 'Tier 2',
        has24x7Emergency: true,
        specialties: ['Pulmonology'],
        specialists: [{ specialty: 'Pulmonology', count: 2, onCall24x7: true }],
        equipment: { ventilators: { available: true, count: 5 } },
        location: { latitude: 11.6643, longitude: 78.1460 }, // Salem
      },
      {
        _id: 'HOSP-B',
        name: 'Verified Tier 1 without Pulmonologist',
        verificationStatus: 'verified',
        tier: 'Tier 1',
        has24x7Emergency: true,
        specialties: ['Cardiology'], // No Pulmonology
        specialists: [{ specialty: 'Cardiology', count: 4, onCall24x7: true }],
        equipment: { ventilators: { available: true, count: 20 } },
        location: { latitude: 11.0168, longitude: 76.9558 }, // Coimbatore
      },
      {
        _id: 'HOSP-C',
        name: 'Unverified Hospital with Pulmonologist',
        verificationStatus: 'unverified',
        tier: 'Tier 2',
        has24x7Emergency: true,
        specialties: ['Pulmonology'],
        specialists: [{ specialty: 'Pulmonology', count: 2 }],
        equipment: { ventilators: { available: true, count: 5 } },
        location: { latitude: 11.3410, longitude: 77.7172 }, // Erode
      },
      {
        _id: 'HOSP-D',
        name: 'Verified Clinic without 24x7 Emergency',
        verificationStatus: 'verified',
        tier: 'Tier 3',
        has24x7Emergency: false, // Lacks 24x7 emergency
        specialties: ['Pulmonology'],
        specialists: [{ specialty: 'Pulmonology', count: 1 }],
        equipment: { ventilators: { available: true, count: 2 } },
        location: { latitude: 11.3410, longitude: 77.7172 },
      },
    ];

    it('hard filter excludes unverified hospitals', () => {
      const res = rankReferralHospitals({
        requiredSpecialty: 'Pulmonology',
        urgency: 'urgent',
        patientLocation: { latitude: 11.5, longitude: 77.5 },
      }, testHospitals, {});

      const recIds = res.recommendations.map(r => r.hospitalId);
      expect(recIds).not.toContain('HOSP-C');
      expect(res.excludedHospitals.some(e => e.hospitalId === 'HOSP-C' && e.filterCode === 'NOT_VERIFIED')).toBe(true);
    });

    it('hard filter excludes hospital lacking required specialty', () => {
      const res = rankReferralHospitals({
        requiredSpecialty: 'Pulmonology',
        urgency: 'urgent',
        patientLocation: { latitude: 11.5, longitude: 77.5 },
      }, testHospitals, {});

      const recIds = res.recommendations.map(r => r.hospitalId);
      expect(recIds).not.toContain('HOSP-B');
      expect(res.excludedHospitals.some(e => e.hospitalId === 'HOSP-B' && e.filterCode === 'MISSING_SPECIALTY')).toBe(true);
    });

    it('hard filter excludes hospital without 24x7 emergency when urgency is emergency', () => {
      const res = rankReferralHospitals({
        requiredSpecialty: 'Pulmonology',
        urgency: 'emergency',
        patientLocation: { latitude: 11.5, longitude: 77.5 },
      }, testHospitals, {});

      const recIds = res.recommendations.map(r => r.hospitalId);
      expect(recIds).not.toContain('HOSP-D');
      expect(res.excludedHospitals.some(e => e.hospitalId === 'HOSP-D' && e.filterCode === 'NO_24X7_EMERGENCY')).toBe(true);
    });

    it('ranking rule: Tier 2 with the right specialist outranks Tier 1 without it', () => {
      const res = rankReferralHospitals({
        requiredSpecialty: 'Pulmonology',
        urgency: 'urgent',
        patientLocation: { latitude: 11.5, longitude: 77.5 },
      }, testHospitals, {});

      expect(res.recommendations.length).toBeGreaterThan(0);
      expect(res.recommendations[0].hospitalId).toBe('HOSP-A');
      expect(res.recommendations[0].tier).toBe('Tier 2');
    });

    it('ranking rule: unknown-capacity hospital never outranks equivalent fresh-available one', () => {
      const hosp1 = {
        _id: 'HOSP-FRESH',
        name: 'Hospital Fresh Capacity',
        verificationStatus: 'verified',
        tier: 'Tier 2',
        specialties: ['Cardiology'],
        specialists: [{ specialty: 'Cardiology', count: 1 }],
        equipment: {},
        location: { latitude: 11.0, longitude: 77.0 },
      };
      const hosp2 = {
        _id: 'HOSP-UNKNOWN',
        name: 'Hospital Unknown Capacity',
        verificationStatus: 'verified',
        tier: 'Tier 2',
        specialties: ['Cardiology'],
        specialists: [{ specialty: 'Cardiology', count: 1 }],
        equipment: {},
        location: { latitude: 11.0, longitude: 77.0 }, // Same distance
      };

      const now = new Date('2026-10-12T14:00:00Z');
      const snaps = {
        'HOSP-FRESH': { reportedAt: new Date(now.getTime() - 20 * 60 * 1000), beds: { icu: { available: 5 } } },
        'HOSP-UNKNOWN': { reportedAt: new Date(now.getTime() - 450 * 60 * 1000), beds: { icu: { available: 5 } } }, // 450m > 360m (stale for urgent)
      };

      const res = rankReferralHospitals({
        requiredSpecialty: 'Cardiology',
        urgency: 'urgent',
        patientLocation: { latitude: 11.0, longitude: 77.0 },
        now,
      }, [hosp1, hosp2], snaps);

      expect(res.recommendations[0].hospitalId).toBe('HOSP-FRESH');
      expect(res.recommendations[1].hospitalId).toBe('HOSP-UNKNOWN');
      expect(res.recommendations[0].score).toBeGreaterThan(res.recommendations[1].score);
    });

    it('empty-result case returns reasons and does not relax hard filters', () => {
      const resEmpty = rankReferralHospitals({
        requiredSpecialty: 'NonExistentSpecialty',
        urgency: 'emergency',
        patientLocation: { latitude: 11.0, longitude: 77.0 },
      }, testHospitals, {});

      expect(resEmpty.recommendations.length).toBe(0);
      expect(resEmpty.excludedHospitals.length).toBe(testHospitals.length);
    });

    it('engine is pure and deterministic: same inputs give identical output', () => {
      const run1 = rankReferralHospitals({
        requiredSpecialty: 'Pulmonology',
        urgency: 'urgent',
        patientLocation: { latitude: 11.5, longitude: 77.5 },
        now: new Date('2026-10-12T12:00:00Z'),
      }, testHospitals, {});

      const run2 = rankReferralHospitals({
        requiredSpecialty: 'Pulmonology',
        urgency: 'urgent',
        patientLocation: { latitude: 11.5, longitude: 77.5 },
        now: new Date('2026-10-12T12:00:00Z'),
      }, testHospitals, {});

      expect(run1).toEqual(run2);
    });
  });

  describe('4. Referral API & Access Control', () => {
    let createdReferralId;

    it('POST /api/referrals/recommend allows doctor to generate and persist draft referral', async () => {
      const res = await request(app)
        .post('/api/referrals/recommend')
        .set('Authorization', `Bearer ${doctorToken1}`)
        .send({
          patientName: 'Test Referral Patient',
          requiredSpecialty: 'Cardiology',
          urgency: 'emergency',
          requiredEquipment: ['ventilators'],
          requiredBedType: 'icu',
          patientLocation: { latitude: 11.0168, longitude: 76.9558 },
          preferredScheme: 'CMCHIS',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');
      expect(res.body.recommendations).toBeDefined();
      expect(res.body.recommendations.length).toBeGreaterThan(0);
      createdReferralId = res.body.referralDbId;
    });

    it('GET /api/referrals/:id allows creating doctor to view referral with clinical scores', async () => {
      const res = await request(app)
        .get(`/api/referrals/${createdReferralId}`)
        .set('Authorization', `Bearer ${doctorToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.referral.status).toBe('draft');
      expect(res.body.referral.candidates).toBeDefined();
    });

    it('GET /api/referrals/:id denies access to other doctors (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/referrals/${createdReferralId}`)
        .set('Authorization', `Bearer ${doctorToken2}`); // Doctor 2

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('PATCH /api/referrals/:id/review allows creating doctor to select hospital and update status to "reviewed"', async () => {
      const res = await request(app)
        .patch(`/api/referrals/${createdReferralId}/review`)
        .set('Authorization', `Bearer ${doctorToken1}`)
        .send({
          selectedHospitalId: hospTier1._id,
          notes: 'Clinician confirmed ICU ventilator capacity by phone.',
          newStatus: 'reviewed',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('reviewed');
      expect(res.body.clinicianReview.notes).toContain('confirmed ICU ventilator capacity');
    });

    it('hospital_admin CANNOT submit capacity for another hospital', async () => {
      const res = await request(app)
        .put(`/api/hospitals/${hospTier2._id}/capacity`) // Hospital 2 owned by adminUser2
        .set('Authorization', `Bearer ${adminToken1}`) // adminUser1
        .send({
          beds: { icu: { available: 5 } },
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Security Policy Violation');
    });
  });
});
