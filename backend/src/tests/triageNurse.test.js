const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const Practitioner = require('../models/Practitioner');
const TriageRecord = require('../models/TriageRecord');
const TriageAlert = require('../models/TriageAlert');
const { connectDB, disconnectDB } = require('../config/db');
const { signToken } = require('../config/jwt');
const { syncHospitalSpecialists } = require('../services/practitionerService');
const { checkDataConsistency } = require('../scripts/checkDataConsistency');

describe('Phase 8.4c Triage Nurse Role & Triage Records Suite', () => {
  let hospitalA, hospitalB;
  let doctorA, doctorB;
  let nurseA, nurseB;
  let adminA;
  let patient;
  let doctorTokenA, nurseTokenA, nurseTokenB, adminTokenA, patientToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();

    await User.deleteMany({});
    await Hospital.deleteMany({});
    await Practitioner.deleteMany({});
    await TriageRecord.deleteMany({});
    await TriageAlert.deleteMany({});

    hospitalA = await Hospital.create({
      code: 'HOSP-TN-TEST-01',
      name: 'Salem Government Headquarters Hospital',
      tier: 'Tier 2',
      district: 'Salem',
      specialties: ['Pulmonology'],
      verificationStatus: 'verified',
      location: { latitude: 11.6643, longitude: 78.1460 },
      isSynthetic: true,
    });

    hospitalB = await Hospital.create({
      code: 'HOSP-TN-TEST-02',
      name: 'Erode District Hospital',
      tier: 'Tier 3',
      district: 'Erode',
      specialties: ['General Medicine'],
      verificationStatus: 'verified',
      location: { latitude: 11.3410, longitude: 77.7172 },
      isSynthetic: true,
    });

    doctorA = await User.create({
      name: 'Dr. A. Anand',
      email: 'doctor.a@carebridge.test',
      password: 'DoctorPassword123!',
      role: 'doctor',
      hospitalId: hospitalA._id,
      district: 'Salem',
      isSynthetic: true,
    });

    const doctorA2 = await User.create({
      name: 'Dr. A. Arul',
      email: 'doctor.a2@carebridge.test',
      password: 'DoctorPassword123!',
      role: 'doctor',
      hospitalId: hospitalA._id,
      district: 'Salem',
      isSynthetic: true,
    });

    doctorB = await User.create({
      name: 'Dr. B. Balan',
      email: 'doctor.b@carebridge.test',
      password: 'DoctorPassword123!',
      role: 'doctor',
      hospitalId: hospitalB._id,
      district: 'Erode',
      isSynthetic: true,
    });

    const doctorB2 = await User.create({
      name: 'Dr. B. Bhaskar',
      email: 'doctor.b2@carebridge.test',
      password: 'DoctorPassword123!',
      role: 'doctor',
      hospitalId: hospitalB._id,
      district: 'Erode',
      isSynthetic: true,
    });

    nurseA = await User.create({
      name: 'Nurse Priya',
      email: 'nurse.a@carebridge.test',
      password: 'NursePassword123!',
      role: 'triage_nurse',
      hospitalId: hospitalA._id,
      district: 'Salem',
      qualification: 'B.Sc Nursing',
      registrationNumber: 'SYN-NUR-1001',
      supervisingDoctorIds: [doctorA._id],
      status: 'active',
      isSynthetic: true,
    });

    nurseB = await User.create({
      name: 'Nurse Rekha',
      email: 'nurse.b@carebridge.test',
      password: 'NursePassword123!',
      role: 'triage_nurse',
      hospitalId: hospitalB._id,
      district: 'Erode',
      qualification: 'B.Sc Nursing',
      registrationNumber: 'SYN-NUR-1002',
      supervisingDoctorIds: [doctorB._id],
      status: 'active',
      isSynthetic: true,
    });

    adminA = await User.create({
      name: 'Admin Salem',
      email: 'admin.salem@carebridge.test',
      password: 'AdminPassword123!',
      role: 'hospital_admin',
      hospitalId: hospitalA._id,
      district: 'Salem',
      isSynthetic: true,
    });
    hospitalA.adminUserId = adminA._id;
    await hospitalA.save();

    const adminB = await User.create({
      name: 'Admin Erode',
      email: 'admin.erode@carebridge.test',
      password: 'AdminPassword123!',
      role: 'hospital_admin',
      hospitalId: hospitalB._id,
      district: 'Erode',
      isSynthetic: true,
    });
    hospitalB.adminUserId = adminB._id;
    await hospitalB.save();

    patient = await User.create({
      name: 'Patient Test',
      email: 'patient.test@carebridge.test',
      password: 'PatientPassword123!',
      role: 'patient',
      district: 'Salem',
      isSynthetic: true,
    });

    // Create 2 verified practitioners for hospitalA
    await Practitioner.create({
      practitionerId: 'PRAC-2026-TEST-01',
      userId: doctorA._id,
      hospitalId: hospitalA._id,
      fullName: doctorA.name,
      qualification: 'MD Pulmonology',
      specialty: 'Pulmonology',
      registrationNumber: 'SYN-TNC-9901',
      employmentStatus: 'active',
      verificationStatus: 'verified',
      isSynthetic: true,
    });

    await Practitioner.create({
      practitionerId: 'PRAC-2026-TEST-02',
      userId: doctorA2._id,
      hospitalId: hospitalA._id,
      fullName: doctorA2.name,
      qualification: 'MD Pulmonology',
      specialty: 'Pulmonology',
      registrationNumber: 'SYN-TNC-9902',
      employmentStatus: 'active',
      verificationStatus: 'verified',
      isSynthetic: true,
    });

    // Create 2 verified practitioners for hospitalB
    await Practitioner.create({
      practitionerId: 'PRAC-2026-TEST-03',
      userId: doctorB._id,
      hospitalId: hospitalB._id,
      fullName: doctorB.name,
      qualification: 'MD General Medicine',
      specialty: 'General Medicine',
      registrationNumber: 'SYN-TNC-9903',
      employmentStatus: 'active',
      verificationStatus: 'verified',
      isSynthetic: true,
    });

    await Practitioner.create({
      practitionerId: 'PRAC-2026-TEST-04',
      userId: doctorB2._id,
      hospitalId: hospitalB._id,
      fullName: doctorB2.name,
      qualification: 'MD General Medicine',
      specialty: 'General Medicine',
      registrationNumber: 'SYN-TNC-9904',
      employmentStatus: 'active',
      verificationStatus: 'verified',
      isSynthetic: true,
    });

    doctorTokenA = signToken({ id: doctorA._id, email: doctorA.email, role: 'doctor', hospitalId: hospitalA._id });
    nurseTokenA = signToken({ id: nurseA._id, email: nurseA.email, role: 'triage_nurse', hospitalId: hospitalA._id });
    nurseTokenB = signToken({ id: nurseB._id, email: nurseB.email, role: 'triage_nurse', hospitalId: hospitalB._id });
    adminTokenA = signToken({ id: adminA._id, email: adminA.email, role: 'hospital_admin', hospitalId: hospitalA._id });
    patientToken = signToken({ id: patient._id, email: patient.email, role: 'patient' });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Physiological Validation', () => {
    test('rejects impossible vital values with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/triage/records')
        .set('Authorization', `Bearer ${nurseTokenA}`)
        .send({
          patientId: patient._id,
          chiefComplaint: { category: 'Cardiovascular', text: 'Chest pain' },
          vitals: {
            systolicBp: 35, // Impossible < 40
            diastolicBp: 20,
            heartRate: 80,
            respiratoryRate: 18,
            spo2: 98,
            temperature: 37.0,
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid Physiological Vitals');
      expect(res.body.message).toMatch(/physiologically impossible/i);
    });

    test('rejects diastolic BP greater than systolic BP', async () => {
      const res = await request(app)
        .post('/api/triage/records')
        .set('Authorization', `Bearer ${nurseTokenA}`)
        .send({
          patientId: patient._id,
          chiefComplaint: { category: 'Cardiovascular', text: 'Chest pain' },
          vitals: {
            systolicBp: 110,
            diastolicBp: 120, // Impossible diastolic >= systolic
            heartRate: 80,
            respiratoryRate: 18,
            spo2: 98,
            temperature: 37.0,
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot be greater than or equal to systolic BP/i);
    });

    test('accepts borderline physiological values and flags check measurement warnings', async () => {
      const res = await request(app)
        .post('/api/triage/records')
        .set('Authorization', `Bearer ${nurseTokenA}`)
        .send({
          patientId: patient._id,
          chiefComplaint: { category: 'General', text: 'Mild fever and fatigue' },
          vitals: {
            systolicBp: 185, // Borderline high
            diastolicBp: 95,
            heartRate: 125, // Borderline high
            respiratoryRate: 18,
            spo2: 91, // Borderline low SpO2
            temperature: 38.8, // Borderline high
          },
          status: 'submitted',
        });

      expect(res.status).toBe(201);
      expect(res.body.record.validationWarnings).toBeDefined();
      expect(res.body.record.validationWarnings.length).toBeGreaterThan(0);
      expect(res.body.record.validationWarnings[0]).toMatch(/Check/i);
    });
  });

  describe('2. Red Flag Detection & In-App Critical Alerts', () => {
    test('submitting vitals with red flags creates critical alert and escalation banner', async () => {
      const res = await request(app)
        .post('/api/triage/records')
        .set('Authorization', `Bearer ${nurseTokenA}`)
        .send({
          patientId: patient._id,
          chiefComplaint: { category: 'Cardiovascular', text: 'Severe acute substernal chest pressure' },
          vitals: {
            systolicBp: 84, // Red flag: SBP < 90
            diastolicBp: 50,
            heartRate: 138, // Red flag: HR > 130
            respiratoryRate: 32, // Red flag: RR > 30
            spo2: 88, // Red flag: SpO2 < 90
            temperature: 37.1,
            consciousness: 'alert',
          },
          status: 'submitted',
        });

      expect(res.status).toBe(201);
      expect(res.body.record.escalationRequired).toBe(true);
      expect(res.body.record.escalationBanner).toBe('Escalate to doctor now');
      expect(res.body.record.redFlags.length).toBeGreaterThanOrEqual(4);
      expect(res.body.record.modelSuggestedUrgency).toBe('emergency');

      // Verify in-app alert was created
      const alert = await TriageAlert.findOne({ triageId: res.body.record.triageId });
      expect(alert).not.toBeNull();
      expect(alert.severity).toBe('critical');
      expect(alert.hospitalId.toString()).toBe(hospitalA._id.toString());

      // Verify doctor can fetch active alerts
      const docAlerts = await request(app)
        .get('/api/triage/alerts')
        .set('Authorization', `Bearer ${doctorTokenA}`);

      expect(docAlerts.status).toBe(200);
      expect(docAlerts.body.alerts.some(a => a.triageId === res.body.record.triageId)).toBe(true);
    });
  });

  describe('3. Permissions & Authorization Matrix Enforcement', () => {
    let createdRecordId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/triage/records')
        .set('Authorization', `Bearer ${nurseTokenA}`)
        .send({
          patientId: patient._id,
          chiefComplaint: { category: 'General', text: 'General routine intake' },
          vitals: {
            systolicBp: 120,
            diastolicBp: 80,
            heartRate: 72,
            respiratoryRate: 16,
            spo2: 98,
            temperature: 36.6,
          },
          status: 'submitted',
        });
      createdRecordId = res.body.record._id;
    });

    test('triage_nurse CANNOT confirm urgency (strictly forbidden 403)', async () => {
      const res = await request(app)
        .post(`/api/triage/records/${createdRecordId}/confirm-urgency`)
        .set('Authorization', `Bearer ${nurseTokenA}`)
        .send({ confirmedUrgency: 'routine' });

      expect(res.status).toBe(403);
    });

    test('doctor CAN confirm urgency with justification', async () => {
      const res = await request(app)
        .post(`/api/triage/records/${createdRecordId}/confirm-urgency`)
        .set('Authorization', `Bearer ${doctorTokenA}`)
        .send({ confirmedUrgency: 'urgent', overrideReason: 'Clinician clinical observation of high risk.' });

      expect(res.status).toBe(200);
      expect(res.body.record.confirmedUrgency).toBe('urgent');
      expect(res.body.record.status).toBe('reviewed');
    });

    test('triage_nurse CANNOT run referrals or query referral engine (403)', async () => {
      const res = await request(app)
        .post('/api/referrals/recommend')
        .set('Authorization', `Bearer ${nurseTokenA}`)
        .send({
          patientId: patient._id,
          requiredSpecialty: 'Pulmonology',
          urgency: 'routine',
        });

      expect(res.status).toBe(403);
    });

    test('cross-hospital access: nurseB cannot view hospitalA triage records (uniform 404)', async () => {
      const res = await request(app)
        .get(`/api/triage/records/${createdRecordId}`)
        .set('Authorization', `Bearer ${nurseTokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Triage record not found.');
    });

    test('non-existent ID returns identical 404 (prevents ID probing)', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/triage/records/${fakeId}`)
        .set('Authorization', `Bearer ${nurseTokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Triage record not found.');
    });

    test('hospital admin CANNOT read clinical vitals from admin nurse endpoints', async () => {
      const res = await request(app)
        .get(`/api/hospitals/${hospitalA._id}/nurses`)
        .set('Authorization', `Bearer ${adminTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.nurses).toBeDefined();
      expect(res.body.nurses[0].registrationNumber).toBe('SYN-NUR-1001');
      // Must not leak patient vitals or clinical records
      expect(res.body.nurses[0].vitals).toBeUndefined();
    });
  });

  describe('4. Clinical Amendments', () => {
    test('doctor amendment keeps original vitals in amendmentHistory and requires reason', async () => {
      const createRes = await request(app)
        .post('/api/triage/records')
        .set('Authorization', `Bearer ${nurseTokenA}`)
        .send({
          patientId: patient._id,
          chiefComplaint: { category: 'Respiratory', text: 'Cough and mild shortness of breath' },
          vitals: {
            systolicBp: 130,
            diastolicBp: 80,
            heartRate: 85,
            respiratoryRate: 20,
            spo2: 95,
            temperature: 37.0,
          },
          status: 'submitted',
        });

      const recordId = createRes.body.record._id;

      // Amendment without reason must fail
      const noReasonRes = await request(app)
        .post(`/api/triage/records/${recordId}/amend`)
        .set('Authorization', `Bearer ${doctorTokenA}`)
        .send({
          vitals: { systolicBp: 135, diastolicBp: 85, heartRate: 88, respiratoryRate: 22, spo2: 94, temperature: 37.2 },
        });

      expect(noReasonRes.status).toBe(400);

      // Amendment with clinical reason succeeds
      const amendRes = await request(app)
        .post(`/api/triage/records/${recordId}/amend`)
        .set('Authorization', `Bearer ${doctorTokenA}`)
        .send({
          reason: 'Manual auscultation indicated slightly higher heart rate and respiratory rate upon clinician evaluation.',
          vitals: { systolicBp: 135, diastolicBp: 85, heartRate: 98, respiratoryRate: 24, spo2: 94, temperature: 37.2 },
        });

      expect(amendRes.status).toBe(200);
      expect(amendRes.body.record.status).toBe('amended');
      expect(amendRes.body.record.amendmentHistory.length).toBe(1);
      expect(amendRes.body.record.amendmentHistory[0].previousVitals.heartRate).toBe(85);
      expect(amendRes.body.record.vitals.heartRate).toBe(98);
    });
  });

  describe('5. Non-practitioner Guarantee', () => {
    test('triage_nurse accounts are NEVER counted in practitioner specialist derivation or tiering', async () => {
      const initialSpecialists = hospitalA.specialists || [];
      const initialCount = await Practitioner.countDocuments({ hospitalId: hospitalA._id });

      // Create an additional nurse
      await User.create({
        name: 'Nurse Special Staff',
        email: 'nurse.special@carebridge.test',
        password: 'NursePassword123!',
        role: 'triage_nurse',
        hospitalId: hospitalA._id,
        qualification: 'M.Sc Critical Care Nursing',
        registrationNumber: 'SYN-NUR-9999',
        status: 'active',
        isSynthetic: true,
      });

      // Synchronize hospital specialists
      const syncResult = await syncHospitalSpecialists(hospitalA._id);
      const postCount = await Practitioner.countDocuments({ hospitalId: hospitalA._id });

      expect(postCount).toBe(initialCount); // Practitioner collection count did not change
      expect(syncResult.derivedSpecialists.length).toBe(1);
      expect(syncResult.derivedSpecialists[0].specialty).toBe('Pulmonology');
      // Ensure hospital specialist counts only derived from Practitioner
      const updatedHospital = await Hospital.findById(hospitalA._id);
      expect(updatedHospital.specialists.length).toBe(1); // Only Pulmonology from doctor practitioner
      expect(updatedHospital.specialists[0].specialty).toBe('Pulmonology');
    });
  });

  describe('6. Data Consistency & Hospital Alignment', () => {
    test('checkDataConsistency passes when nurse and supervising doctors share same hospitalId', async () => {
      const report = await checkDataConsistency();
      expect(report.mismatchedNurseDoctorLinks).toEqual([]);
      expect(report.passed).toBe(true);
    });

    test('negative test: fails when nurse is assigned a doctor from a different hospital', async () => {
      const mismatchedNurse = await User.create({
        name: 'Mismatched Nurse',
        email: 'nurse.mismatched@carebridge.test',
        password: 'NursePassword123!',
        role: 'triage_nurse',
        hospitalId: hospitalA._id,
        qualification: 'B.Sc Nursing',
        registrationNumber: 'SYN-NUR-8888',
        supervisingDoctorIds: [doctorB._id], // doctorB is at hospitalB!
        status: 'active',
        isSynthetic: true,
      });

      const report = await checkDataConsistency();
      expect(report.passed).toBe(false);
      expect(report.mismatchedNurseDoctorLinks.length).toBeGreaterThanOrEqual(1);
      expect(report.mismatchedNurseDoctorLinks.some(m => m.nurseId === mismatchedNurse._id.toString())).toBe(true);

      // Clean up mismatched test nurse
      await User.deleteOne({ _id: mismatchedNurse._id });
    });
  });
});
