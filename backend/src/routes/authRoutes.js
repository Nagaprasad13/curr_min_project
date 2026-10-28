const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const RefreshToken = require('../models/RefreshToken');
const InviteCode = require('../models/InviteCode');
const {
  signAccessToken,
  generateRefreshTokenString,
  hashToken,
  getCookieOptions,
  REFRESH_TOKEN_EXPIRY_DAYS,
} = require('../config/jwt');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditService');
const { createLoginRateLimiter } = require('../middleware/rateLimiter');
const { setCsrfCookie } = require('../middleware/csrf');
const { generateBase32Secret, generateTOTP, verifyTOTP, generateOtpAuthUrl } = require('../utils/totp');

const loginLimiter = createLoginRateLimiter({
  maxFailures: 5,
  lockoutMs: 15 * 60 * 1000, // 15 minutes lockout
});

// Helper to validate password policy
function isValidPassword(password) {
  if (typeof password !== 'string' || password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
}

// Helper to issue access & refresh tokens and set cookies
async function issueSessionCookies(user, req, res) {
  const accessToken = signAccessToken({
    id: user._id,
    email: user.email,
    role: user.role,
    hospitalId: user.hospitalId,
  });

  const refreshTokenString = generateRefreshTokenString();
  const tokenHash = hashToken(refreshTokenString);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Persist refresh token in MongoDB
  await RefreshToken.create({
    tokenHash,
    userId: user._id,
    expiresAt,
    ipAddress: req.ip || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'Unknown',
  });

  // Set httpOnly cookies
  res.cookie('accessToken', accessToken, getCookieOptions({ isRefresh: false }));
  res.cookie('refreshToken', refreshTokenString, getCookieOptions({ isRefresh: true }));

  // Set CSRF token cookie
  setCsrfCookie(res);

  return { accessToken, refreshTokenString };
}

/**
 * GET /api/auth/csrf
 * Issues a fresh CSRF token cookie for single-page applications.
 */
router.get('/csrf', (req, res) => {
  const token = setCsrfCookie(res);
  return res.json({ csrfToken: token });
});

/**
 * POST /api/auth/login
 * Real login with MongoDB-persisted brute force lockout, optional 2FA, and httpOnly cookies.
 */
router.post('/login', loginLimiter.check, async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required and must be valid strings.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      await loginLimiter.recordFailure(req);
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    }

    if (process.env.NODE_ENV === 'production' && user.isSynthetic) {
      await loginLimiter.recordFailure(req);
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await loginLimiter.recordFailure(req);
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    }

    // Enforce mandatory 2FA for staff roles in production
    const isStaffRole = ['hospital_admin', 'platform_reviewer'].includes(user.role);
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && isStaffRole && !user.isTwoFactorEnabled) {
      const enrollmentToken = signAccessToken({
        id: user._id,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        scope: '2fa_enrollment',
      });

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Two-factor authentication is mandatory for hospital administrators and reviewers in production. A limited-scope session has been issued to complete enrollment.',
        requires2FAEnrollment: true,
        enrollmentToken,
      });
    }

    // Block triage nurses who are not verified or active
    if (user.role === 'triage_nurse' && !['active', 'verified'].includes(user.status)) {
      await loginLimiter.recordFailure(req);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Your nurse account is not yet verified by the hospital administrator, or has been deactivated. Please contact your hospital admin.',
        nurseStatus: user.status,
      });
    }

    // Check 2FA (TOTP)
    if (user.isTwoFactorEnabled && user.twoFactorSecret) {
      if (!twoFactorCode) {
        return res.status(403).json({
          error: 'Two-Factor Required',
          message: 'Two-factor authentication code is required to complete login.',
          requires2FA: true,
        });
      }

      const isValidCode = verifyTOTP(twoFactorCode, user.twoFactorSecret);
      if (!isValidCode) {
        await loginLimiter.recordFailure(req);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid two-factor authentication code.',
        });
      }
    }

    // Success: clear lockout counters in MongoDB
    await loginLimiter.recordSuccess(req);

    // Issue tokens and cookies
    const { accessToken } = await issueSessionCookies(user, req, res);

    await recordAuditLog({
      actorId: user._id,
      actorRole: user.role,
      action: 'SYSTEM_AUDIT',
      resourceType: 'User',
      resourceId: user._id.toString(),
      accessGranted: true,
      justification: 'User successfully logged in via credentials',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      message: 'Login successful',
      token: accessToken, // for backward compatibility with programmatic test callers
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        district: user.district,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh token rotation with reuse compromise detection.
 */
router.post('/refresh', async (req, res) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!rawRefreshToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token missing. Please log in again.',
      });
    }

    const tokenHash = hashToken(rawRefreshToken);
    const existingToken = await RefreshToken.findOne({ tokenHash });

    if (!existingToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid refresh token.',
      });
    }

    // Compromise detection: if a revoked token is used again, revoke all tokens for this user!
    if (existingToken.revokedAt) {
      console.warn(`[Security Alert] Re-use of revoked refresh token detected for user: ${existingToken.userId}`);
      await RefreshToken.updateMany(
        { userId: existingToken.userId, revokedAt: null },
        { revokedAt: new Date(), revokedReason: 'Compromise: Re-use of previously revoked token detected' }
      );
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      res.clearCookie('XSRF-TOKEN');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Security breach detected: Revoked token was re-used. All active sessions invalidated.',
      });
    }

    if (new Date() > existingToken.expiresAt) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token expired. Please log in again.',
      });
    }

    const user = await User.findById(existingToken.userId);
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User account no longer exists.',
      });
    }

    // Token Rotation: Generate new token and revoke the old one
    const newRefreshTokenString = generateRefreshTokenString();
    const newTokenHash = hashToken(newRefreshTokenString);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    existingToken.revokedAt = new Date();
    existingToken.revokedReason = 'Rotated during refresh';
    existingToken.replacedByTokenHash = newTokenHash;
    await existingToken.save();

    await RefreshToken.create({
      tokenHash: newTokenHash,
      userId: user._id,
      expiresAt: newExpiresAt,
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown',
    });

    const newAccessToken = signAccessToken({
      id: user._id,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId,
    });

    res.cookie('accessToken', newAccessToken, getCookieOptions({ isRefresh: false }));
    res.cookie('refreshToken', newRefreshTokenString, getCookieOptions({ isRefresh: true }));
    setCsrfCookie(res);

    return res.json({
      message: 'Token refreshed successfully',
      token: newAccessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        district: user.district,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/logout
 * Revokes refresh token in MongoDB and clears all session cookies.
 */
router.post('/logout', async (req, res) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await RefreshToken.findOneAndUpdate(
        { tokenHash, revokedAt: null },
        { revokedAt: new Date(), revokedReason: 'User logout' }
      );
    }

    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    res.clearCookie('XSRF-TOKEN', { path: '/' });

    return res.json({ message: 'Logged out successfully. All session tokens invalidated.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/register
 * Public self-registration. Strictly restricted to role: 'patient'.
 * Doctors and hospital admins cannot self-register; they require an invite code.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, district, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Name, email, and password are required.',
      });
    }

    // Prevent client role spoofing: public registration is strictly for patients
    if (role && role !== 'patient') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Public self-registration is restricted to patients only. Healthcare doctors and hospital admins must register via an official invite code.',
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Password must be at least 8 characters long and contain both letters and numbers.',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A user with this email address already exists.',
      });
    }

    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: 'patient', // Server-enforced role
      phone,
      district,
      isSynthetic: true,
    });

    await user.save();

    const { accessToken } = await issueSessionCookies(user, req, res);

    return res.status(201).json({
      message: 'Patient registered successfully',
      token: accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        district: user.district,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/register-invited
 * Registration for doctors and hospital admins via an administrator invite code.
 */
router.post('/register-invited', async (req, res) => {
  try {
    const { name, email, password, inviteCode, phone, district } = req.body;

    if (!name || !email || !password || !inviteCode) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Name, email, password, and inviteCode are required.',
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Password must be at least 8 characters long and contain both letters and numbers.',
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A user with this email address already exists.',
      });
    }

    const invite = await InviteCode.findOne({ code: inviteCode.trim().toUpperCase() });
    if (!invite || !invite.isValid()) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The supplied invite code is invalid, already redeemed, or expired.',
      });
    }

    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: invite.role, // Derived strictly from verified invite
      hospitalId: invite.hospitalId,
      phone,
      district,
      isSynthetic: true,
      qualification: invite.role === 'triage_nurse' ? (req.body.qualification || 'B.Sc Nursing (Registered Nurse)') : undefined,
      registrationNumber: invite.role === 'triage_nurse' ? (req.body.registrationNumber || `SYN-NUR-${Math.floor(1000 + Math.random() * 9000)}`) : undefined,
      supervisingDoctorIds: invite.role === 'triage_nurse' ? (invite.supervisingDoctorIds || req.body.supervisingDoctorIds || []) : undefined,
      status: 'active',
    });

    await user.save();

    // Mark invite as redeemed
    invite.used = true;
    invite.usedBy = user._id;
    invite.usedAt = new Date();
    await invite.save();

    // If hospital_admin, associate with Hospital document
    if (user.role === 'hospital_admin' && user.hospitalId) {
      await Hospital.findByIdAndUpdate(user.hospitalId, { adminUserId: user._id });
    }

    const { accessToken } = await issueSessionCookies(user, req, res);

    const roleDisplay = invite.role === 'doctor' ? 'Doctor' : invite.role === 'triage_nurse' ? 'Triage Nurse' : 'Hospital Admin';
    return res.status(201).json({
      message: `${roleDisplay} registered successfully via invite`,
      token: accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        district: user.district,
        qualification: user.qualification,
        registrationNumber: user.registrationNumber,
        supervisingDoctorIds: user.supervisingDoctorIds,
        status: user.status,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/invite
 * Create an invite code for doctors, hospital administrators, or triage nurses.
 * Restricted to hospital_admin (for their own hospital) and platform_reviewer.
 */
router.post(
  '/invite',
  authenticate,
  authorizeRoles('hospital_admin', 'platform_reviewer'),
  async (req, res) => {
    try {
      const { role, hospitalId, durationDays = 7, supervisingDoctorIds } = req.body;

      if (!role || !['doctor', 'hospital_admin', 'triage_nurse'].includes(role)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'role must be "doctor", "hospital_admin", or "triage_nurse".',
        });
      }

      // If hospital_admin, enforce ownership of hospitalId
      let targetHospitalId = hospitalId;
      if (req.user.role === 'hospital_admin') {
        targetHospitalId = req.user.hospitalId;
        if (!targetHospitalId) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Your account is not assigned to a hospital and cannot create staff invitations.',
          });
        }
      }

      if (!targetHospitalId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Valid hospitalId is required for staff invitation.',
        });
      }

      const codePrefix = role === 'doctor' ? 'INV-DOC' : role === 'triage_nurse' ? 'INV-NUR' : 'INV-ADM';
      const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
      const code = `${codePrefix}-${randomSuffix}`;
      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

      const invite = await InviteCode.create({
        code,
        role,
        hospitalId: targetHospitalId,
        supervisingDoctorIds: role === 'triage_nurse' ? (supervisingDoctorIds || []) : [],
        createdBy: req.user._id,
        expiresAt,
      });

      return res.status(201).json({
        message: 'Invite code generated successfully',
        invite: {
          code: invite.code,
          role: invite.role,
          hospitalId: invite.hospitalId,
          expiresAt: invite.expiresAt,
          supervisingDoctorIds: invite.supervisingDoctorIds,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/auth/forgot-password
 * Password recovery flow. Stubs token in development; never leaks tokens in production.
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Bad Request', message: 'Email address is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (user) {
      const resetTokenRaw = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetTokenRaw).digest('hex');

      user.passwordResetToken = resetTokenHash;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity
      await user.save();

      // In non-production development mode, log the reset URL to the terminal
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Dev Auth Stub] Password reset link for ${user.email}:`);
        console.log(`  http://localhost:3000/reset-password?token=${resetTokenRaw}`);
      }
      // In production mode, NO token or link is logged to console (strict privacy hygiene)
    }

    return res.json({
      message: 'If an account associated with that email exists, password reset instructions have been dispatched.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/reset-password
 * Verifies reset token and updates password.
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Reset token and newPassword are required.',
      });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Password must be at least 8 characters long and contain both letters and numbers.',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const user = await User.findOne({
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Password reset token is invalid or has expired.',
      });
    }

    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    return res.json({
      message: 'Password has been successfully updated. You may now log in with your new credentials.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/change-password
 * Authenticated password update endpoint.
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'currentPassword and newPassword are required.',
      });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Current password is incorrect.' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'New password must be at least 8 characters long and contain both letters and numbers.',
      });
    }

    user.password = newPassword;
    await user.save();

    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/2fa/generate
 * Generates RFC 6238 TOTP setup secret.
 */
router.post('/2fa/generate', authenticate, async (req, res) => {
  try {
    const secret = generateBase32Secret();
    const otpAuthUrl = generateOtpAuthUrl({
      issuer: 'CareBridge-Research',
      label: req.user.email,
      secret,
    });

    return res.json({
      secret,
      otpAuthUrl,
      notice: 'Store this secret securely and enter the 6-digit verification code to activate.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/2fa/enable
 * Validates verification code and enables TOTP for account.
 */
router.post('/2fa/enable', authenticate, async (req, res) => {
  try {
    const { secret, code } = req.body;
    if (!secret || !code) {
      return res.status(400).json({ error: 'Bad Request', message: 'secret and 6-digit verification code are required.' });
    }

    const isValid = verifyTOTP(code, secret);
    if (!isValid) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid verification code.' });
    }

    const user = await User.findById(req.user._id);
    user.isTwoFactorEnabled = true;
    user.twoFactorSecret = secret;
    await user.save();

    // Issue full session cookies and full access token
    const { accessToken } = await issueSessionCookies(user, req, res);

    return res.json({
      message: 'Two-factor authentication successfully enabled. Full session established.',
      isTwoFactorEnabled: true,
      token: accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        district: user.district,
        isTwoFactorEnabled: true,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/2fa/disable
 * Disables TOTP 2FA.
 */
router.post('/2fa/disable', authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id);

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Incorrect password confirmation.' });
    }

    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = null;
    await user.save();

    return res.json({
      message: 'Two-factor authentication successfully disabled.',
      isTwoFactorEnabled: false,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/demo-login
 * Development-only demo login. Only available when DEMO_MODE=true AND NODE_ENV !== 'production'.
 * Server strictly refuses demo login in production environments.
 */
router.get('/demo-accounts', async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Demo authentication is disabled.',
    });
  }

  const records = await User.find({
    isSynthetic: true,
    role: { $in: ['patient', 'doctor', 'hospital_admin', 'platform_reviewer'] },
  })
    .select('name email role')
    .sort({ role: 1, name: 1 })
    .lean();
  const roles = new Set();
  const accounts = records.filter(account => {
    if (roles.has(account.role)) return false;
    roles.add(account.role);
    return true;
  });

  return res.json({ accounts });
});

router.post('/demo-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Demo authentication is disabled. Production mode enforces real credentials only.',
    });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Bad Request', message: 'Target demo email is required.' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim(), isSynthetic: true });
  if (!user) {
    return res.status(404).json({ error: 'Not Found', message: 'Synthetic demo account not found.' });
  }

  const { accessToken } = await issueSessionCookies(user, req, res);

  return res.json({
    message: `Demo login established as ${user.name} (${user.role})`,
    token: accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId,
      district: user.district,
      isDemo: true,
    },
  });
});

/**
 * GET /api/auth/me
 * Returns profile of current authenticated user.
 */
router.get('/me', authenticate, async (req, res) => {
  return res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      hospitalId: req.user.hospitalId,
      district: req.user.district,
      isTwoFactorEnabled: req.user.isTwoFactorEnabled || false,
      qualification: req.user.qualification,
      registrationNumber: req.user.registrationNumber,
      supervisingDoctorIds: req.user.supervisingDoctorIds,
      status: req.user.status,
    },
  });
});

/**
 * POST /api/auth/logout
 * Clears session cookies and invalidates user session.
 */
router.post('/logout', async (req, res) => {
  try {
    res.clearCookie('accessToken', getCookieOptions({ isRefresh: false }));
    res.clearCookie('refreshToken', getCookieOptions({ isRefresh: true }));
    res.clearCookie('carebridge_csrf');
    return res.json({ message: 'Successfully logged out and session cleared.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

module.exports = router;
