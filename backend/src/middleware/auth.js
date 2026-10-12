const { verifyToken } = require('../config/jwt');
const User = require('../models/User');
const Hospital = require('../models/Hospital');

/**
 * Authenticate incoming request via JWT Bearer token.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token missing or invalid format. Please supply a valid Bearer token.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'The user account associated with this token no longer exists.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token verification failed or token expired.',
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

    // Attach hospital to request for downstream controller handlers
    req.targetHospital = hospital;

    // Platform reviewers have platform-wide audit & verification authority
    if (req.user.role === 'platform_reviewer') {
      return next();
    }

    // If hospital_admin, verify strict ownership
    if (req.user.role === 'hospital_admin') {
      const isOwnerByHospitalRef = req.user.hospitalId && req.user.hospitalId.toString() === hospital._id.toString();
      const isOwnerByAdminUser = hospital.adminUserId && hospital.adminUserId.toString() === req.user._id.toString();

      if (!isOwnerByHospitalRef && !isOwnerByAdminUser) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Security Policy Violation: You do not possess administrative authority over this hospital.',
        });
      }
      return next();
    }

    // For other roles, deny modification
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Unauthorized role for hospital modification.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
}

module.exports = {
  authenticate,
  authorizeRoles,
  requireHospitalOwnership,
};
