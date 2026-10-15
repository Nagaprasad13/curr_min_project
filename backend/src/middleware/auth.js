const { verifyAccessToken } = require('../config/jwt');
const User = require('../models/User');
const Hospital = require('../models/Hospital');

/**
 * Authenticate incoming request via httpOnly cookie or JWT Bearer header.
 * Prioritizes secure httpOnly cookies in browser contexts; falls back to Bearer token
 * for backward compatibility and automated tests.
 */
async function authenticate(req, res, next) {
  try {
    let token = null;

    // 1. Check httpOnly cookie
    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    // 2. Check Authorization Bearer header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication session missing or invalid. Please log in or supply a valid token.',
      });
    }

    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.id).select('-password -twoFactorSecret');
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'The user account associated with this session no longer exists.',
      });
    }

    req.user = user;
    req.tokenScope = decoded.scope || 'full';

    // If token has limited scope for 2FA enrollment, restrict to 2FA enrollment endpoints only
    if (decoded.scope === '2fa_enrollment') {
      const currentPath = (req.baseUrl || '') + (req.path || '');
      const allowedPaths = ['/api/auth/2fa/generate', '/api/auth/2fa/enable'];
      if (!allowedPaths.some(p => currentPath === p || req.originalUrl?.split('?')[0] === p)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Limited-scope session. You must complete two-factor authentication enrollment before accessing other endpoints.',
        });
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Session verification failed or token expired. Please refresh your session or log in again.',
      details: err.message,
    });
  }
}

/**
 * Authorize only specified roles.
 * @param  {...string} roles Allowed roles ('hospital_admin', 'platform_reviewer', 'doctor', 'patient')
 */
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Role "${req.user ? req.user.role : 'unauthenticated'}" is not authorized for this resource.`,
      });
    }
    next();
  };
}

/**
 * Enforces server-side hospital ownership.
 * A hospital_admin can only read or edit their OWN hospital.
 * Never relies on a client-supplied hospital ID alone.
 * platform_reviewer bypasses ownership to perform administrative reviews.
 */
async function requireHospitalOwnership(req, res, next) {
  try {
    const hospitalId = req.params.id;
    if (!hospitalId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Hospital ID parameter is required.' });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ error: 'Not Found', message: `Hospital with ID ${hospitalId} not found.` });
    }

    req.targetHospital = hospital;

    if (req.user.role === 'platform_reviewer') {
      return next();
    }

    if (req.user.role === 'hospital_admin') {
      const isOwner = req.user.hospitalId && req.user.hospitalId.toString() === hospital._id.toString();
      if (!isOwner) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Security Policy Violation: You do not possess administrative authority over this hospital.',
        });
      }
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Unauthorized role for hospital modification.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

/**
 * Limits hospital context reads to the assigned hospital for doctors and admins.
 * Reviewers may inspect any hospital; this middleware is for read-only context routes.
 */
async function requireHospitalContext(req, res, next) {
  try {
    const hospitalId = req.params.id;
    if (!hospitalId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Hospital ID parameter is required.' });
    }
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ error: 'Not Found', message: `Hospital with ID ${hospitalId} not found.` });
    }
    if (req.user.role === 'platform_reviewer') {
      req.targetHospital = hospital;
      return next();
    }
    if (['hospital_admin', 'doctor'].includes(req.user.role) &&
        req.user.hospitalId?.toString() === hospital._id.toString()) {
      req.targetHospital = hospital;
      return next();
    }
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access is limited to the hospital assigned to your account.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

function requireHospitalAssignment(req, res, next) {
  if (req.user?.role !== 'doctor' || !req.user.hospitalId) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'A doctor account assigned to a hospital is required for this workflow.',
    });
  }
  Hospital.exists({ _id: req.user.hospitalId })
    .then(hospital => {
      if (!hospital) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'The doctor account is not assigned to an existing hospital.',
        });
      }
      next();
    })
    .catch(err => res.status(500).json({ error: 'Server Error', message: err.message }));
}

module.exports = {
  authenticate,
  authorizeRoles,
  requireHospitalOwnership,
  requireHospitalContext,
  requireHospitalAssignment,
};
