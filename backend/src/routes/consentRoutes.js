const express = require('express');
const router = express.Router();
const Consent = require('../models/Consent');
const User = require('../models/User');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimiter');
const {
  requestConsent,
  grantConsent,
  denyConsent,
  revokeConsent,
  getPatientAccessHistory,
} = require('../services/consentService');

const consentLimiter = createRateLimiter({ max: 30, windowMs: 60000 });

/**
 * POST /api/consents/request
 * Initiated by a doctor at a requesting hospital.
 */
router.post(
  '/request',
  authenticate,
  authorizeRoles('doctor'),
  consentLimiter,
  async (req, res) => {
    try {
      const {
        patientId,
        purpose = 'referral',
        recordTypes = [],
        fromDate = null,
        toDate = null,
        durationDays,
        includeSensitiveRecords = false,
        referralId = null,
      } = req.body;

      if (!patientId) {
        return res.status(400).json({ error: 'Bad Request', message: 'patientId is required.' });
      }

      if (!req.user.hospitalId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Doctor account is not associated with an authorized hospital facility.',
        });
      }

      if (!Array.isArray(recordTypes) || recordTypes.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'At least one recordType must be explicitly requested.',
        });
      }

      // Check if patient exists
      const patient = await User.findById(patientId);
      if (!patient || patient.role !== 'patient') {
        return res.status(404).json({ error: 'Not Found', message: 'Target patient not found.' });
      }

      const consent = await requestConsent({
        patientId,
        requestingDoctorId: req.user._id,
        requestingHospitalId: req.user.hospitalId,
        purpose,
        recordTypes,
        fromDate,
        toDate,
        durationDays,
        includeSensitiveRecords,
        referralId,
        actorRole: req.user.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(201).json({
        message: 'Consent request created successfully.',
        consent,
      });
    } catch (err) {
      console.error('[CONSENT REQUEST ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/consents/access-history
 * Transparent audit log for patient viewing who accessed what records.
 */
router.get(
  '/access-history',
  authenticate,
  authorizeRoles('patient'),
  async (req, res) => {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
      const history = await getPatientAccessHistory(req.user._id, { page, limit });
      return res.json({
        patientId: req.user._id,
        totalEvents: history.total,
        page: history.page,
        limit: history.limit,
        totalPages: history.totalPages,
        accessReport: history.logs,
      });
    } catch (err) {
      console.error('[CONSENT ACCESS HISTORY ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/consents
 * Returns consents scoped by role:
 * - Patient: sees only their own consents
 * - Doctor: sees consents they created or for their hospital
 */
router.get(
  '/',
  authenticate,
  authorizeRoles('patient', 'doctor'),
  async (req, res) => {
    try {
      let query = {};
      if (req.user.role === 'patient') {
        query = { patientId: req.user._id };
      } else if (req.user.role === 'doctor') {
        query = {
          $or: [
            { requestingDoctorId: req.user._id },
            { requestingHospitalId: req.user.hospitalId },
          ],
        };
      }

      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
      const [consents, total] = await Promise.all([Consent.find(query)
        .populate('patientId', 'name email phone district')
        .populate('requestingHospitalId', 'name district code tier')
        .populate('requestingDoctorId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Consent.countDocuments(query)]);

      return res.json({
        count: consents.length,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        consents,
      });
    } catch (err) {
      console.error('[GET CONSENTS ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/consents/:id
 */
router.get(
  '/:id',
  authenticate,
  authorizeRoles('patient', 'doctor'),
  async (req, res) => {
    try {
      const consent = await Consent.findOne({
        $or: [{ consentId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
      })
        .populate('patientId', 'name email phone district')
        .populate('requestingHospitalId', 'name district code tier')
        .populate('requestingDoctorId', 'name email');

      const GENERIC_CONSENT_404 = { error: 'Not Found', message: 'Consent record not found or access denied.' };

      if (!consent) {
        return res.status(404).json(GENERIC_CONSENT_404);
      }

      // Authorization check (IDOR protection: return identical 404)
      if (req.user.role === 'patient' && consent.patientId._id.toString() !== req.user._id.toString()) {
        return res.status(404).json(GENERIC_CONSENT_404);
      }

      if (req.user.role === 'doctor' && consent.requestingHospitalId && consent.requestingHospitalId._id.toString() !== (req.user.hospitalId ? req.user.hospitalId.toString() : '')) {
        return res.status(404).json(GENERIC_CONSENT_404);
      }

      return res.json(consent);
    } catch (err) {
      console.error('[GET CONSENT BY ID ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/consents/:id/grant
 * Patient explicitly grants consent. Patient may narrow record types or shorten duration.
 */
router.post(
  '/:id/grant',
  authenticate,
  authorizeRoles('patient'),
  async (req, res) => {
    try {
      const consentId = req.params.id;
      const {
        narrowedRecordTypes,
        shortenedExpiryDays,
        includeSensitiveRecords,
      } = req.body;

      const consent = await grantConsent({
        consentId,
        patientId: req.user._id,
        narrowedRecordTypes,
        shortenedExpiryDays,
        includeSensitiveRecords,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        message: 'Consent successfully granted by patient.',
        consent,
      });
    } catch (err) {
      console.error('[GRANT CONSENT ERROR]:', err);
      return res.status(400).json({ error: 'Bad Request', message: err.message });
    }
  }
);

/**
 * POST /api/consents/:id/deny
 * Patient denies consent.
 */
router.post(
  '/:id/deny',
  authenticate,
  authorizeRoles('patient'),
  async (req, res) => {
    try {
      const consentId = req.params.id;
      const { reason } = req.body;

      const consent = await denyConsent({
        consentId,
        patientId: req.user._id,
        reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        message: 'Consent request denied by patient.',
        consent,
      });
    } catch (err) {
      console.error('[DENY CONSENT ERROR]:', err);
      return res.status(400).json({ error: 'Bad Request', message: err.message });
    }
  }
);

/**
 * POST /api/consents/:id/revoke
 * Patient revokes previously granted consent. Immediate effect!
 */
router.post(
  '/:id/revoke',
  authenticate,
  authorizeRoles('patient'),
  async (req, res) => {
    try {
      const consentId = req.params.id;
      const { reason } = req.body;

      const consent = await revokeConsent({
        consentId,
        patientId: req.user._id,
        reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        message: 'Consent revoked immediately by patient.',
        consent,
      });
    } catch (err) {
      console.error('[REVOKE CONSENT ERROR]:', err);
      return res.status(400).json({ error: 'Bad Request', message: err.message });
    }
  }
);

module.exports = router;
