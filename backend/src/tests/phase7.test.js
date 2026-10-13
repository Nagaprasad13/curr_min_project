const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const Referral = require('../models/Referral');
const ConditionSpecialtyMap = require('../models/ConditionSpecialtyMap');
const { signToken } = require('../config/jwt');

describe('Phase 7: Hardening, Latency Benchmarks, IDOR Sweep & Final Integration', () => {
  let doctorToken;
  let patientToken;
  let reviewerToken;
  let adminToken;
  let testHospital;
  let testReferral;
  let testConditionMap;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();

    testHospital = await Hospital.create({
      name: 'Phase 7 Memorial Hospital',
      code: 'HOSP-P7-001',
      registrationNumber: 'CEA-TN-2026-P7',
      district: 'Salem',
      tier: 'Tier 2',
      verificationStatus: 'verified',
      location: { latitude: 11.6643, longitude: 78.146 },
      specialties: ['Pulmonology', 'Cardiology'],
      bedCounts: { general: 50, emergency: 10, icu: 10 },
      equipment: { ventilators: { available: true, count: 5 } },
      isSynthetic: true,
    });

    const docUser = await User.create({
      name: 'Dr. Phase 7 Pulmonologist',
      email: 'doctor.p7@carebridge.test',
      password: 'DoctorPassword123!',
      role: 'doctor',
      hospitalId: testHospital._id,
      district: 'Salem',
      isSynthetic: true,
    });
    doctorToken = signToken({ id: docUser._id, email: docUser.email, role: 'doctor', hospitalId: testHospital._id });

    const patUser = await User.create({
      name: 'Patient Phase 7',
      email: 'patient.p7@carebridge.test',
      password: 'PatientPassword123!',
      role: 'patient',
      district: 'Salem',
      isSynthetic: true,
    });
    patientToken = signToken({ id: patUser._id, email: patUser.email, role: 'patient' });

    const revUser = await User.create({
      name: 'Reviewer Phase 7',
      email: 'reviewer.p7@carebridge.test',
      password: 'ReviewerPassword123!',
      role: 'platform_reviewer',
      isSynthetic: true,
    });
    reviewerToken = signToken({ id: revUser._id, email: revUser.email, role: 'platform_reviewer' });

    const admUser = await User.create({
      name: 'Admin Phase 7',
      email: 'admin.p7@carebridge.test',
      password: 'AdminPassword123!',
      role: 'hospital_admin',
      hospitalId: testHospital._id,
      isSynthetic: true,
    });
    adminToken = signToken({ id: admUser._id, email: admUser.email, role: 'hospital_admin', hospitalId: testHospital._id });

    testReferral = await Referral.create({
      referralId: 'REF-P7-0001',
      patientId: patUser._id,
      patientName: 'Patient Phase 7',
      referringDoctorId: docUser._id,
      referringHospitalId: testHospital._id,
      requirements: {
        requiredSpecialty: 'Pulmonology',
        urgency: 'urgent',
        patientCoordinates: { latitude: 11.6643, longitude: 78.146, district: 'Salem' },
      },
      status: 'submitted',
      clinicalDisclaimerAcknowledged: true,
      decisionSupportDisclaimer: 'Decision support only. A clinician must review.',
      isSynthetic: true,
    });

    testConditionMap = await ConditionSpecialtyMap.create({
      condition_id: 'COND-P7-TEST',
      name: 'Phase 7 Test Condition',
      icd10_code: 'Z99.9',
      primary_specialty: 'Pulmonology',
      status: 'PENDING CLINICIAN REVIEW',
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // ---------------------------------------------------------------------------
  // 1. Security Headers & Payload Sanitization
  // ---------------------------------------------------------------------------
  describe('Security Hardening & Defense-in-Depth', () => {
    test('Response includes Helmet security headers', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options'] || res.headers['x-dns-prefetch-control']).toBeDefined();
    });

    test('NoSQL operator injection in request body is stripped', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: { $ne: null }, // Malicious NoSQL operator
          password: 'Password123!',
        });
      // Should be rejected as Bad Request due to stripped/missing string email
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });

    test('Strict payload limit rejects payloads exceeding 100kb', async () => {
      const hugeString = 'A'.repeat(120 * 1024); // 120 KB
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ data: hugeString });
      expect([413, 500]).toContain(res.status); // 413 Payload Too Large
    });
  });

  // ---------------------------------------------------------------------------
  // 2. IDOR Sweep
  // ---------------------------------------------------------------------------
  describe('IDOR Sweep & Constant 404 Error Indistinguishability', () => {
    test('Forbidden referral query vs non-existent referral query return identical 404 response', async () => {
      // Create another patient who doesn't own testReferral
      const strangerUser = await User.create({
        name: 'Stranger Patient',
        email: 'stranger@carebridge.test',
        password: 'Password123!',
        role: 'patient',
        isSynthetic: true,
      });
      const strangerToken = signToken({ id: strangerUser._id, role: 'patient' });

      // Query real referral that belongs to someone else
      const forbiddenRes = await request(app)
        .get(`/api/referrals/${testReferral._id}`)
        .set('Authorization', `Bearer ${strangerToken}`);

      // Query non-existent referral ID
      const fakeId = new mongoose.Types.ObjectId();
      const nonExistentRes = await request(app)
        .get(`/api/referrals/${fakeId}`)
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(forbiddenRes.status).toBe(404);
      expect(nonExistentRes.status).toBe(404);
      expect(forbiddenRes.body).toEqual(nonExistentRes.body);
      expect(forbiddenRes.body.error).toBe('Not Found');
      expect(forbiddenRes.body.message).toBe('Referral document not found or access denied.');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ConditionSpecialtyMap Reviewer Sign-off
  // ---------------------------------------------------------------------------
  describe('ConditionSpecialtyMap Platform Reviewer Workflow', () => {
    test('Reviewer can review and sign off on condition mapping', async () => {
      const res = await request(app)
        .patch(`/api/specialty-map/${testConditionMap._id}`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({
          status: 'REVIEWED_ACCEPTED',
          escalation_rules: 'Validated golden hour protocol for acute pulmonary failure.',
          notes: 'Clinician reviewer protocol audit passed.',
        });

      expect(res.status).toBe(200);
      expect(res.body.mapping.status).toBe('REVIEWED_ACCEPTED');
      expect(res.body.mapping.escalation_rules).toContain('Validated golden hour');
    });

    test('Non-reviewer (doctor) is blocked from signing off specialty map', async () => {
      const res = await request(app)
        .patch(`/api/specialty-map/${testConditionMap._id}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'REVIEWED_ACCEPTED' });

      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Incomplete Assessment Fallback
  // ---------------------------------------------------------------------------
  describe('Clinical Intake Safety & Incomplete Input Handling', () => {
    test('Incomplete vitals intake produces informative fallback without forced prediction', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ age: 60, gender: 'F' }); // Missing vitals

      expect(res.status).toBe(200);
      expect(res.body.urgency).toBeDefined();
      expect(res.body.notice || res.body.disclaimer).toContain('Decision support only');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Latency Benchmarks (Reported as Measurements, Not Claims)
  // ---------------------------------------------------------------------------
  describe('Performance Measurements (Median & p95 Latency)', () => {
    test('Measures latency for /api/referrals/recommend over 20 iterations', async () => {
      const latencies = [];
      const payload = {
        requiredSpecialty: 'Pulmonology',
        urgency: 'urgent',
        requiredEquipment: ['ventilators'],
        patientLocation: { latitude: 11.6643, longitude: 78.146 },
        capacityMode: 'unknown_aware',
      };

      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        const res = await request(app)
          .post('/api/referrals/recommend')
          .set('Authorization', `Bearer ${doctorToken}`)
          .send(payload);
        const duration = Date.now() - start;
        expect([200, 201]).toContain(res.status);
        latencies.push(duration);
      }

      latencies.sort((a, b) => a - b);
      const median = latencies[Math.floor(latencies.length / 2)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      console.log(`\n[Performance Measurement]: /api/referrals/recommend (N=20)`);
      console.log(` - Median Latency: ${median} ms`);
      console.log(` - 95th Percentile (p95): ${p95} ms`);

      expect(median).toBeLessThan(1000); // Sanity check that local computation finishes under 1s
    });

    test('Measures latency for /api/referrals/assess over 20 iterations', async () => {
      const latencies = [];
      const payload = {
        age: 55,
        gender: 'M',
        vitals: { heart_rate: 110, respiratory_rate: 26, systolic_bp: 95, spo2: 90, temperature: 38.5 },
        chief_complaint: 'Shortness of breath',
      };

      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        const res = await request(app)
          .post('/api/referrals/assess')
          .set('Authorization', `Bearer ${doctorToken}`)
          .send(payload);
        const duration = Date.now() - start;
        expect(res.status).toBe(200);
        latencies.push(duration);
      }

      latencies.sort((a, b) => a - b);
      const median = latencies[Math.floor(latencies.length / 2)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      console.log(`\n[Performance Measurement]: /api/referrals/assess (N=20)`);
      console.log(` - Median Latency: ${median} ms`);
      console.log(` - 95th Percentile (p95): ${p95} ms`);

      expect(median).toBeLessThan(1500);
    });
  });
});
