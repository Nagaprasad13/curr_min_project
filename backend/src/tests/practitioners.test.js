const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const Practitioner = require('../models/Practitioner');
const AuditLog = require('../models/AuditLog');
const { signToken } = require('../config/jwt');
const { deriveHospitalSpecialists, syncHospitalSpecialists } = require('../services/practitionerService');
const { checkDataConsistency } = require('../scripts/checkDataConsistency');

describe('Phase 8.2: Doctors, Staff and Specialist Data Tests', () => {
  let testHospital;
  let adminUser;
  let adminToken;
  let reviewerUser;
  let reviewerToken;
  let doctorUser;
  let doctorToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();

    testHospital = await Hospital.create({
      name: 'Practitioner Test Hospital',
      code: 'HOSP-PRAC-001',
      registrationNumber: 'CEA-TN-2026-PRAC',
      district: 'Salem',
      tier: 'Tier 2',
      verificationStatus: 'verified',
      location: { latitude: 11.6643, longitude: 78.146 },
      has24x7Emergency: true,
      equipment: {
        ventilators: { available: true, count: 5 },
        lab: { available: true },
        xray: { available: true, count: 2 },
        ultrasound: { available: true, count: 2 },
        operationTheatres: { available: true, count: 2 },
      },
      bedCounts: { general: 60, emergency: 10, icu: 10 },
      specialties: ['Pulmonology', 'Cardiology', 'General Surgery'],
      isSynthetic: true,
    });

    adminUser = await User.create({
      name: 'Admin Kovai',
      email: 'admin.prac@carebridge.test',
      password: 'AdminPassword123!',
      role: 'hospital_admin',
      hospitalId: testHospital._id,
      isSynthetic: true,
    });
    adminToken = signToken({ id: adminUser._id, email: adminUser.email, role: adminUser.role, hospitalId: testHospital._id });

    // Link admin user to hospital
    testHospital.adminUserId = adminUser._id;
    await testHospital.save();

    reviewerUser = await User.create({
      name: 'Auditor Reviewer',
      email: 'reviewer.prac@carebridge.test',
      password: 'ReviewerPassword123!',
      role: 'platform_reviewer',
      isSynthetic: true,
    });
    reviewerToken = signToken({ id: reviewerUser._id, email: reviewerUser.email, role: reviewerUser.role });

    doctorUser = await User.create({
      name: 'Doctor Referring',
      email: 'doctor.prac@carebridge.test',
      password: 'DoctorPassword123!',
      role: 'doctor',
      hospitalId: testHospital._id,
      isSynthetic: true,
    });
    doctorToken = signToken({ id: doctorUser._id, email: doctorUser.email, role: doctorUser.role });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Practitioner Addition and Verification Boundaries', () => {
    let createdPractitionerId;

    it('allows hospital admin to register a practitioner (starts as pending_verification)', async () => {
      const res = await request(app)
        .post(`/api/hospitals/${testHospital._id}/practitioners`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Dr. M. Senthil, MD',
          qualification: 'MBBS, MD (Pulmonology)',
          specialty: 'Pulmonology',
          registrationNumber: 'SYN-TNC-1001',
          availability: 'on_call_24x7',
        });

      expect(res.status).toBe(201);
      expect(res.body.practitioner.verificationStatus).toBe('pending_verification');
      expect(res.body.practitioner.hospitalId).toBe(testHospital._id.toString());
      expect(res.body.practitioner.registrationNumber).toMatch(/^SYN-TNC-\d{4,}$/);
      expect(res.body.practitioner.isSynthetic).toBe(true);
      createdPractitionerId = res.body.practitioner.practitionerId;
    });

    it('excludes pending_verification practitioners from derived hospital specialists', async () => {
      const derived = await deriveHospitalSpecialists(testHospital._id);
      const pulmonology = derived.find(s => s.specialty === 'Pulmonology');
      expect(pulmonology).toBeUndefined(); // Since pending_verification is excluded!
    });

    it('PREVENTS hospital admin from self-verifying a practitioner (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/hospitals/${testHospital._id}/practitioners/${createdPractitionerId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          verificationStatus: 'verified',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/only platform reviewers possess administrative authority/i);
    });

    it('allows platform_reviewer to verify practitioner credentials', async () => {
      const res = await request(app)
        .patch(`/api/hospitals/${testHospital._id}/practitioners/${createdPractitionerId}/status`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({
          verificationStatus: 'verified',
        });

      expect(res.status).toBe(200);
      expect(res.body.practitioner.verificationStatus).toBe('verified');
      expect(res.body.derivedSpecialists.find(s => s.specialty === 'Pulmonology').count).toBe(1);
    });
  });

  describe('2. Derived Specialist Counts & Inactive Exclusions', () => {
    let secondPractitionerId;

    beforeAll(async () => {
      // Add second pulmonologist
      const prac = await Practitioner.create({
        practitionerId: 'PRAC-2026-99002',
        hospitalId: testHospital._id,
        fullName: 'Dr. K. Aravind, DNB',
        qualification: 'MBBS, DNB (Pulmonology)',
        specialty: 'Pulmonology',
        registrationNumber: 'SYN-TNC-1002',
        employmentStatus: 'active',
        availability: 'on_call_24x7',
        verificationStatus: 'verified',
        isSynthetic: true,
      });
      secondPractitionerId = prac.practitionerId;
    });

    it('aggregates count of multiple verified active specialists', async () => {
      const derived = await deriveHospitalSpecialists(testHospital._id);
      const pulmo = derived.find(s => s.specialty === 'Pulmonology');
      expect(pulmo.count).toBe(2);
      expect(pulmo.onCall24x7).toBe(true);
    });

    it('excludes practitioner when employmentStatus changes to on_leave and decrements count', async () => {
      const res = await request(app)
        .patch(`/api/hospitals/${testHospital._id}/practitioners/${secondPractitionerId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employmentStatus: 'on_leave',
        });

      expect(res.status).toBe(200);
      expect(res.body.practitioner.employmentStatus).toBe('on_leave');

      const derived = await deriveHospitalSpecialists(testHospital._id);
      const pulmo = derived.find(s => s.specialty === 'Pulmonology');
      expect(pulmo.count).toBe(1); // Dropped from 2 to 1!
    });
  });

  describe('3. Tier Re-evaluation and Audit Logging on Staff Roster Changes', () => {
    it('triggers tier re-evaluation and records immutable audit log on practitioner update', async () => {
      const syncResult = await syncHospitalSpecialists(testHospital._id, reviewerUser);
      expect(syncResult.hospital.specialists).toBeDefined();

      const auditEntries = await AuditLog.find({
        resourceId: testHospital._id.toString(),
      });
      expect(auditEntries.length).toBeGreaterThan(0);
    });
  });

  describe('4. Data Consistency Verification', () => {
    it('seeds full consistency and passes checkDataConsistency audit', async () => {
      // Create active verified practitioners for all claimed specialties
      await Practitioner.create([
        {
          practitionerId: 'PRAC-2026-99003',
          hospitalId: testHospital._id,
          fullName: 'Dr. C. Cardiologist',
          qualification: 'MBBS, DM',
          specialty: 'Cardiology',
          registrationNumber: 'SYN-TNC-1003',
          employmentStatus: 'active',
          verificationStatus: 'verified',
          isSynthetic: true,
        },
        {
          practitionerId: 'PRAC-2026-99004',
          hospitalId: testHospital._id,
          fullName: 'Dr. G. Surgeon',
          qualification: 'MBBS, MS',
          specialty: 'General Surgery',
          registrationNumber: 'SYN-TNC-1004',
          employmentStatus: 'active',
          verificationStatus: 'verified',
          isSynthetic: true,
        },
      ]);

      const auditResult = await checkDataConsistency();
      expect(auditResult.passed).toBe(true);
      expect(auditResult.inconsistencies.length).toBe(0);
      expect(auditResult.unlistedPractitioners.length).toBe(0);
    });

    it('fails checkDataConsistency when an orphan specialty exists with 0 active verified practitioners (negative test)', async () => {
      // Hospital claims Nephrology without having any Nephrology practitioners
      await Hospital.findByIdAndUpdate(testHospital._id, { $addToSet: { specialties: 'Nephrology' } });

      const auditResult = await checkDataConsistency();
      expect(auditResult.passed).toBe(false);
      expect(auditResult.inconsistencies.length).toBeGreaterThan(0);
      expect(auditResult.inconsistencies.some(i => i.claimedSpecialty === 'Nephrology')).toBe(true);

      // Revert hospital specialties to clean state
      await Hospital.findByIdAndUpdate(testHospital._id, { $pull: { specialties: 'Nephrology' } });
    });

    it('fails checkDataConsistency when an active verified practitioner has an unlisted specialty (reverse check negative test)', async () => {
      // Create an active verified practitioner in 'Medical Oncology', which is NOT listed in testHospital.specialties
      const unlistedDoctor = await Practitioner.create({
        practitionerId: 'PRAC-2026-99099',
        hospitalId: testHospital._id,
        fullName: 'Dr. R. Rogue Oncologist',
        qualification: 'MBBS, DM (Medical Oncology)',
        specialty: 'Medical Oncology',
        registrationNumber: 'SYN-TNC-9999',
        employmentStatus: 'active',
        verificationStatus: 'verified',
        isSynthetic: true,
      });

      const auditResult = await checkDataConsistency();
      expect(auditResult.passed).toBe(false);
      expect(auditResult.unlistedPractitioners.length).toBeGreaterThan(0);
      expect(auditResult.unlistedPractitioners.some(u => u.practitionerSpecialty === 'Medical Oncology')).toBe(true);

      // Clean up rogue practitioner
      await Practitioner.deleteOne({ _id: unlistedDoctor._id });

      // Verify that after cleanup, consistency passes again
      const restoredResult = await checkDataConsistency();
      expect(restoredResult.passed).toBe(true);
      expect(restoredResult.inconsistencies.length).toBe(0);
      expect(restoredResult.unlistedPractitioners.length).toBe(0);
    });
  });
});
