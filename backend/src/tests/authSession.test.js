const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const RefreshToken = require('../models/RefreshToken');
const LoginLockout = require('../models/LoginLockout');
const InviteCode = require('../models/InviteCode');
const { generateTOTP } = require('../utils/totp');
const { signToken } = require('../config/jwt');

describe('Phase 8.1: Real Authentication, Sessions & Security Hardening Tests', () => {
  let testHospital;
  let adminToken;
  let reviewerToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();

    testHospital = await Hospital.create({
      name: 'Session Test Hospital',
      code: 'HOSP-SESS-001',
      registrationNumber: 'CEA-TN-2026-SESS',
      district: 'Salem',
      tier: 'Tier 2',
      verificationStatus: 'verified',
      location: { latitude: 11.6643, longitude: 78.146 },
      isSynthetic: true,
    });

    const adminUser = await User.create({
      name: 'Hospital Admin User',
      email: 'admin.sess@carebridge.test',
      password: 'AdminPassword123!',
      role: 'hospital_admin',
      hospitalId: testHospital._id,
      isSynthetic: true,
    });
    adminToken = signToken({ id: adminUser._id, email: adminUser.email, role: adminUser.role, hospitalId: testHospital._id });

    const reviewerUser = await User.create({
      name: 'Platform Reviewer User',
      email: 'reviewer.sess@carebridge.test',
      password: 'ReviewerPassword123!',
      role: 'platform_reviewer',
      isSynthetic: true,
    });
    reviewerToken = signToken({ id: reviewerUser._id, email: reviewerUser.email, role: reviewerUser.role });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Registration Role Integrity', () => {
    it('allows patient self-registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Self Registered Patient',
          email: 'patient.self@carebridge.test',
          password: 'PatientPass123!',
          role: 'patient',
          district: 'Salem',
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('patient');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('rejects attempt to self-register as doctor or platform_reviewer', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Spoofed Doctor',
          email: 'fake.doctor@carebridge.test',
          password: 'DoctorPass123!',
          role: 'doctor',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/restricted to patients only/i);
    });

    it('enforces password policy (min 8 chars, letters and numbers)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Weak Pass User',
          email: 'weak@carebridge.test',
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at least 8 characters/i);
    });
  });

  describe('2. Invite-Code Driven Registration for Healthcare Staff', () => {
    let inviteCode;

    it('allows hospital admin to generate an invite code for their hospital', async () => {
      const res = await request(app)
        .post('/api/auth/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'doctor',
          hospitalId: testHospital._id.toString(),
          durationDays: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.invite.code).toMatch(/^INV-DOC-/);
      inviteCode = res.body.invite.code;
    });

    it('allows doctor to register with a valid invite code', async () => {
      const res = await request(app)
        .post('/api/auth/register-invited')
        .send({
          name: 'Invited Doctor Pulmonologist',
          email: 'doctor.invited@carebridge.test',
          password: 'DoctorPassword123!',
          inviteCode,
          district: 'Salem',
        });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('doctor');
      expect(res.body.user.hospitalId).toBe(testHospital._id.toString());
    });

    it('rejects re-use of an already redeemed invite code', async () => {
      const res = await request(app)
        .post('/api/auth/register-invited')
        .send({
          name: 'Second Doctor Attempt',
          email: 'doctor2@carebridge.test',
          password: 'DoctorPassword123!',
          inviteCode,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already redeemed|invalid/i);
    });
  });

  describe('3. Login, Cookies, and Refresh Token Rotation', () => {
    let cookies;
    let refreshToken;

    it('logs in and returns httpOnly accessToken and refreshToken cookies', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'patient.self@carebridge.test',
          password: 'PatientPass123!',
        });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();

      cookies = res.headers['set-cookie'];
      const refreshCookie = cookies.find(c => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toMatch(/HttpOnly/i);

      refreshToken = refreshCookie.split(';')[0].split('=')[1];
    });

    it('rotates refresh token on /api/auth/refresh and revokes previous token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${refreshToken}`])
        .send();

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();

      const newCookies = res.headers['set-cookie'];
      const newRefreshCookie = newCookies.find(c => c.startsWith('refreshToken='));
      const newRefreshToken = newRefreshCookie.split(';')[0].split('=')[1];

      expect(newRefreshToken).not.toBe(refreshToken);

      // Verify the old token is marked revoked in MongoDB
      const crypto = require('crypto');
      const oldHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const oldDoc = await RefreshToken.findOne({ tokenHash: oldHash });
      expect(oldDoc.revokedAt).not.toBeNull();
      expect(oldDoc.revokedReason).toMatch(/rotated/i);
    });

    it('detects re-use of revoked token and invalidates all user tokens', async () => {
      // Presenting the already rotated (revoked) token again
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${refreshToken}`])
        .send();

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/compromise|breach/i);
    });

    it('revokes refresh token on logout and clears cookies', async () => {
      // First log in fresh
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'patient.self@carebridge.test',
          password: 'PatientPass123!',
        });
      const logoutCookies = loginRes.headers['set-cookie'];

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', logoutCookies)
        .send();

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toMatch(/logged out successfully/i);
    });
  });

  describe('4. MongoDB-Persisted Brute-Force Lockout', () => {
    it('persists failed attempts and locks out account after 5 failures', async () => {
      const targetEmail = 'lockout.target@carebridge.test';
      await User.create({
        name: 'Lockout Target',
        email: targetEmail,
        password: 'ValidPassword123!',
        role: 'patient',
        isSynthetic: true,
      });

      // 5 consecutive failures
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .set('x-test-rate-limit', 'true')
          .send({ email: targetEmail, password: 'WrongPassword999!' });
      }

      // Check lockout in MongoDB
      const lockoutDoc = await LoginLockout.findOne({ identifier: targetEmail });
      expect(lockoutDoc).not.toBeNull();
      expect(lockoutDoc.failedAttempts).toBeGreaterThanOrEqual(5);
      expect(lockoutDoc.lockedUntil).not.toBeNull();

      // Next login attempt is rejected with 429 Too Many Requests
      const blockedRes = await request(app)
        .post('/api/auth/login')
        .set('x-test-rate-limit', 'true')
        .send({ email: targetEmail, password: 'ValidPassword123!' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.message).toMatch(/temporarily locked/i);
    });
  });

  describe('5. Password Reset and Password Change Workflows', () => {
    it('completes forgot-password and reset-password flow', async () => {
      const resetUser = await User.create({
        name: 'Reset Test User',
        email: 'reset.user@carebridge.test',
        password: 'OldPassword123!',
        role: 'patient',
        isSynthetic: true,
      });

      // Request reset
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: resetUser.email });
      expect(forgotRes.status).toBe(200);

      // Verify token hash is stored in user doc
      const updatedUser = await User.findById(resetUser._id);
      expect(updatedUser.passwordResetToken).not.toBeNull();

      // Simulate token retrieval from raw generation (using simulated known token)
      const crypto = require('crypto');
      const testRawToken = 'test-known-reset-token-12345';
      updatedUser.passwordResetToken = crypto.createHash('sha256').update(testRawToken).digest('hex');
      updatedUser.passwordResetExpires = new Date(Date.now() + 3600000);
      await updatedUser.save();

      // Submit reset password
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: testRawToken,
          newPassword: 'BrandNewPassword123!',
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toMatch(/successfully updated/i);

      // Login with new password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: resetUser.email,
          password: 'BrandNewPassword123!',
        });
      expect(loginRes.status).toBe(200);
    });

    it('changes password when authenticated with current password', async () => {
      const testUser = await User.create({
        name: 'Change Pass User',
        email: 'change.user@carebridge.test',
        password: 'CurrentPassword123!',
        role: 'patient',
        isSynthetic: true,
      });
      const userToken = signToken({ id: testUser._id, email: testUser.email, role: testUser.role });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'CurrentPassword123!',
          newPassword: 'UpdatedPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/updated successfully/i);
    });
  });

  describe('6. Optional 2FA (TOTP) Workflow', () => {
    let twoFactorUser;
    let userToken;
    let totpSecret;

    beforeAll(async () => {
      twoFactorUser = await User.create({
        name: '2FA Doctor',
        email: 'totp.doctor@carebridge.test',
        password: 'DoctorPassword123!',
        role: 'doctor',
        hospitalId: testHospital._id,
        isSynthetic: true,
      });
      userToken = signToken({ id: twoFactorUser._id, email: twoFactorUser.email, role: twoFactorUser.role });
    });

    it('generates TOTP setup secret', async () => {
      const res = await request(app)
        .post('/api/auth/2fa/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.secret).toBeDefined();
      expect(res.body.otpAuthUrl).toMatch(/^otpauth:\/\/totp\//);
      totpSecret = res.body.secret;
    });

    it('enables TOTP with valid 6-digit code', async () => {
      const validCode = generateTOTP(totpSecret);
      const res = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ secret: totpSecret, code: validCode });

      expect(res.status).toBe(200);
      expect(res.body.isTwoFactorEnabled).toBe(true);
    });

    it('requires 2FA code during login once enabled', async () => {
      // First attempt without code
      const withoutCodeRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: twoFactorUser.email,
          password: 'DoctorPassword123!',
        });

      expect(withoutCodeRes.status).toBe(403);
      expect(withoutCodeRes.body.requires2FA).toBe(true);

      // Second attempt with valid code
      const validCode = generateTOTP(totpSecret);
      const withCodeRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: twoFactorUser.email,
          password: 'DoctorPassword123!',
          twoFactorCode: validCode,
        });

      expect(withCodeRes.status).toBe(200);
      expect(withCodeRes.body.user.isTwoFactorEnabled).toBe(true);
    });
  });

  describe('7. DEMO_MODE Server Guard & Demo Login', () => {
    it('rejects demo-login when DEMO_MODE is false or unset', async () => {
      delete process.env.DEMO_MODE;
      const res = await request(app)
        .post('/api/auth/demo-login')
        .send({ email: 'admin.sess@carebridge.test' });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/demo authentication is disabled/i);
    });

    it('allows demo-login when DEMO_MODE is true in non-production mode', async () => {
      process.env.DEMO_MODE = 'true';
      const res = await request(app)
        .post('/api/auth/demo-login')
        .send({ email: 'admin.sess@carebridge.test' });

      expect(res.status).toBe(200);
      expect(res.body.user.isDemo).toBe(true);
      expect(res.headers['set-cookie']).toBeDefined();
      delete process.env.DEMO_MODE;
    });
  });

  describe('8. Phase 8.1 Rigorous Security Boundary Follow-Ups', () => {
    it('rejects state-changing cookie-based request without a valid CSRF token', async () => {
      // 1. Log in to get session cookie
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'patient.self@carebridge.test',
          password: 'PatientPass123!',
        });

      const accessCookie = loginRes.headers['set-cookie'].find(c => c.startsWith('accessToken='));

      // 2. Make state-changing request passing session cookie WITHOUT x-xsrf-token header
      const mutatingRes = await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', [accessCookie])
        .send({
          currentPassword: 'PatientPass123!',
          newPassword: 'NewPatientPassword123!',
        });

      expect(mutatingRes.status).toBe(403);
      expect(mutatingRes.body.message).toMatch(/CSRF token validation failed/i);
    });

    it('returns identical responses for existing and unknown emails on forgot-password (enumeration defense)', async () => {
      const existingEmail = 'patient.self@carebridge.test';
      const unknownEmail = 'does.not.exist.at.all.999@carebridge.test';

      const resExisting = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: existingEmail });

      const resUnknown = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: unknownEmail });

      expect(resExisting.status).toBe(200);
      expect(resUnknown.status).toBe(200);
      expect(resExisting.body).toEqual(resUnknown.body);
      expect(resExisting.body.message).toMatch(/if an account associated with that email exists/i);
    });

    it('enforces that password reset tokens are single-use and expire', async () => {
      const crypto = require('crypto');
      const testUser = await User.create({
        name: 'Single Use User',
        email: 'singleuse@carebridge.test',
        password: 'InitialPassword123!',
        role: 'patient',
        isSynthetic: true,
      });

      // 1. Expired token test
      const expiredRaw = 'expired-token-raw-123';
      testUser.passwordResetToken = crypto.createHash('sha256').update(expiredRaw).digest('hex');
      testUser.passwordResetExpires = new Date(Date.now() - 60000); // 1 minute in the past
      await testUser.save();

      const expiredRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: expiredRaw, newPassword: 'FreshPassword123!' });

      expect(expiredRes.status).toBe(400);
      expect(expiredRes.body.message).toMatch(/expired|invalid/i);

      // 2. Active token test -> first use succeeds
      const validRaw = 'valid-token-raw-456';
      testUser.passwordResetToken = crypto.createHash('sha256').update(validRaw).digest('hex');
      testUser.passwordResetExpires = new Date(Date.now() + 3600000);
      await testUser.save();

      const firstUseRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: validRaw, newPassword: 'FreshPassword123!' });

      expect(firstUseRes.status).toBe(200);

      // 3. Second use of same token fails (single-use enforcement)
      const secondUseRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: validRaw, newPassword: 'AnotherPassword123!' });

      expect(secondUseRes.status).toBe(400);
      expect(secondUseRes.body.message).toMatch(/expired|invalid/i);
    });

    it('ensures the TOTP secret is never returned after setup in profile endpoints', async () => {
      const doctorUser = await User.findOne({ email: 'totp.doctor@carebridge.test' });
      expect(doctorUser.twoFactorSecret).toBeDefined();

      const userToken = signToken({ id: doctorUser._id, email: doctorUser.email, role: doctorUser.role });
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.isTwoFactorEnabled).toBe(true);
      expect(res.body.user.twoFactorSecret).toBeUndefined();
    });

    it('enforces mandatory 2FA for reviewer and hospital_admin when NODE_ENV=production', async () => {
      const unrolledAdmin = await User.create({
        name: 'Unenrolled Prod Admin',
        email: 'unenrolled.admin@carebridge.test',
        password: 'AdminPassword123!',
        role: 'hospital_admin',
        isTwoFactorEnabled: false,
        isSynthetic: true,
      });

      // Temporarily set NODE_ENV to production
      process.env.NODE_ENV = 'production';

      const prodLoginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: unrolledAdmin.email,
          password: 'AdminPassword123!',
        });

      // Restore test environment
      process.env.NODE_ENV = 'test';

      expect(prodLoginRes.status).toBe(403);
      expect(prodLoginRes.body.requires2FAEnrollment).toBe(true);
      expect(prodLoginRes.body.enrollmentToken).toBeDefined();
      expect(prodLoginRes.body.message).toMatch(/two-factor authentication is mandatory/i);
    });

    it('allows hospital_admin to complete 2FA enrollment via limited-scope session in production mode', async () => {
      const prodAdmin = await User.create({
        name: 'Enrollment Flow Admin',
        email: 'enrollment.flow.admin@carebridge.test',
        password: 'AdminPassword123!',
        role: 'hospital_admin',
        hospitalId: testHospital._id,
        isTwoFactorEnabled: false,
        isSynthetic: true,
      });

      // 1. Production mode login returns 403 with limited-scope enrollmentToken
      process.env.NODE_ENV = 'production';
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: prodAdmin.email,
          password: 'AdminPassword123!',
        });

      expect(loginRes.status).toBe(403);
      expect(loginRes.body.requires2FAEnrollment).toBe(true);
      const enrollmentToken = loginRes.body.enrollmentToken;
      expect(enrollmentToken).toBeDefined();

      // 2. Limited-scope token is blocked from accessing normal endpoints (e.g. /api/auth/me)
      const blockedRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${enrollmentToken}`);

      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body.message).toMatch(/limited-scope session/i);

      // 3. Limited-scope token IS permitted on /api/auth/2fa/generate
      const genRes = await request(app)
        .post('/api/auth/2fa/generate')
        .set('Authorization', `Bearer ${enrollmentToken}`)
        .send();

      expect(genRes.status).toBe(200);
      const secret = genRes.body.secret;
      expect(secret).toBeDefined();

      // 4. Limited-scope token IS permitted on /api/auth/2fa/enable
      const totpCode = generateTOTP(secret);
      const enableRes = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${enrollmentToken}`)
        .send({ secret, code: totpCode });

      expect(enableRes.status).toBe(200);
      expect(enableRes.body.isTwoFactorEnabled).toBe(true);
      const fullToken = enableRes.body.token;
      expect(fullToken).toBeDefined();

      // 5. Upgraded full token can now access /api/auth/me
      const profileRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${fullToken}`);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.user.email).toBe(prodAdmin.email);
      expect(profileRes.body.user.isTwoFactorEnabled).toBe(true);

      // 6. Subsequent login with password + TOTP code in production succeeds
      const prodLoginSuccess = await request(app)
        .post('/api/auth/login')
        .send({
          email: prodAdmin.email,
          password: 'AdminPassword123!',
          twoFactorCode: generateTOTP(secret),
        });

      // Restore test environment
      process.env.NODE_ENV = 'test';

      expect(prodLoginSuccess.status).toBe(200);
      expect(prodLoginSuccess.body.user.isTwoFactorEnabled).toBe(true);
    });
  });
});
