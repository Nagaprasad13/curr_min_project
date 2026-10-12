const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const { signToken } = require('../config/jwt');
const { classifyHospitalTier } = require('../services/tierClassificationService');
const { performVerificationConsistencyChecks } = require('../services/verificationService');

jest.setTimeout(30000);

describe('Phase 2: Hospital Registration, Verification Workflow & Rule-Based Tiering', () => {
  let adminUser1, adminUser2, reviewerUser, doctorUser, patientUser;
  let adminToken1, adminToken2, reviewerToken, doctorToken, patientToken;
  let hospital1, hospital2;

  beforeAll(async () => {
    await connectDB();
    await Hospital.deleteMany({});
    await User.deleteMany({});

    // Create test users for all distinct roles
    adminUser1 = await new User({
      name: 'Admin Hospital One',
      email: 'admin1@test.synthetic',
      password: 'Password123!',
      role: 'hospital_admin',
    }).save();
    adminToken1 = signToken({ id: adminUser1._id, role: adminUser1.role, email: adminUser1.email });

    adminUser2 = await new User({
      name: 'Admin Hospital Two',
      email: 'admin2@test.synthetic',
      password: 'Password123!',
      role: 'hospital_admin',
    }).save();
    adminToken2 = signToken({ id: adminUser2._id, role: adminUser2.role, email: adminUser2.email });

    reviewerUser = await new User({
      name: 'Platform Reviewer User',
      email: 'reviewer@test.synthetic',
      password: 'Password123!',
      role: 'platform_reviewer',
    }).save();
    reviewerToken = signToken({ id: reviewerUser._id, role: reviewerUser.role, email: reviewerUser.email });

    doctorUser = await new User({
      name: 'Doctor User',
      email: 'doctor@test.synthetic',
      password: 'Password123!',
      role: 'doctor',
    }).save();
    doctorToken = signToken({ id: doctorUser._id, role: doctorUser.role, email: doctorUser.email });

    patientUser = await new User({
      name: 'Patient User',
      email: 'patient@test.synthetic',
      password: 'Password123!',
      role: 'patient',
    }).save();
    patientToken = signToken({ id: patientUser._id, role: patientUser.role, email: patientUser.email });

    // Seed Hospital 1 owned by adminUser1
    hospital1 = await new Hospital({
      name: 'Synthetic Kovai Apex Super Specialty Hospital',
      code: 'HOSP-P2-001',
      registrationNumber: 'CEA-TN-2026-901',
      adminUserId: adminUser1._id,
      district: 'Coimbatore',
      location: { latitude: 11.0168, longitude: 76.9558 },
      ownership: 'private_corporate',
      has24x7Emergency: true,
      verificationStatus: 'verified',
      tier: 'Tier 1',
      proposedTier: 'Tier 1',
      tierStatus: 'confirmed',
      specialties: ['Cardiology', 'Pulmonology', 'Neurology', 'Nephrology', 'Medical Oncology', 'Emergency Medicine', 'Pediatrics', 'General Surgery'],
      departments: ['Cardiology', 'Radiology', 'Emergency Medicine'],
      equipment: {
        ventilators: { available: true, count: 18 },
        ctScan: { available: true, count: 2 },
        mri: { available: true, count: 1 },
        xray: { available: true, count: 3 },
        ultrasound: { available: true, count: 2 },
        operationTheatres: { available: true, count: 5 },
        lab: { available: true, level: 'advanced' },
      },
      bedCounts: { general: 300, emergency: 30, icu: 35 },
      evidenceDocuments: [{
        type: 'hospital_license',
        fileReference: 'storage/evidence/lic_hosp1.pdf',
        originalFileName: 'License_Hosp1.pdf',
      }],
      isSynthetic: true,
    }).save();
    await User.findByIdAndUpdate(adminUser1._id, { hospitalId: hospital1._id });

    // Seed Hospital 2 owned by adminUser2
    hospital2 = await new Hospital({
      name: 'Synthetic Salem Secondary Hospital',
      code: 'HOSP-P2-002',
      registrationNumber: 'CEA-TN-2026-902',
      adminUserId: adminUser2._id,
      district: 'Salem',
      location: { latitude: 11.6643, longitude: 78.1460 },
      ownership: 'government',
      has24x7Emergency: true,
      verificationStatus: 'unverified',
      tier: 'Tier 2',
      proposedTier: 'Tier 2',
      tierStatus: 'unconfirmed',
      specialties: ['General Surgery', 'Pediatrics', 'Emergency Medicine'],
      departments: ['General Surgery', 'Emergency'],
      equipment: {
        ventilators: { available: true, count: 4 },
        xray: { available: true, count: 1 },
        ultrasound: { available: true, count: 1 },
        operationTheatres: { available: true, count: 2 },
        lab: { available: true, level: 'basic' },
      },
      bedCounts: { general: 60, emergency: 10, icu: 8 },
      evidenceDocuments: [{
        type: 'hospital_license',
        fileReference: 'storage/evidence/lic_hosp2.pdf',
        originalFileName: 'License_Hosp2.pdf',
      }],
      isSynthetic: true,
    }).save();
    await User.findByIdAndUpdate(adminUser2._id, { hospitalId: hospital2._id });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Rule-Based Tier Classification Service (Pure & Deterministic)', () => {
    const fullTier1Hospital = {
      has24x7Emergency: true,
      bedCounts: { general: 200, emergency: 30, icu: 20 },
      equipment: {
        ventilators: { available: true, count: 10 },
        ctScan: { available: true, count: 1 },
        mri: { available: true, count: 1 },
        lab: { available: true },
        operationTheatres: { available: true, count: 3 },
      },
      specialties: ['Cardiology', 'Pulmonology', 'Neurology', 'Nephrology', 'Medical Oncology', 'Emergency Medicine', 'Pediatrics', 'General Surgery'],
    };

    it('should classify as Tier 1 when all criteria are satisfied', () => {
      const result = classifyHospitalTier(fullTier1Hospital, true);
      expect(result.proposedTier).toBe('Tier 1');
      expect(result.tierStatus).toBe('confirmed');
      expect(result.gapToNextTier.length).toBe(0);
      expect(result.rulesMissed.length).toBe(0);
    });

    it('boundary test: ICU beds 19 vs 20 for Tier 1', () => {
      // 19 ICU beds fails Tier 1 minIcuBeds (>=20) and drops to Tier 2
      const hosp19Beds = {
        ...fullTier1Hospital,
        bedCounts: { ...fullTier1Hospital.bedCounts, icu: 19 },
        equipment: {
          ...fullTier1Hospital.equipment,
          xray: { available: true, count: 1 },
          ultrasound: { available: true, count: 1 },
        },
      };
      const result19 = classifyHospitalTier(hosp19Beds, true);
      expect(result19.proposedTier).toBe('Tier 2');
      expect(result19.gapToNextTier.some(g => g.includes('minIcuBeds') || g.includes('20'))).toBe(true);

      // 20 ICU beds meets Tier 1
      const hosp20Beds = {
        ...fullTier1Hospital,
        bedCounts: { ...fullTier1Hospital.bedCounts, icu: 20 },
      };
      const result20 = classifyHospitalTier(hosp20Beds, true);
      expect(result20.proposedTier).toBe('Tier 1');
    });

    it('missing equipment case: drops to Tier 2 when MRI is missing', () => {
      const hospNoMri = {
        ...fullTier1Hospital,
        equipment: {
          ...fullTier1Hospital.equipment,
          mri: { available: false, count: 0 },
          xray: { available: true, count: 1 },
          ultrasound: { available: true, count: 1 },
        },
      };
      const result = classifyHospitalTier(hospNoMri, true);
      expect(result.proposedTier).toBe('Tier 2');
      expect(result.gapToNextTier.some(g => g.includes('MRI'))).toBe(true);
    });

    it('should classify as Tier 3 when Tier 2 criteria fail (e.g., no X-ray/Ultrasound)', () => {
      const basicHosp = {
        has24x7Emergency: false,
        bedCounts: { general: 15, emergency: 4, icu: 2 },
        equipment: {
          ventilators: { available: false, count: 0 },
          lab: { available: true },
          xray: { available: false },
          ultrasound: { available: false },
          operationTheatres: { available: false, count: 0 },
        },
        specialties: ['General Medicine'],
      };
      const result = classifyHospitalTier(basicHosp, false);
      expect(result.proposedTier).toBe('Tier 3');
      expect(result.tierStatus).toBe('unconfirmed');
      expect(result.gapToNextTier.length).toBeGreaterThan(0);
    });
  });

  describe('2. Validation & Security Rules', () => {
    it('should reject negative bed counts', async () => {
      const res = await request(app)
        .post('/api/hospitals')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          name: 'Invalid Negative Beds Hospital',
          registrationNumber: 'CEA-TN-ERR-001',
          district: 'Salem',
          location: { latitude: 11.6643, longitude: 78.1460 },
          specialties: ['General Surgery'],
          bedCounts: { general: -5, emergency: 0, icu: 0 },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
      expect(res.body.issues.some(i => i.field.includes('bedCounts.general'))).toBe(true);
    });

    it('should reject when ICU beds exceed total inpatient beds', async () => {
      const res = await request(app)
        .post('/api/hospitals')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          name: 'Invalid ICU Beds Hospital',
          registrationNumber: 'CEA-TN-ERR-002',
          district: 'Coimbatore',
          location: { latitude: 11.0168, longitude: 76.9558 },
          specialties: ['General Surgery'],
          bedCounts: { total: 15, general: 10, emergency: 5, icu: 25 },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
      expect(res.body.issues.some(i => i.field.includes('bedCounts.icu'))).toBe(true);
    });

    it('should reject coordinates outside Tamil Nadu bounds', async () => {
      const res = await request(app)
        .post('/api/hospitals')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          name: 'Out of Bounds Hospital',
          registrationNumber: 'CEA-TN-ERR-004',
          district: 'Salem',
          location: { latitude: 28.6139, longitude: 77.2090 }, // New Delhi coordinates
          specialties: ['General Surgery'],
          bedCounts: { general: 50, emergency: 10, icu: 5 },
        });

      expect(res.status).toBe(400);
      expect(res.body.issues.some(i => i.field.includes('location.latitude'))).toBe(true);
    });

    it('should reject duplicate registration number', async () => {
      const res = await request(app)
        .post('/api/hospitals')
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          name: 'Duplicate Reg Hospital',
          registrationNumber: 'CEA-TN-2026-901', // already used by hospital1
          district: 'Erode',
          location: { latitude: 11.3410, longitude: 77.7172 },
          specialties: ['General Surgery'],
          bedCounts: { general: 50, emergency: 10, icu: 5 },
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Conflict');
    });
  });

  describe('3. Access Control & Ownership Enforcement', () => {
    it('hospital_admin CANNOT edit another hospital (returns 403 Forbidden)', async () => {
      // adminUser1 attempts to edit hospital2 (owned by adminUser2)
      const res = await request(app)
        .put(`/api/hospitals/${hospital2._id}`)
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          name: 'Hacked Name Attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Security Policy Violation');
    });

    it('hospital_admin CAN edit their own hospital', async () => {
      const res = await request(app)
        .put(`/api/hospitals/${hospital1._id}`)
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          address: 'Updated Main Road, Coimbatore',
        });

      expect(res.status).toBe(200);
      expect(res.body.hospital.address).toBe('Updated Main Road, Coimbatore');
    });

    it('only platform_reviewer can verify or reject a hospital (doctor & admin get 403)', async () => {
      const resAdminVerify = await request(app)
        .post(`/api/hospitals/${hospital2._id}/verify`)
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({});
      expect(resAdminVerify.status).toBe(403);

      const resDoctorVerify = await request(app)
        .post(`/api/hospitals/${hospital2._id}/verify`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({});
      expect(resDoctorVerify.status).toBe(403);

      const resReviewerVerify = await request(app)
        .post(`/api/hospitals/${hospital2._id}/verify`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({ reason: 'Audit criteria satisfied' });
      expect(resReviewerVerify.status).toBe(200);
      expect(resReviewerVerify.body.hospital.verificationStatus).toBe('verified');
      expect(resReviewerVerify.body.hospital.tierStatus).toBe('confirmed');
    });

    it('public / patient CANNOT see unverified or rejected hospitals in GET /api/hospitals', async () => {
      // Create an unverified hospital
      const unverifiedHosp = await new Hospital({
        name: 'Hidden Unverified Clinic',
        code: 'HOSP-P2-UNVER',
        registrationNumber: 'CEA-TN-2026-UNV',
        district: 'Madurai',
        location: { latitude: 9.9252, longitude: 78.1198 },
        ownership: 'government',
        verificationStatus: 'unverified',
        tier: 'Tier 3',
        specialties: ['General Medicine'],
        isSynthetic: true,
      }).save();

      // Patient requests hospital list
      const resPatient = await request(app)
        .get('/api/hospitals')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(resPatient.status).toBe(200);
      const hospitalIds = resPatient.body.hospitals.map(h => h._id.toString());
      expect(hospitalIds).not.toContain(unverifiedHosp._id.toString());

      // Direct lookup of unverified hospital by patient is forbidden
      const resDirect = await request(app)
        .get(`/api/hospitals/${unverifiedHosp._id}`)
        .set('Authorization', `Bearer ${patientToken}`);
      expect(resDirect.status).toBe(403);
    });
  });

  describe('4. Verification Workflow & Capability Edit Reset', () => {
    it('editing capability fields on a verified hospital resets verificationStatus to "pending"', async () => {
      // Ensure hospital1 is verified
      await Hospital.findByIdAndUpdate(hospital1._id, { verificationStatus: 'verified', tierStatus: 'confirmed' });

      // Admin updates bed counts
      const res = await request(app)
        .put(`/api/hospitals/${hospital1._id}`)
        .set('Authorization', `Bearer ${adminToken1}`)
        .send({
          bedCounts: { general: 320, emergency: 35, icu: 40 },
        });

      expect(res.status).toBe(200);
      expect(res.body.hospital.verificationStatus).toBe('pending');
      expect(res.body.hospital.tierStatus).toBe('unconfirmed');
      expect(res.body.message).toContain('reset verification status to "pending"');
    });

    it('rejection requires an explicit reason (returns 400 if omitted)', async () => {
      const resNoReason = await request(app)
        .post(`/api/hospitals/${hospital2._id}/reject`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({});

      expect(resNoReason.status).toBe(400);
      expect(resNoReason.body.message).toContain('rejection reason is strictly required');

      const resWithReason = await request(app)
        .post(`/api/hospitals/${hospital2._id}/reject`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({ reason: 'Oxygen cylinder safety certificate expired.' });

      expect(resWithReason.status).toBe(200);
      expect(resWithReason.body.status).toBe('rejected');
      expect(resWithReason.body.rejectionReason).toBe('Oxygen cylinder safety certificate expired.');
    });
  });

  describe('5. Verification Consistency Checks', () => {
    it('MRI claimed without radiology department/specialist produces a warning', () => {
      const hospMriNoRad = {
        name: 'Inconsistent Imaging Hospital',
        registrationNumber: 'CEA-TN-TEST-001',
        departments: ['General Medicine'],
        specialties: ['General Surgery'],
        specialists: [{ specialty: 'General Surgery', count: 1 }],
        equipment: {
          mri: { available: true, count: 1 },
        },
        bedCounts: { general: 20, emergency: 5, icu: 0 },
        evidenceDocuments: [{ type: 'hospital_license' }],
      };

      const result = performVerificationConsistencyChecks(hospMriNoRad);
      expect(result.warnings.some(w => w.code === 'IMAGING_WITHOUT_RADIOLOGY')).toBe(true);
    });

    it('ICU beds claimed with 0 ventilators produces a warning', () => {
      const hospIcuNoVent = {
        name: 'Inconsistent ICU Hospital',
        registrationNumber: 'CEA-TN-TEST-002',
        departments: ['Emergency'],
        specialties: ['Emergency Medicine'],
        equipment: {
          ventilators: { available: false, count: 0 },
        },
        bedCounts: { general: 20, emergency: 5, icu: 10 }, // 10 ICU beds, 0 ventilators
        evidenceDocuments: [{ type: 'hospital_license' }],
      };

      const result = performVerificationConsistencyChecks(hospIcuNoVent);
      expect(result.warnings.some(w => w.code === 'ICU_WITHOUT_VENTILATORS')).toBe(true);
    });
  });
});
