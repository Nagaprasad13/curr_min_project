const request = require('supertest');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const Hospital = require('../models/Hospital');
const Referral = require('../models/Referral');
const User = require('../models/User');
const Practitioner = require('../models/Practitioner');
const { signToken } = require('../config/jwt');

describe('Phase 8.4a hospital account authorization', () => {
  let hospitalA;
  let hospitalB;
  let adminA;
  let doctorA;
  let doctorB;
  let unassignedDoctor;
  let reviewer;
  let tokens;
  let referralId;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    [hospitalA, hospitalB] = await Hospital.create([
      {
        name: 'Synthetic Hospital A',
        code: 'HOSP-SCOPE-A',
        district: 'Salem',
        verificationStatus: 'verified',
        location: { latitude: 11.66, longitude: 78.14 },
        bedCounts: { general: 20, emergency: 4, icu: 2 },
        isSynthetic: true,
      },
      {
        name: 'Synthetic Hospital B',
        code: 'HOSP-SCOPE-B',
        district: 'Erode',
        verificationStatus: 'verified',
        location: { latitude: 11.34, longitude: 77.71 },
        bedCounts: { general: 20, emergency: 4, icu: 2 },
        isSynthetic: true,
      },
    ]);
    [adminA, doctorA, doctorB, unassignedDoctor, reviewer] = await User.create([
      { name: 'Admin A', email: 'admin.scope-a@carebridge.invalid', password: 'AdminPass123!', role: 'hospital_admin', hospitalId: hospitalA._id, isSynthetic: true },
      { name: 'Doctor A', email: 'doctor.scope-a@carebridge.invalid', password: 'DoctorPass123!', role: 'doctor', hospitalId: hospitalA._id, isSynthetic: true },
      { name: 'Doctor B', email: 'doctor.scope-b@carebridge.invalid', password: 'DoctorPass123!', role: 'doctor', hospitalId: hospitalB._id, isSynthetic: true },
      { name: 'Unassigned Doctor', email: 'doctor.unassigned@carebridge.invalid', password: 'DoctorPass123!', role: 'doctor', isSynthetic: true },
      { name: 'Reviewer', email: 'reviewer.scope@carebridge.invalid', password: 'ReviewerPass123!', role: 'platform_reviewer', isSynthetic: true },
    ]);
    await Hospital.findByIdAndUpdate(hospitalA._id, { adminUserId: adminA._id });
    await Practitioner.create({
      practitionerId: 'PRAC-SCOPE-0001',
      userId: doctorA._id,
      hospitalId: hospitalA._id,
      fullName: 'Dr. Doctor A',
      qualification: 'MBBS, MD',
      specialty: 'General Medicine',
      registrationNumber: 'SYN-TNC-901001',
      employmentStatus: 'active',
      verificationStatus: 'verified',
      isSynthetic: true,
    });
    const referral = await Referral.create({
      referralId: 'REF-SCOPE-0001',
      patientName: 'Synthetic Patient',
      referringDoctorId: doctorA._id,
      referringHospitalId: hospitalA._id,
      requirements: {
        requiredSpecialty: 'General Medicine',
        patientCoordinates: { latitude: 11.66, longitude: 78.14 },
      },
    });
    referralId = referral._id.toString();
    tokens = Object.fromEntries([adminA, doctorA, doctorB, unassignedDoctor, reviewer].map(user => [
      user.role === 'hospital_admin' ? 'adminA' :
        user.role === 'platform_reviewer' ? 'reviewer' :
          !user.hospitalId ? 'unassignedDoctor' :
          user.hospitalId.equals(hospitalA._id) ? 'doctorA' : 'doctorB',
      signToken({ id: user._id, email: user.email, role: user.role, hospitalId: user.hospitalId }),
    ]));
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('restricts hospital admin profile, directory, capacity, and roster to its assigned hospital', async () => {
    const ownProfile = await request(app)
      .get(`/api/hospitals/${hospitalA._id}`)
      .set('Authorization', `Bearer ${tokens.adminA}`);
    expect(ownProfile.status).toBe(200);

    const ownDirectory = await request(app)
      .get('/api/hospitals')
      .set('Authorization', `Bearer ${tokens.adminA}`);
    expect(ownDirectory.status).toBe(200);
    expect(ownDirectory.body.hospitals.map(hospital => hospital._id.toString())).toEqual([hospitalA._id.toString()]);

    const crossProfile = await request(app)
      .get(`/api/hospitals/${hospitalB._id}`)
      .set('Authorization', `Bearer ${tokens.adminA}`);
    expect(crossProfile.status).toBe(403);

    const crossEdit = await request(app)
      .put(`/api/hospitals/${hospitalB._id}`)
      .set('Authorization', `Bearer ${tokens.adminA}`)
      .send({ address: 'Must remain unchanged' });
    expect(crossEdit.status).toBe(403);

    const crossRoster = await request(app)
      .get(`/api/hospitals/${hospitalB._id}/practitioners`)
      .set('Authorization', `Bearer ${tokens.adminA}`);
    expect(crossRoster.status).toBe(403);

    const crossCapacity = await request(app)
      .put(`/api/hospitals/${hospitalB._id}/capacity`)
      .set('Authorization', `Bearer ${tokens.adminA}`)
      .send({ reportedBy: 'Cross-hospital attempt' });
    expect(crossCapacity.status).toBe(403);

    const invite = await request(app)
      .post('/api/auth/invite')
      .set('Authorization', `Bearer ${tokens.adminA}`)
      .send({ role: 'doctor', hospitalId: hospitalB._id });
    expect(invite.status).toBe(201);
    expect(invite.body.invite.hospitalId).toBe(hospitalA._id.toString());
  });

  it('limits doctor hospital context and referral access to the assigned hospital and own referrals', async () => {
    const ownRoster = await request(app)
      .get(`/api/hospitals/${hospitalA._id}/practitioners`)
      .set('Authorization', `Bearer ${tokens.doctorA}`);
    expect(ownRoster.status).toBe(200);

    const otherRoster = await request(app)
      .get(`/api/hospitals/${hospitalB._id}/practitioners`)
      .set('Authorization', `Bearer ${tokens.doctorA}`);
    expect(otherRoster.status).toBe(403);

    const ownReferral = await request(app)
      .get(`/api/referrals/${referralId}`)
      .set('Authorization', `Bearer ${tokens.doctorA}`);
    expect(ownReferral.status).toBe(200);

    const otherDoctorReferral = await request(app)
      .get(`/api/referrals/${referralId}`)
      .set('Authorization', `Bearer ${tokens.doctorB}`);
    expect(otherDoctorReferral.status).toBe(404);

    const unassignedDoctorRequest = await request(app)
      .get(`/api/hospitals/${hospitalA._id}/practitioners`)
      .set('Authorization', `Bearer ${tokens.unassignedDoctor}`);
    expect(unassignedDoctorRequest.status).toBe(403);
  });

  it('keeps the reviewer directory reviewer-only and returns per-hospital counts', async () => {
    const denied = await request(app)
      .get('/api/hospitals/reviewer-directory')
      .set('Authorization', `Bearer ${tokens.adminA}`);
    expect(denied.status).toBe(403);

    const directory = await request(app)
      .get('/api/hospitals/reviewer-directory')
      .set('Authorization', `Bearer ${tokens.reviewer}`);
    expect(directory.status).toBe(200);
    expect(directory.body.hospitals).toHaveLength(2);
    expect(directory.body.hospitals[0]).toHaveProperty('admins');
    expect(directory.body.hospitals[0]).toHaveProperty('practitionerCounts');
    expect(directory.body.hospitals[0]).toHaveProperty('latestCapacity');
  });

  it('rejects synthetic seeded-account login in production mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: adminA.email, password: 'AdminPass123!' });
      expect(response.status).toBe(401);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
