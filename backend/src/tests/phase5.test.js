const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const Hospital = require('../models/Hospital');
const HospitalCapacity = require('../models/HospitalCapacity');
const Referral = require('../models/Referral');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { signToken } = require('../config/jwt');
const {
  createFallbackAssessment,
  evaluateRedFlagsFallback,
  MANDATORY_DISCLAIMER,
} = require('../services/mlTriageService');

jest.setTimeout(30000);

describe('Phase 5: ML Triage & Condition Screening Integration', () => {
  let doctorUser, patientUser, adminUser;
  let doctorToken, patientToken, adminToken;
  let tertiaryHospital, districtHospital;

  beforeAll(async () => {
    await connectDB();
    await Hospital.deleteMany({});
    await HospitalCapacity.deleteMany({});
    await Referral.deleteMany({});
    await User.deleteMany({});
    await AuditLog.deleteMany({});

    // Create test hospitals
    tertiaryHospital = await new Hospital({
      name: 'Chennai Government Multi Super Speciality Hospital',
      code: 'CHN-TERT-001',
      district: 'Chennai',
      address: 'Omandurar Government Estate, Chennai',
      location: { latitude: 13.0700, longitude: 80.2700 },
      proposedTier: 'Tier 1',
      effectiveTier: 'Tier 1',
      verificationStatus: 'verified',
      capabilities: {
        specialtiesOffered: ['Cardiology', 'Nephrology', 'Endocrinology', 'General Medicine'],
        equipment: ['ecg', 'echo', 'cathLab', 'dialysisUnit', 'ct', 'mri'],
        bedCapacity: { generalBeds: 400, emergencyBeds: 50, icuBeds: 60 },
        emergencyAvailable24x7: true,
      },
      schemesSupported: ['CMCHIS', 'PM-JAY'],
      isSynthetic: true,
    }).save();

    districtHospital = await new Hospital({
      name: 'Kanchipuram District Hospital',
      code: 'KAN-DIST-002',
      district: 'Kanchipuram',
      address: 'Hospital Road, Kanchipuram',
      location: { latitude: 12.8342, longitude: 79.7036 },
      proposedTier: 'Tier 2',
      effectiveTier: 'Tier 2',
      verificationStatus: 'verified',
      capabilities: {
        specialtiesOffered: ['General Medicine'],
        equipment: ['ecg'],
        bedCapacity: { generalBeds: 150, emergencyBeds: 15, icuBeds: 10 },
        emergencyAvailable24x7: true,
      },
      schemesSupported: ['CMCHIS'],
      isSynthetic: true,
    }).save();

    // Capacity telemetry
    await new HospitalCapacity({
      hospitalId: tertiaryHospital._id,
      hospitalCode: tertiaryHospital.code,
      reportedAt: new Date(),
      resources: {
        generalBeds: { status: 'available', availableCount: 25 },
        icuBeds: { status: 'available', availableCount: 8 },
        emergencyBeds: { status: 'available', availableCount: 12 },
        specialistsOnCall: [
          { specialty: 'Cardiology', onDuty: true, presentInHospital: true },
          { specialty: 'Nephrology', onDuty: true, presentInHospital: true },
        ],
      },
      isSynthetic: true,
    }).save();

    await new HospitalCapacity({
      hospitalId: districtHospital._id,
      hospitalCode: districtHospital.code,
      reportedAt: new Date(),
      resources: {
        generalBeds: { status: 'available', availableCount: 10 },
        emergencyBeds: { status: 'available', availableCount: 3 },
        specialistsOnCall: [
          { specialty: 'General Medicine', onDuty: true, presentInHospital: true },
        ],
      },
      isSynthetic: true,
    }).save();

    // Users
    doctorUser = await new User({
      name: 'Dr. Anand Ramanathan',
      email: 'dr.anand@test.synthetic',
      password: 'Password123!',
      role: 'doctor',
      hospitalId: districtHospital._id,
    }).save();
    doctorToken = signToken({ id: doctorUser._id, role: doctorUser.role, email: doctorUser.email });

    patientUser = await new User({
      name: 'Patient K. Selvam',
      email: 'patient.selvam@test.synthetic',
      password: 'Password123!',
      role: 'patient',
    }).save();
    patientToken = signToken({ id: patientUser._id, role: patientUser.role, email: patientUser.email });

    adminUser = await new User({
      name: 'Admin Ramesh',
      email: 'admin.ramesh@test.synthetic',
      password: 'Password123!',
      role: 'hospital_admin',
      hospitalId: tertiaryHospital._id,
    }).save();
    adminToken = signToken({ id: adminUser._id, role: adminUser.role, email: adminUser.email });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // ---------------------------------------------------------------------------
  // 1. Role-Based Access Control
  // ---------------------------------------------------------------------------
  describe('1. Role-Based Access Control for Clinical Decision Support', () => {
    it('allows a doctor to invoke POST /api/referrals/assess', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          age: 55,
          gender: 'M',
          sbp: 130,
          dbp: 85,
          heartrate: 78,
          resprate: 16,
          o2sat: 98,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('urgency');
      expect(res.body).toHaveProperty('specialties');
      expect(res.body).toHaveProperty('disclaimer');
      expect(res.body.disclaimer).toContain('Decision support only');
    });

    it('denies unauthenticated requests to /api/referrals/assess with 401', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .send({ age: 45 });

      expect(res.status).toBe(401);
    });

    it('denies patient role from invoking /api/referrals/assess with 403', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ age: 45 });

      expect(res.status).toBe(403);
    });

    it('denies hospital_admin role from invoking /api/referrals/assess with 403', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ age: 45 });

      expect(res.status).toBe(403);
    });

    it('allows a doctor to invoke POST /api/referrals/predict-severity', async () => {
      const res = await request(app)
        .post('/api/referrals/predict-severity')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          age: 62,
          gender: 'M',
          heartrate: 110,
          resprate: 24,
          o2sat: 91,
          sbp: 160,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('riskCategory');
      expect(res.body).toHaveProperty('riskScore');
      expect(res.body).toHaveProperty('notice');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Clinical Red Flag Detection & Urgency Escalation
  // ---------------------------------------------------------------------------
  describe('2. Clinical Red Flags & Mandatory Emergency Escalation', () => {
    it('escalates to emergency upon hypertensive crisis (SBP >= 180 and DBP >= 120)', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          age: 58,
          gender: 'M',
          sbp: 195,
          dbp: 125,
          heartrate: 96,
          resprate: 18,
          o2sat: 96,
        });

      expect(res.status).toBe(200);
      expect(res.body.urgency).toBe('emergency');
      const hypertensiveFlag = res.body.red_flags.find(f => f.flag === 'HYPERTENSIVE_CRISIS');
      expect(hypertensiveFlag).toBeDefined();
      expect(hypertensiveFlag.severity).toBe('emergency');
      expect(hypertensiveFlag.guideline).toContain('ACC/AHA');
    });

    it('escalates to emergency upon acute stroke signs regardless of other parameters', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          age: 64,
          gender: 'F',
          stroke_signs: true,
          sbp: 140,
          dbp: 85,
          heartrate: 72,
          resprate: 16,
          o2sat: 99,
        });

      expect(res.status).toBe(200);
      expect(res.body.urgency).toBe('emergency');
      const strokeFlag = res.body.red_flags.find(f => f.flag === 'ACUTE_STROKE_SYMPTOMS');
      expect(strokeFlag).toBeDefined();
    });

    it('escalates to emergency upon hemodynamically unstable chest pain (hypotension + chest pain)', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          age: 60,
          gender: 'M',
          chest_pain: true,
          sbp: 82,
          dbp: 50,
          heartrate: 115,
        });

      expect(res.status).toBe(200);
      expect(res.body.urgency).toBe('emergency');
      const chestFlag = res.body.red_flags.find(f => f.flag === 'HEMODYNAMICALLY_UNSTABLE_CHEST_PAIN');
      expect(chestFlag).toBeDefined();
    });

    it('escalates to emergency upon severe hypoxemia (SpO2 < 88%)', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          age: 50,
          o2sat: 84,
          resprate: 28,
        });

      expect(res.status).toBe(200);
      expect(res.body.urgency).toBe('emergency');
      const o2Flag = res.body.red_flags.find(f => f.flag === 'SEVERE_HYPOXEMIA');
      expect(o2Flag).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Condition Screening & Specialty Facility Mapping
  // ---------------------------------------------------------------------------
  describe('3. Condition Screening & Specialty/Equipment Mapping', () => {
    it('flags renal abnormality (elevated creatinine) and maps to Nephrology with dialysis unit', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          age: 54,
          gender: 'M',
          sc: 3.2,
          bu: 65,
          sbp: 135,
          dbp: 85,
        });

      expect(res.status).toBe(200);
      expect(res.body.specialties).toContain('Nephrology');
      expect(res.body.required_facilities).toContain('dialysisUnit');
      const ckdRisk = res.body.condition_risks.find(r => r.specialty === 'Nephrology');
      expect(ckdRisk).toBeDefined();
      expect(ckdRisk.flagged).toBe(true);
    });

    it('flags cardiac presentation and maps to Cardiology with ECG, Echo, and cathLab', async () => {
      const res = await request(app)
        .post('/api/referrals/assess')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          age: 58,
          gender: 'M',
          chest_pain: true,
          sbp: 140,
          dbp: 90,
          heartrate: 88,
          chol: 260,
        });

      expect(res.status).toBe(200);
      expect(res.body.specialties).toContain('Cardiology');
      expect(res.body.required_facilities).toContain('ecg');
      expect(res.body.required_facilities).toContain('cathLab');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Doctor Confirmation & Urgency Override Tracking
  // ---------------------------------------------------------------------------
  describe('4. Doctor Confirmation & Urgency Override Tracking', () => {
    it('records doctor override in Referral document and triggers audit log', async () => {
      const initialLogsCount = await AuditLog.countDocuments({ action: 'OVERRIDE_MODEL_URGENCY' });

      const res = await request(app)
        .post('/api/referrals/recommend')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientName: 'K. Selvam (Synthetic)',
          requiredSpecialty: 'Cardiology',
          urgency: 'urgent', // Doctor selected urgent
          modelSuggestedUrgency: 'emergency', // Model suggested emergency
          urgencyConfirmedByDoctor: true,
          urgencyOverrideReason: 'Patient stabilized in emergency observation; no active ischemic changes on serial ECG.',
          requiredEquipment: ['ecg', 'cathLab'],
          patientLocation: { latitude: 12.8342, longitude: 79.7036 },
          capacityMode: 'unknown_aware',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('referralId');

      // Verify Referral DB persistence
      const savedReferral = await Referral.findOne({ referralId: res.body.referralId });
      expect(savedReferral).not.toBeNull();
      expect(savedReferral.requirements.urgency).toBe('urgent');
      expect(savedReferral.requirements.modelSuggestedUrgency).toBe('emergency');
      expect(savedReferral.requirements.urgencyConfirmedByDoctor).toBe(true);
      expect(savedReferral.requirements.urgencyOverrideReason).toContain('Patient stabilized');

      // Verify Audit Log entry
      const postLogsCount = await AuditLog.countDocuments({ action: 'OVERRIDE_MODEL_URGENCY' });
      expect(postLogsCount).toBe(initialLogsCount + 1);

      const overrideLog = await AuditLog.findOne({ action: 'OVERRIDE_MODEL_URGENCY', resourceId: savedReferral._id.toString() });
      expect(overrideLog).not.toBeNull();
      expect(overrideLog.meta.modelSuggestedUrgency).toBe('emergency');
      expect(overrideLog.meta.selectedUrgency).toBe('urgent');
      expect(overrideLog.meta.hasOverrideReason).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Audit Log Privacy Protection (No Raw PHI)
  // ---------------------------------------------------------------------------
  describe('5. Audit Log Privacy Protection (No Raw PHI)', () => {
    it('verifies ASSESS_TRIAGE_SEVERITY audit logs contain summary metadata without raw PHI', async () => {
      const assessLog = await AuditLog.findOne({ action: 'ASSESS_TRIAGE_SEVERITY' }).sort({ timestamp: -1 });
      expect(assessLog).not.toBeNull();

      // Ensure meta does NOT contain raw patient identifiers or medical values
      expect(assessLog.meta).toHaveProperty('urgency');
      expect(assessLog.meta).toHaveProperty('specialties');
      expect(assessLog.meta).toHaveProperty('redFlagCount');
      expect(assessLog.meta).toHaveProperty('conditionsEvaluated');

      // PHI checks
      expect(assessLog.meta).not.toHaveProperty('patientName');
      expect(assessLog.meta).not.toHaveProperty('sbp');
      expect(assessLog.meta).not.toHaveProperty('Glucose');
      expect(assessLog.meta).not.toHaveProperty('sc');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Resilience & Embedded Fallback Unit Tests
  // ---------------------------------------------------------------------------
  describe('6. Fallback Engine Unit Verification', () => {
    it('generates consistent structured output from createFallbackAssessment', () => {
      const fallbackResult = createFallbackAssessment({
        age: 60,
        hemo: 7.2,
        sbp: 145,
        dbp: 92,
      }, 'Test fallback triggered');

      expect(fallbackResult.status).toBe('success');
      expect(fallbackResult.serviceFallback).toBe(true);
      expect(fallbackResult.fallbackReason).toBe('Test fallback triggered');
      expect(fallbackResult.disclaimer).toBe(MANDATORY_DISCLAIMER);
      expect(fallbackResult.specialties).toContain('General Medicine');
      expect(fallbackResult.condition_risks.length).toBeGreaterThan(0);
    });

    it('correctly evaluates all red flags via evaluateRedFlagsFallback', () => {
      const flags = evaluateRedFlagsFallback({
        sbp: 200,
        dbp: 130,
        stroke_signs: true,
        o2sat: 82,
      });

      expect(flags.length).toBe(3);
      const flagNames = flags.map(f => f.flag);
      expect(flagNames).toContain('HYPERTENSIVE_CRISIS');
      expect(flagNames).toContain('ACUTE_STROKE_SYMPTOMS');
      expect(flagNames).toContain('SEVERE_HYPOXEMIA');
    });
  });
});
