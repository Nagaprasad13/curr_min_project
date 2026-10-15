const request = require('supertest');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const Hospital = require('../models/Hospital');
const Referral = require('../models/Referral');
const User = require('../models/User');
const { signToken } = require('../config/jwt');

describe('database-backed patient and referral directories', () => {
  let hospital;
  let otherHospital;
  let doctor;
  let otherDoctor;
  let admin;
  let patient;
  let otherPatient;
  let doctorToken;
  let otherDoctorToken;
  let patientToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    hospital = await Hospital.create({
      name: 'Synthetic directory hospital',
      code: 'HOSP-DIRECTORY-01',
      district: 'Salem',
      verificationStatus: 'verified',
      location: { latitude: 11.66, longitude: 78.14 },
      isSynthetic: true,
    });
    otherHospital = await Hospital.create({
      name: 'Synthetic other hospital',
      code: 'HOSP-DIRECTORY-02',
      district: 'Erode',
      verificationStatus: 'verified',
      location: { latitude: 11.34, longitude: 77.71 },
      isSynthetic: true,
    });
    [doctor, otherDoctor, patient, otherPatient, admin] = await User.create([
      { name: 'Directory Doctor', email: 'directory-doctor@carebridge.invalid', password: 'DirectoryPass123!', role: 'doctor', hospitalId: hospital._id, isSynthetic: true },
      { name: 'Other Doctor', email: 'other-directory-doctor@carebridge.invalid', password: 'DirectoryPass123!', role: 'doctor', hospitalId: otherHospital._id, isSynthetic: true },
      { name: 'Linked Patient', email: 'directory-patient@carebridge.invalid', password: 'DirectoryPass123!', role: 'patient', isSynthetic: true },
      { name: 'Unlinked Patient', email: 'unlinked-patient@carebridge.invalid', password: 'DirectoryPass123!', role: 'patient', isSynthetic: true },
      { name: 'Directory Admin', email: 'directory-admin@carebridge.invalid', password: 'DirectoryPass123!', role: 'hospital_admin', hospitalId: hospital._id, isSynthetic: true },
    ]);
    doctorToken = signToken({ id: doctor._id, role: doctor.role });
    otherDoctorToken = signToken({ id: otherDoctor._id, role: otherDoctor.role });
    patientToken = signToken({ id: patient._id, role: patient.role });
    await Hospital.findByIdAndUpdate(hospital._id, { adminUserId: admin._id });
    await Referral.create({
      referralId: 'REF-DIRECTORY-0001',
      patientId: patient._id,
      patientName: patient.name,
      referringDoctorId: doctor._id,
      referringHospitalId: hospital._id,
      requirements: {
        requiredSpecialty: 'General Medicine',
        patientCoordinates: { latitude: 11.66, longitude: 78.14 },
      },
    });
  });

  afterAll(async () => {
    await Referral.deleteMany({ referralId: 'REF-DIRECTORY-0001' });
    await User.deleteMany({ _id: { $in: [doctor._id, otherDoctor._id, patient._id, otherPatient._id, admin._id] } });
    await Hospital.deleteMany({ _id: { $in: [hospital._id, otherHospital._id] } });
    await disconnectDB();
  });

  it('returns only patients linked to the requesting doctor or hospital', async () => {
    const ownResponse = await request(app)
      .get('/api/patients?limit=10')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(ownResponse.status).toBe(200);
    expect(ownResponse.body.patients.map(({ _id }) => _id)).toEqual([patient._id.toString()]);
    expect(ownResponse.body.total).toBe(1);

    const otherResponse = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${otherDoctorToken}`);
    expect(otherResponse.status).toBe(200);
    expect(otherResponse.body.patients).toEqual([]);
  });

  it('returns referrals scoped to the authenticated patient or doctor', async () => {
    const patientResponse = await request(app)
      .get('/api/referrals')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patientResponse.status).toBe(200);
    expect(patientResponse.body.referrals.map(({ referralId }) => referralId)).toEqual(['REF-DIRECTORY-0001']);
    expect(patientResponse.body.referrals[0]).not.toHaveProperty('patientName');

    const doctorResponse = await request(app)
      .get('/api/referrals')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(doctorResponse.status).toBe(200);
    expect(doctorResponse.body.referrals[0].patientName).toBe(patient.name);
  });

  it('represents an unreported capacity as an unknown empty state rather than a not-found error', async () => {
    const token = signToken({ id: admin._id, role: admin.role, hospitalId: hospital._id });
    const response = await request(app)
      .get(`/api/hospitals/${hospital._id}/capacity/latest`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.snapshot).toBeNull();
    expect(response.body.telemetryAge).toBeNull();
  });
});
