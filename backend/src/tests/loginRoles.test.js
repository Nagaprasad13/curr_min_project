const request = require('supertest');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');

const roleAccounts = [
  { name: 'Patient Login Check', email: 'patient.logincheck@carebridge.test', password: 'PatientPass123!', role: 'patient' },
  { name: 'Doctor Login Check', email: 'doctor.logincheck@carebridge.test', password: 'DoctorPass123!', role: 'doctor' },
  { name: 'Hospital Admin Login Check', email: 'hospitaladmin.logincheck@carebridge.test', password: 'AdminPass123!', role: 'hospital_admin' },
  { name: 'Main Admin Login Check', email: 'mainadmin.logincheck@carebridge.test', password: 'ReviewerPass123!', role: 'platform_reviewer' },
];

describe('Role-based sign-in flow', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    await User.create(roleAccounts.map(({ name, email, password, role }) => ({
      name,
      email,
      password,
      role,
      isSynthetic: true,
    })));
  }, 180000);

  afterAll(async () => {
    await disconnectDB();
  }, 180000);

  it.each(roleAccounts)('authenticates the $role role and returns its verified session', async account => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);

    expect(loginResponse.body.user).toMatchObject({
      email: account.email,
      role: account.role,
    });
    expect(loginResponse.body.token).toBeTruthy();
    expect(loginResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/^accessToken=.*HttpOnly/i)])
    );

    const sessionResponse = await request(app)
      .get('/api/auth/me')
      .set('Cookie', loginResponse.headers['set-cookie'])
      .expect(200);
    expect(sessionResponse.body.user).toMatchObject({
      email: account.email,
      role: account.role,
    });
  });
});
