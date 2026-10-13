const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const PatientRecord = require('../models/PatientRecord');
const Consent = require('../models/Consent');
const Scheme = require('../models/Scheme');
const Referral = require('../models/Referral');
const AuditLog = require('../models/AuditLog');
const { signToken } = require('../config/jwt');
const { saveRecordContent } = require('../services/recordStorageService');
const { assertNoForbiddenPhrases, MANDATORY_NOTICE } = require('../services/schemeService');
const consentConfig = require('../config/consentConfig.json');

const { getOfficialSchemeSeedData } = require('../scripts/seedPhase6');

jest.setTimeout(60000);

describe('Phase 6: Consent-Based Record Sharing & Scheme Catalogue', () => {
  let hospA, hospB;
  let doctorA, doctorB, patient1, patient2, reviewer, adminA;
  let doctorAToken, doctorBToken, patient1Token, patient2Token, reviewerToken, adminAToken;
  let normalRecordA, sensitiveRecordA, oldRecordA;

  beforeAll(async () => {
    await connectDB();
    await Hospital.deleteMany({});
    await User.deleteMany({});
    await PatientRecord.deleteMany({});
    await Consent.deleteMany({});
    await Scheme.deleteMany({});
    await Referral.deleteMany({});
    await AuditLog.deleteMany({});

    // Seed official verified schemes
    await Scheme.insertMany(getOfficialSchemeSeedData());

    // 1. Setup 2 Simulated Hospitals
    hospA = await new Hospital({
      name: 'Synthetic - Kovai Apex Super Specialty Hospital (Hospital A)',
      code: 'HOSP-SIM-A',
      district: 'Coimbatore',
      location: { latitude: 11.0168, longitude: 76.9558 },
      ownership: 'private_corporate',
      verificationStatus: 'verified',
      tier: 'Tier 1',
      specialties: ['Cardiology', 'Pulmonology', 'Emergency Medicine'],
      isSynthetic: true,
    }).save();

    hospB = await new Hospital({
      name: 'Synthetic - Salem Mohan Kumaramangalam Hospital (Hospital B)',
      code: 'HOSP-SIM-B',
      district: 'Salem',
      location: { latitude: 11.6643, longitude: 78.1460 },
      ownership: 'government',
      verificationStatus: 'verified',
      tier: 'Tier 1',
      specialties: ['Cardiology', 'Pulmonology', 'General Surgery'],
      isSynthetic: true,
    }).save();

    // 2. Setup Role-Based Users
    doctorA = await new User({
      name: 'Dr. A. Arumugam (Hospital A)',
      email: 'doctor.a@carebridge.synthetic',
      password: 'DoctorPassword123!',
      role: 'doctor',
      hospitalId: hospA._id,
      district: 'Coimbatore',
      isSynthetic: true,
    }).save();

    doctorB = await new User({
      name: 'Dr. B. Balasubramanian (Hospital B)',
      email: 'doctor.b@carebridge.synthetic',
      password: 'DoctorPassword123!',
      role: 'doctor',
      hospitalId: hospB._id,
      district: 'Salem',
      isSynthetic: true,
    }).save();

    patient1 = await new User({
      name: 'P. Anandhi (Patient 1)',
      email: 'patient1@carebridge.synthetic',
      password: 'PatientPassword123!',
      role: 'patient',
      district: 'Coimbatore',
      isSynthetic: true,
    }).save();

    patient2 = await new User({
      name: 'S. Selvam (Patient 2)',
      email: 'patient2@carebridge.synthetic',
      password: 'PatientPassword123!',
      role: 'patient',
      district: 'Salem',
      isSynthetic: true,
    }).save();

    reviewer = await new User({
      name: 'Dr. Reviewer TNHSP',
      email: 'reviewer.audit@carebridge.synthetic',
      password: 'ReviewerPassword123!',
      role: 'platform_reviewer',
      district: 'Chennai',
      isSynthetic: true,
    }).save();

    adminA = await new User({
      name: 'Admin Hospital A',
      email: 'admin.a@carebridge.synthetic',
      password: 'AdminPassword123!',
      role: 'hospital_admin',
      hospitalId: hospA._id,
      district: 'Coimbatore',
      isSynthetic: true,
    }).save();

    // Generate JWT Tokens
    doctorAToken = signToken({ id: doctorA._id, role: doctorA.role, hospitalId: hospA._id });
    doctorBToken = signToken({ id: doctorB._id, role: doctorB.role, hospitalId: hospB._id });
    patient1Token = signToken({ id: patient1._id, role: patient1.role });
    patient2Token = signToken({ id: patient2._id, role: patient2.role });
    reviewerToken = signToken({ id: reviewer._id, role: reviewer.role });
    adminAToken = signToken({ id: adminA._id, role: adminA.role, hospitalId: hospA._id });

    // 3. Create Sample Patient Records in Protected Storage
    // Record 1: Normal Lab Report (Fresh - 1 month old)
    const rec1Id = new mongoose.Types.UUID().toString();
    const ref1 = saveRecordContent(rec1Id, {
      recordId: rec1Id,
      patientName: patient1.name,
      test: 'Complete Blood Count',
      wbc: '6,800 /mcL',
      hb: '13.2 g/dL',
    });
    normalRecordA = await new PatientRecord({
      recordId: rec1Id,
      patientId: patient1._id,
      sourceHospitalId: hospA._id,
      type: 'lab_report',
      title: 'Complete Blood Count (CBC)',
      recordDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      provenance: {
        submittedBy: 'Dr. A. Arumugam',
        sourceSystem: 'HOSP-A-HIS',
        facilityName: hospA.name,
        facilityDistrict: hospA.district,
      },
      contentRef: ref1,
      sensitivityLevel: 'normal',
      isSynthetic: true,
    }).save();

    // Record 2: Sensitive Record (Psychiatric evaluation)
    const rec2Id = new mongoose.Types.UUID().toString();
    const ref2 = saveRecordContent(rec2Id, {
      recordId: rec2Id,
      patientName: patient1.name,
      evaluation: 'Major Depressive Episode in Remission',
    });
    sensitiveRecordA = await new PatientRecord({
      recordId: rec2Id,
      patientId: patient1._id,
      sourceHospitalId: hospA._id,
      type: 'diagnosis',
      title: 'Psychiatric Evaluation & Management',
      recordDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      provenance: {
        submittedBy: 'Dr. Staff Psychiatrist',
        sourceSystem: 'HOSP-A-HIS',
        facilityName: hospA.name,
        facilityDistrict: hospA.district,
      },
      contentRef: ref2,
      sensitivityLevel: 'sensitive',
      sensitiveCategory: 'mental_health',
      isSynthetic: true,
    }).save();

    // Record 3: Old Record (14 months old -> triggers warning flag)
    const rec3Id = new mongoose.Types.UUID().toString();
    const ref3 = saveRecordContent(rec3Id, {
      recordId: rec3Id,
      patientName: patient1.name,
      test: 'Chest X-Ray PA View',
      findings: 'Clear lung fields',
    });
    oldRecordA = await new PatientRecord({
      recordId: rec3Id,
      patientId: patient1._id,
      sourceHospitalId: hospA._id,
      type: 'imaging_report',
      title: 'Chest Radiograph PA View',
      recordDate: new Date(Date.now() - 425 * 24 * 60 * 60 * 1000), // ~14 months ago
      provenance: {
        submittedBy: 'Dr. Radiologist',
        sourceSystem: 'HOSP-A-HIS',
        facilityName: hospA.name,
        facilityDistrict: hospA.district,
      },
      contentRef: ref3,
      sensitivityLevel: 'normal',
      isSynthetic: true,
    }).save();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('Part A1 & A2: Consent Workflow & Record Access Enforcement', () => {
    let testConsentId;

    it('should allow Doctor at Hospital B to initiate a consent request to Patient 1', async () => {
      const res = await request(app)
        .post('/api/consents/request')
        .set('Authorization', `Bearer ${doctorBToken}`)
        .send({
          patientId: patient1._id.toString(),
          purpose: 'referral',
          recordTypes: ['lab_report', 'imaging_report'],
          durationDays: 7,
          includeSensitiveRecords: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.consent).toBeDefined();
      expect(res.body.consent.status).toBe('requested');
      expect(res.body.consent.recordTypes).toEqual(expect.arrayContaining(['lab_report', 'imaging_report']));
      testConsentId = res.body.consent.consentId;
    });

    it('should block Doctor B from viewing Patient 1 records while consent is in requested status', async () => {
      const res = await request(app)
        .get(`/api/patients/${patient1._id}/records`)
        .set('Authorization', `Bearer ${doctorBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.accessGranted).toBe(false);
      expect(res.body.records).toHaveLength(0);
    });

    it('should allow Patient 1 to view and grant consent with optional narrowing', async () => {
      // Patient checks consents list
      const listRes = await request(app)
        .get('/api/consents')
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.consents.some(c => c.consentId === testConsentId)).toBe(true);

      // Patient grants consent
      const grantRes = await request(app)
        .post(`/api/consents/${testConsentId}/grant`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          narrowedRecordTypes: ['lab_report', 'imaging_report'],
          shortenedExpiryDays: 5,
        });

      expect(grantRes.status).toBe(200);
      expect(grantRes.body.consent.status).toBe('granted');
      expect(grantRes.body.consent.grantedAt).toBeDefined();
    });

    it('should allow Doctor B to view granted records with provenance and age warning flags', async () => {
      const res = await request(app)
        .get(`/api/patients/${patient1._id}/records`)
        .set('Authorization', `Bearer ${doctorBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.accessGranted).toBe(true);
      expect(res.body.records.length).toBeGreaterThanOrEqual(2);

      // Verify normal record formatting
      const normalRec = res.body.records.find(r => r.recordId === normalRecordA.recordId);
      expect(normalRec).toBeDefined();
      expect(normalRec.sourceHospital.name).toContain('Hospital A');
      expect(normalRec.provenance.clinicalNotice).toContain('Authenticated by source hospital telemetry');

      // Verify 14-month old record triggers warning flag
      const oldRec = res.body.records.find(r => r.recordId === oldRecordA.recordId);
      expect(oldRec).toBeDefined();
      expect(oldRec.isOldRecord).toBe(true);
      expect(oldRec.ageWarning).toContain('months old; check clinical relevance');
    });

    it('should exclude sensitive records by default when includeSensitiveRecords is false', async () => {
      const res = await request(app)
        .get(`/api/patients/${patient1._id}/records`)
        .set('Authorization', `Bearer ${doctorBToken}`);

      expect(res.status).toBe(200);
      const sensitiveFound = res.body.records.some(r => r.recordId === sensitiveRecordA.recordId);
      expect(sensitiveFound).toBe(false);
    });

    it('should allow retrieval of sensitive records ONLY when affirmative consent is explicitly granted', async () => {
      // Create separate consent request requesting sensitive records
      const reqRes = await request(app)
        .post('/api/consents/request')
        .set('Authorization', `Bearer ${doctorBToken}`)
        .send({
          patientId: patient1._id.toString(),
          purpose: 'continuing_care',
          recordTypes: ['diagnosis'],
          includeSensitiveRecords: true,
        });

      const sensitiveConsentId = reqRes.body.consent.consentId;

      // Patient explicitly grants with sensitive records affirmative flag
      await request(app)
        .post(`/api/consents/${sensitiveConsentId}/grant`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          includeSensitiveRecords: true,
        });

      // Doctor B fetches records again
      const fetchRes = await request(app)
        .get(`/api/patients/${patient1._id}/records`)
        .set('Authorization', `Bearer ${doctorBToken}`);

      expect(fetchRes.status).toBe(200);
      const sensitiveFound = fetchRes.body.records.some(r => r.recordId === sensitiveRecordA.recordId);
      expect(sensitiveFound).toBe(true);

      // Clean up sensitive consent so it does not leave a dangling active consent
      await request(app)
        .post(`/api/consents/${sensitiveConsentId}/revoke`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ reason: 'Completed evaluation of sensitive records' });
    });

    it('should immediately cease access when Patient revokes consent', async () => {
      // Patient revokes the first consent
      const revokeRes = await request(app)
        .post(`/api/consents/${testConsentId}/revoke`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ reason: 'Patient withdrawal of sharing authorization' });

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.consent.status).toBe('revoked');

      // Doctor B directly tries to query the single record from that consent
      const singleRes = await request(app)
        .get(`/api/records/${normalRecordA.recordId}`)
        .set('Authorization', `Bearer ${doctorBToken}`);

      // Must be denied with generic response
      expect(singleRes.status).toBe(404);
      expect(singleRes.body.error).toBe('Not Found');
      expect(singleRes.body.message).toBe('Record not found or access denied.');
    });

    it('should block Doctor at unauthorized hospital from viewing records (wrong hospital)', async () => {
      // Doctor at Hospital A tries to query records of Patient 2 where no consent exists
      const res = await request(app)
        .get(`/api/patients/${patient2._id}/records`)
        .set('Authorization', `Bearer ${doctorAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.accessGranted).toBe(false);
    });

    it('should block Hospital Admins from accessing clinical records through admin endpoints', async () => {
      const res = await request(app)
        .get(`/api/patients/${patient1._id}/records`)
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Part A3: IDOR Protection & Audit Integrity', () => {
    it('should return the EXACT SAME generic 404 response for forbidden records and non-existent records', async () => {
      const nonExistentUuid = new mongoose.Types.UUID().toString();

      // Query 1: Forbidden existing record (Doctor A querying without consent)
      const forbiddenRes = await request(app)
        .get(`/api/records/${normalRecordA.recordId}`)
        .set('Authorization', `Bearer ${doctorBToken}`); // Doctor B has no active consent now since it was revoked

      // Query 2: Non-existent record UUID
      const notFoundRes = await request(app)
        .get(`/api/records/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${doctorBToken}`);

      expect(forbiddenRes.status).toBe(404);
      expect(notFoundRes.status).toBe(404);
      expect(forbiddenRes.body).toEqual(notFoundRes.body);
      expect(forbiddenRes.body.message).toBe('Record not found or access denied.');
    });

    it('should block Patient 1 from probing Patient 2 records via IDOR and return generic response', async () => {
      const res = await request(app)
        .get(`/api/patients/${patient2._id}/records`)
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Record not found or access denied.');
    });

    it('should allow patient to view transparent access report of who accessed what records', async () => {
      const res = await request(app)
        .get('/api/consents/access-history')
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.accessReport).toBeDefined();
      expect(res.body.accessReport.length).toBeGreaterThan(0);

      // Verify log details contain actor and action without PHI
      const viewEvent = res.body.accessReport.find(e => e.action === 'VIEW_PATIENT_RECORD');
      if (viewEvent) {
        expect(viewEvent.actor.role).toBe('doctor');
        expect(viewEvent.hospital.name).toBeDefined();
      }
    });

    it('should verify audit logs contain NO raw clinical payload contents', async () => {
      const logs = await AuditLog.find({ patientId: patient1._id }).lean();
      expect(logs.length).toBeGreaterThan(0);

      for (const log of logs) {
        // Assert no clinical laboratory values appear in audit log
        expect(JSON.stringify(log)).not.toContain('11.8 g/dL');
        expect(JSON.stringify(log)).not.toContain('13.2 g/dL');
        expect(JSON.stringify(log)).not.toContain('Budesonide');
      }
    });
  });

  describe('Part A2: Emergency Break-Glass Access', () => {
    it('should reject break-glass access when disabled by policy (default OFF)', async () => {
      expect(consentConfig.breakGlassEnabled).toBe(false);

      const res = await request(app)
        .post('/api/records/break-glass')
        .set('Authorization', `Bearer ${doctorBToken}`)
        .send({
          patientId: patient1._id.toString(),
          reason: 'Unresponsive trauma patient in emergency resuscitation bay',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('disabled by system policy');
    });

    it('should reject break-glass attempt if emergency reason is missing or too short', async () => {
      const res = await request(app)
        .post('/api/records/break-glass')
        .set('Authorization', `Bearer ${doctorBToken}`)
        .send({
          patientId: patient1._id.toString(),
          reason: 'Test',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('required');
    });
  });

  describe('Part A4: Integration with Referral Workflow', () => {
    let testReferralId;

    it('should create a referral and keep records consent status as not_requested initially', async () => {
      const refDoc = await new Referral({
        referralId: 'REF-2026-TEST-P6',
        patientId: patient1._id,
        patientName: patient1.name,
        referringDoctorId: doctorA._id,
        referringHospitalId: hospA._id,
        patientSummary: { age: 48, gender: 'female', chiefComplaint: 'Dyspnea' },
        requirements: {
          requiredSpecialty: 'Pulmonology',
          urgency: 'urgent',
          patientCoordinates: {
            latitude: 11.0168,
            longitude: 76.9558,
            district: 'Coimbatore',
          },
        },
        selectedHospitalId: hospB._id,
        status: 'draft',
        recordsConsentStatus: 'not_requested',
        clinicalDisclaimerAcknowledged: true,
        decisionSupportDisclaimer: 'Decision support only. A clinician must review.',
        isSynthetic: true,
      }).save();

      testReferralId = refDoc._id;

      const getRes = await request(app)
        .get(`/api/referrals/${testReferralId}`)
        .set('Authorization', `Bearer ${doctorAToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.referral.recordsConsentStatus).toBe('not_requested');
    });

    it('should allow doctor to dispatch consent request for receiving hospital during review', async () => {
      const reviewRes = await request(app)
        .patch(`/api/referrals/${testReferralId}/review`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({
          newStatus: 'reviewed',
          selectedHospitalId: hospB._id.toString(),
          requestRecordsConsent: true,
          recordTypes: ['lab_report', 'imaging_report'],
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.recordsConsentStatus).toBe('requested');
      expect(reviewRes.body.recordsConsentId).toBeDefined();
    });

    it('should NOT automatically grant records consent when referral status is moved to accepted', async () => {
      const acceptRes = await request(app)
        .patch(`/api/referrals/${testReferralId}/review`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({
          newStatus: 'accepted',
        });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.status).toBe('accepted');
      // CRITICAL REQUIREMENT: Referral acceptance does NOT grant record access!
      expect(acceptRes.body.recordsConsentStatus).toBe('requested');
    });
  });

  describe('Part B: Scheme Catalogue & Potential Matching', () => {
    it('should return all seeded schemes with official source URLs and verified dates', async () => {
      const res = await request(app)
        .get('/api/schemes')
        .set('Authorization', `Bearer ${patient1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.schemes.length).toBeGreaterThanOrEqual(3);

      const cmchis = res.body.schemes.find(s => s.schemeId === 'CMCHIS');
      expect(cmchis).toBeDefined();
      expect(cmchis.officialApplicationUrl).toContain('cmchistn.com');
      expect(cmchis.status).toBe('verified');
      expect(cmchis.lastVerifiedDate).toBeDefined();

      const pmjay = res.body.schemes.find(s => s.schemeId === 'PM-JAY');
      expect(pmjay).toBeDefined();
      expect(pmjay.officialApplicationUrl).toContain('beneficiary.nha.gov.in');

      const ran = res.body.schemes.find(s => s.schemeId === 'RAN');
      expect(ran).toBeDefined();
      expect(ran.officialApplicationUrl).toContain('mohfw.gov.in');
    });

    it('should return "potential match" for CMCHIS when resident and income within threshold', async () => {
      const matchRes = await request(app)
        .post('/api/schemes/match')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          inputs: {
            stateResident: true,
            annualFamilyIncome: 95000,
          },
        });

      expect(matchRes.status).toBe(200);
      const cmchis = matchRes.body.potentialMatches.find(s => s.schemeId === 'CMCHIS');
      expect(cmchis.matchStatus).toBe('potential match');
      expect(cmchis.notice).toBe(MANDATORY_NOTICE);
    });

    it('should return "cannot determine" with missing items rather than guessing', async () => {
      const matchRes = await request(app)
        .post('/api/schemes/match')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          inputs: {}, // Missing all criteria
        });

      expect(matchRes.status).toBe(200);
      const cmchis = matchRes.body.potentialMatches.find(s => s.schemeId === 'CMCHIS');
      expect(cmchis.matchStatus).toBe('cannot determine');
      expect(cmchis.criteriaToVerify.length).toBeGreaterThan(0);
    });

    it('should pass the forbidden phrase scan (NEVER output eligible, covered, free, or approved)', () => {
      const cleanMatchOutput = {
        schemeName: 'CMCHIS',
        matchStatus: 'potential match',
        criteriaChecked: ['Tamil Nadu residency declared', 'Annual family income within ₹1,20,000 limit'],
        criteriaToVerify: [],
        participatingHospitalNote: 'hospital-reported, verify with scheme',
        notice: MANDATORY_NOTICE,
      };
      expect(() => assertNoForbiddenPhrases(cleanMatchOutput)).not.toThrow();

      // Test that forbidden phrase validator catches prohibited claims
      expect(() => assertNoForbiddenPhrases({ matchStatus: 'eligible' })).toThrow(/Forbidden phrase/);
      expect(() => assertNoForbiddenPhrases({ criteriaChecked: ['Patient is covered under this scheme'] })).toThrow(/Forbidden phrase/);
      expect(() => assertNoForbiddenPhrases({ criteriaChecked: ['Treatment is completely free'] })).toThrow(/Forbidden phrase/);
      expect(() => assertNoForbiddenPhrases({ matchStatus: 'approved' })).toThrow(/Forbidden phrase/);
    });

    it('should allow only platform_reviewer to mark a scheme verified', async () => {
      // Doctor attempts to verify -> blocked
      const docRes = await request(app)
        .post('/api/schemes/CMCHIS/verify')
        .set('Authorization', `Bearer ${doctorAToken}`);
      expect(docRes.status).toBe(403);

      // Reviewer verifies -> success
      const revRes = await request(app)
        .post('/api/schemes/CMCHIS/verify')
        .set('Authorization', `Bearer ${reviewerToken}`);
      expect(revRes.status).toBe(200);
      expect(revRes.body.scheme.status).toBe('verified');
    });

    it('should flag schemes as outdated when lastVerifiedDate exceeds configurable threshold', async () => {
      // Set CMCHIS lastVerifiedDate to 200 days ago
      await Scheme.updateOne(
        { schemeId: 'CMCHIS' },
        { lastVerifiedDate: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) }
      );

      const sweepRes = await request(app)
        .post('/api/schemes/check-outdated')
        .set('Authorization', `Bearer ${reviewerToken}`)
        .send({ maxAgeDays: 180 });

      expect(sweepRes.status).toBe(200);
      expect(sweepRes.body.flaggedCount).toBeGreaterThanOrEqual(1);

      const checkDoc = await Scheme.findOne({ schemeId: 'CMCHIS' });
      expect(checkDoc.status).toBe('outdated');
    });
  });

  describe('Part D: End-to-End Multi-Hospital Record Sharing Flow', () => {
    it('executes full multi-hospital record sharing and immediate revocation lifecycle', async () => {
      // Step 1: Hospital A has records for Patient 1. Hospital B doctor requests access.
      const reqRes = await request(app)
        .post('/api/consents/request')
        .set('Authorization', `Bearer ${doctorBToken}`)
        .send({
          patientId: patient1._id.toString(),
          purpose: 'referral',
          recordTypes: ['lab_report'],
          durationDays: 7,
        });
      expect(reqRes.status).toBe(201);
      const e2eConsentId = reqRes.body.consent.consentId;

      // Step 2: Patient 1 explicitly grants consent on patient portal
      const grantRes = await request(app)
        .post(`/api/consents/${e2eConsentId}/grant`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ narrowedRecordTypes: ['lab_report'] });
      expect(grantRes.status).toBe(200);

      // Step 3: Hospital B doctor retrieves consented records
      const fetchRes = await request(app)
        .get(`/api/patients/${patient1._id}/records`)
        .set('Authorization', `Bearer ${doctorBToken}`);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.records.length).toBeGreaterThan(0);
      expect(fetchRes.body.records.every(r => r.type === 'lab_report')).toBe(true);

      // Step 4: Patient 1 revokes consent immediately
      const revokeRes = await request(app)
        .post(`/api/consents/${e2eConsentId}/revoke`)
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({ reason: 'Consultation concluded' });
      expect(revokeRes.status).toBe(200);

      // Step 5: Immediate subsequent fetch by Hospital B doctor is blocked
      const subsequentRes = await request(app)
        .get(`/api/patients/${patient1._id}/records`)
        .set('Authorization', `Bearer ${doctorBToken}`);
      expect(subsequentRes.status).toBe(403);
      expect(subsequentRes.body.accessGranted).toBe(false);

      // Step 6: Verify total audit log events generated across end-to-end demo
      const totalLogs = await AuditLog.countDocuments();
      expect(totalLogs).toBeGreaterThanOrEqual(10);
    });
  });
});
