const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const Referral = require('../models/Referral');
const AuditLog = require('../models/AuditLog');
const { connectDB, disconnectDB } = require('../config/db');
const { signToken } = require('../config/jwt');

describe('Phase 1: Referral Review, Confirm & Override Suite', () => {
  let hospitalTop, hospitalAlt;
  let doctorOwner, doctorOther, nurseUser, patientUser;
  let doctorOwnerToken, doctorOtherToken, nurseToken, patientToken;
  let draftReferral;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();

    await User.deleteMany({});
    await Hospital.deleteMany({});
    await Referral.deleteMany({});
    await AuditLog.deleteMany({});

    hospitalTop = await Hospital.create({
      code: 'HOSP-TOP-01',
      name: 'Salem Pulmonology Center of Excellence',
      tier: 'Tier 1',
      district: 'Salem',
      specialties: ['Pulmonology', 'Emergency Medicine'],
      verificationStatus: 'verified',
      location: { latitude: 11.6643, longitude: 78.1460 },
      isSynthetic: true,
    });

    hospitalAlt = await Hospital.create({
      code: 'HOSP-ALT-02',
      name: 'Erode General Hospital',
      tier: 'Tier 2',
      district: 'Erode',
      specialties: ['Pulmonology'],
      verificationStatus: 'verified',
      location: { latitude: 11.3410, longitude: 77.7172 },
      isSynthetic: true,
    });

    doctorOwner = await User.create({
      name: 'Dr. Creating Doctor',
      email: 'doctor.owner@carebridge.test',
      password: 'Password123!',
      role: 'doctor',
      hospitalId: hospitalTop._id,
      district: 'Salem',
      isSynthetic: true,
    });

    doctorOther = await User.create({
      name: 'Dr. Other Doctor',
      email: 'doctor.other@carebridge.test',
      password: 'Password123!',
      role: 'doctor',
      hospitalId: hospitalAlt._id,
      district: 'Erode',
      isSynthetic: true,
    });

    nurseUser = await User.create({
      name: 'Nurse Priya',
      email: 'nurse.test@carebridge.test',
      password: 'Password123!',
      role: 'triage_nurse',
      hospitalId: hospitalTop._id,
      district: 'Salem',
      isSynthetic: true,
    });

    patientUser = await User.create({
      name: 'Patient Kumar',
      email: 'patient.kumar@carebridge.test',
      password: 'Password123!',
      role: 'patient',
      district: 'Salem',
      isSynthetic: true,
    });

    doctorOwnerToken = signToken({ id: doctorOwner._id, email: doctorOwner.email, role: 'doctor', hospitalId: hospitalTop._id });
    doctorOtherToken = signToken({ id: doctorOther._id, email: doctorOther.email, role: 'doctor', hospitalId: hospitalAlt._id });
    nurseToken = signToken({ id: nurseUser._id, email: nurseUser.email, role: 'triage_nurse', hospitalId: hospitalTop._id });
    patientToken = signToken({ id: patientUser._id, email: patientUser.email, role: 'patient' });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    await Referral.deleteMany({});
    draftReferral = await Referral.create({
      referralId: `REF-${Date.now().toString().slice(-6)}-101`,
      patientId: patientUser._id,
      patientName: 'Patient Kumar',
      referringDoctorId: doctorOwner._id,
      referringHospitalId: hospitalTop._id,
      requirements: {
        requiredSpecialty: 'Pulmonology',
        urgency: 'urgent',
        patientCoordinates: { latitude: 11.6643, longitude: 78.1460 },
      },
      rankedRecommendations: [
        {
          hospitalId: hospitalTop._id,
          name: hospitalTop.name,
          rank: 1,
          score: 0.95,
          district: hospitalTop.district,
        },
        {
          hospitalId: hospitalAlt._id,
          name: hospitalAlt.name,
          rank: 2,
          score: 0.82,
          district: hospitalAlt.district,
        },
      ],
      candidates: [
        {
          hospitalId: hospitalTop._id,
          name: hospitalTop.name,
          rank: 1,
          score: 0.95,
        },
        {
          hospitalId: hospitalAlt._id,
          name: hospitalAlt.name,
          rank: 2,
          score: 0.82,
        },
      ],
      status: 'draft',
      expiresAt: new Date(Date.now() + 60 * 1000), // 60s window
      clinicalDisclaimerAcknowledged: true,
      decisionSupportDisclaimer: 'Decision support only. A clinician must review.',
      isSynthetic: true,
    });
  });

  it('rejects referral review with 403 when called by a triage nurse', async () => {
    const res = await request(app)
      .patch(`/api/referrals/${draftReferral._id}/review`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .send({
        selectedHospitalId: hospitalTop._id,
        newStatus: 'reviewed',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('rejects referral review with 403 when called by a patient', async () => {
    const res = await request(app)
      .patch(`/api/referrals/${draftReferral._id}/review`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        selectedHospitalId: hospitalTop._id,
        newStatus: 'reviewed',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('rejects referral review with 403 when called by another doctor (IDOR defense)', async () => {
    const res = await request(app)
      .patch(`/api/referrals/${draftReferral._id}/review`)
      .set('Authorization', `Bearer ${doctorOtherToken}`)
      .send({
        selectedHospitalId: hospitalTop._id,
        newStatus: 'reviewed',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Security Policy Violation');
  });

  it('rejects override without a reason (400 Bad Request)', async () => {
    const res = await request(app)
      .patch(`/api/referrals/${draftReferral._id}/review`)
      .set('Authorization', `Bearer ${doctorOwnerToken}`)
      .send({
        selectedHospitalId: hospitalAlt._id, // Non-top hospital
        newStatus: 'reviewed',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Override reason must be at least 10 characters long');
  });

  it('rejects override when reason is shorter than 10 characters (400 Bad Request)', async () => {
    const res = await request(app)
      .patch(`/api/referrals/${draftReferral._id}/review`)
      .set('Authorization', `Bearer ${doctorOwnerToken}`)
      .send({
        selectedHospitalId: hospitalAlt._id,
        overrideReason: 'Too short', // 9 characters
        newStatus: 'reviewed',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Override reason must be at least 10 characters long');
  });

  it('allows confirming top-ranked hospital without an override reason', async () => {
    const res = await request(app)
      .patch(`/api/referrals/${draftReferral._id}/review`)
      .set('Authorization', `Bearer ${doctorOwnerToken}`)
      .send({
        selectedHospitalId: hospitalTop._id,
        newStatus: 'reviewed',
        requestRecordsConsent: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reviewed');
    expect(res.body.isOverride).toBe(false);

    // Verify AuditLog
    const audit = await AuditLog.findOne({
      resourceId: draftReferral._id.toString(),
      action: 'CONFIRM_REFERRAL',
    });
    expect(audit).not.toBeNull();
    expect(audit.actorRole).toBe('doctor');
    expect(audit.justification).toContain('confirmed top recommendation');
  });

  it('allows override of top-ranked hospital when valid reason (>= 10 chars) is provided and writes audit log', async () => {
    const clinicalReason = 'Patient has family caregiver staying near Erode General Hospital.';
    const res = await request(app)
      .patch(`/api/referrals/${draftReferral._id}/review`)
      .set('Authorization', `Bearer ${doctorOwnerToken}`)
      .send({
        selectedHospitalId: hospitalAlt._id,
        overrideReason: clinicalReason,
        newStatus: 'reviewed',
        requestRecordsConsent: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reviewed');
    expect(res.body.isOverride).toBe(true);
    expect(res.body.clinicianReview.overrideReason).toBe(clinicalReason);

    // Verify AuditLog
    const audit = await AuditLog.findOne({
      resourceId: draftReferral._id.toString(),
      action: 'OVERRIDE_REFERRAL',
    });
    expect(audit).not.toBeNull();
    expect(audit.actorRole).toBe('doctor');
    expect(audit.justification).toContain(clinicalReason);
    expect(audit.meta.overrideReason).toBe(clinicalReason);
    expect(audit.meta.isOverride).toBe(true);
  });

  it('can review by referralId string in addition to ObjectId', async () => {
    const res = await request(app)
      .patch(`/api/referrals/${draftReferral.referralId}/review`)
      .set('Authorization', `Bearer ${doctorOwnerToken}`)
      .send({
        selectedHospitalId: hospitalTop._id,
        newStatus: 'reviewed',
      });

    expect(res.status).toBe(200);
    expect(res.body.referralId).toBe(draftReferral.referralId);
    expect(res.body.status).toBe('reviewed');
  });
});
