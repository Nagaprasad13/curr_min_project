const express = require('express');
const router = express.Router();
const PatientRecord = require('../models/PatientRecord');
const User = require('../models/User');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimiter');
const {
  verifyActiveConsent,
  getConsentedPatientRecords,
  computeRecordAgeInfo,
  executeBreakGlassAccess,
} = require('../services/consentService');
const { readRecordContent } = require('../services/recordStorageService');
const { recordAuditLog } = require('../services/auditService');

const recordLimiter = createRateLimiter({ max: 60, windowMs: 60000 });

// Constant generic error response for IDOR protection
const GENERIC_NOT_FOUND_RESPONSE = {
  error: 'Not Found',
  message: 'Record not found or access denied.',
};

/**
 * GET /api/patients/:patientId/records
 * - Doctor: returns records matching active, unexpired, granted consent
 * - Patient: returns their own records
 * Server-side consent check executed on EVERY fetch. Never cached.
 */
router.get(
  '/patients/:patientId/records',
  authenticate,
  authorizeRoles('doctor', 'patient'),
  recordLimiter,
  async (req, res) => {
    try {
      const { patientId } = req.params;

      // Verify patient exists
      const patient = await User.findById(patientId);
      if (!patient || patient.role !== 'patient') {
        return res.status(404).json(GENERIC_NOT_FOUND_RESPONSE);
      }

      // If patient is viewing: can ONLY view their own records
      if (req.user.role === 'patient') {
        if (req.user._id.toString() !== patientId) {
          // IDOR protection: return identical generic response
          await recordAuditLog({
            actorId: req.user._id,
            actorRole: req.user.role,
            action: 'DENIED_RECORD_ACCESS',
            resourceType: 'PatientRecord',
            resourceId: `PAT-${patientId}`,
            patientId,
            accessGranted: false,
            justification: 'Patient attempted to access another patient records',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          });
          return res.status(404).json(GENERIC_NOT_FOUND_RESPONSE);
        }

        const rawRecords = await PatientRecord.find({ patientId })
          .populate('sourceHospitalId', 'name district code tier')
          .sort({ recordDate: -1 });

        const formatted = rawRecords.map(r => {
          const ageInfo = computeRecordAgeInfo(r.recordDate);
          return {
            recordId: r.recordId,
            patientId: r.patientId,
            sourceHospital: {
              id: r.sourceHospitalId ? r.sourceHospitalId._id : null,
              name: r.sourceHospitalId ? r.sourceHospitalId.name : r.provenance.facilityName,
              district: r.sourceHospitalId ? r.sourceHospitalId.district : r.provenance.facilityDistrict,
              code: r.sourceHospitalId ? r.sourceHospitalId.code : 'UNKNOWN',
            },
            type: r.type,
            title: r.title,
            recordDate: r.recordDate,
            createdAt: r.createdAt,
            ageMonths: ageInfo.ageMonths,
            ageDays: ageInfo.ageDays,
            ageWarning: ageInfo.ageWarning,
            isOldRecord: ageInfo.isOldRecord,
            sensitivityLevel: r.sensitivityLevel,
            provenance: {
              submittedBy: r.provenance.submittedBy,
              sourceSystem: r.provenance.sourceSystem,
              facilityName: r.provenance.facilityName,
              practitionerName: r.provenance.practitionerName,
              clinicalNotice: 'Authenticated by source hospital telemetry; verification unconfirmed by third parties.',
            },
            contentRef: r.contentRef,
          };
        });

        return res.json({
          patientId,
          totalRecords: formatted.length,
          records: formatted,
          viewerRole: 'patient',
        });
      }

      // If doctor is viewing: run server-side consent verification
      const result = await getConsentedPatientRecords({
        patientId,
        doctorUser: req.user,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      if (!result.accessGranted) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'No active, unexpired, granted consent found for your hospital.',
          records: [],
          accessGranted: false,
        });
      }

      return res.json({
        patientId,
        totalRecords: result.records.length,
        records: result.records,
        consent: result.consent,
        accessGranted: true,
        clinicalNotice: 'Decision support only. A clinician must review.',
      });
    } catch (err) {
      console.error('[GET PATIENT RECORDS ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/records/:recordId
 * Retrieves a single record metadata with consent and IDOR protection.
 * Unauthorised and non-existent records return the EXACT SAME generic 404 response.
 */
router.get(
  '/records/:recordId',
  authenticate,
  authorizeRoles('doctor', 'patient'),
  recordLimiter,
  async (req, res) => {
    try {
      const { recordId } = req.params;
      const record = await PatientRecord.findOne({ recordId })
        .populate('sourceHospitalId', 'name district code tier');

      if (!record) {
        return res.status(404).json(GENERIC_NOT_FOUND_RESPONSE);
      }

      // Check permission
      let authorized = false;

      if (req.user.role === 'patient') {
        if (record.patientId.toString() === req.user._id.toString()) {
          authorized = true;
        }
      } else if (req.user.role === 'doctor') {
        const consent = await verifyActiveConsent({
          patientId: record.patientId,
          doctorUser: req.user,
        });

        if (consent && consent.allowsRecord(record)) {
          authorized = true;
        }
      }

      if (!authorized) {
        // IDOR Protection: identical generic response, no hints on record existence
        await recordAuditLog({
          actorId: req.user._id,
          actorRole: req.user.role,
          action: 'DENIED_RECORD_ACCESS',
          resourceType: 'PatientRecord',
          resourceId: recordId,
          patientId: record.patientId,
          hospitalId: req.user.hospitalId,
          accessGranted: false,
          justification: 'Unauthorized attempt to query clinical record',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
        return res.status(404).json(GENERIC_NOT_FOUND_RESPONSE);
      }

      const ageInfo = computeRecordAgeInfo(record.recordDate);

      // Audit log view event (NO contents in log)
      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'VIEW_PATIENT_RECORD',
        resourceType: 'PatientRecord',
        resourceId: recordId,
        patientId: record.patientId,
        hospitalId: req.user.hospitalId,
        accessGranted: true,
        justification: 'Authorized clinical record metadata retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        recordId: record.recordId,
        patientId: record.patientId,
        sourceHospital: {
          id: record.sourceHospitalId ? record.sourceHospitalId._id : null,
          name: record.sourceHospitalId ? record.sourceHospitalId.name : record.provenance.facilityName,
          district: record.sourceHospitalId ? record.sourceHospitalId.district : record.provenance.facilityDistrict,
          code: record.sourceHospitalId ? record.sourceHospitalId.code : 'UNKNOWN',
        },
        type: record.type,
        title: record.title,
        recordDate: record.recordDate,
        createdAt: record.createdAt,
        ageMonths: ageInfo.ageMonths,
        ageDays: ageInfo.ageDays,
        ageWarning: ageInfo.ageWarning,
        isOldRecord: ageInfo.isOldRecord,
        sensitivityLevel: record.sensitivityLevel,
        provenance: {
          submittedBy: record.provenance.submittedBy,
          sourceSystem: record.provenance.sourceSystem,
          facilityName: record.provenance.facilityName,
          practitionerName: record.provenance.practitionerName,
          clinicalNotice: 'Authenticated by source hospital telemetry; verification unconfirmed by third parties.',
        },
        contentRef: record.contentRef,
        clinicalNotice: 'Decision support only. A clinician must review.',
      });
    } catch (err) {
      console.error('[GET RECORD BY ID ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/records/:recordId/content
 * Retrieves the protected file payload from protected storage.
 * IDOR Protected: identical generic response for unauthorized or missing.
 */
router.get(
  '/records/:recordId/content',
  authenticate,
  authorizeRoles('doctor', 'patient'),
  recordLimiter,
  async (req, res) => {
    try {
      const { recordId } = req.params;
      const record = await PatientRecord.findOne({ recordId });

      if (!record) {
        return res.status(404).json(GENERIC_NOT_FOUND_RESPONSE);
      }

      let authorized = false;

      if (req.user.role === 'patient') {
        if (record.patientId.toString() === req.user._id.toString()) {
          authorized = true;
        }
      } else if (req.user.role === 'doctor') {
        const consent = await verifyActiveConsent({
          patientId: record.patientId,
          doctorUser: req.user,
        });
        if (consent && consent.allowsRecord(record)) {
          authorized = true;
        }
      }

      if (!authorized) {
        return res.status(404).json(GENERIC_NOT_FOUND_RESPONSE);
      }

      const content = readRecordContent(record.contentRef);
      if (!content) {
        return res.status(404).json(GENERIC_NOT_FOUND_RESPONSE);
      }

      return res.json({
        recordId: record.recordId,
        contentRef: record.contentRef,
        contentMimeType: record.contentMimeType,
        payload: content,
        clinicalNotice: 'Decision support only. A clinician must review.',
      });
    } catch (err) {
      console.error('[GET RECORD CONTENT ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/records/break-glass
 * Emergency break-glass access (Default OFF).
 */
router.post(
  '/records/break-glass',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const { patientId, reason } = req.body;

      if (!patientId || !reason || reason.trim().length < 10) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Both patientId and a detailed clinical emergency justification reason are required.',
        });
      }

      const emergencyConsent = await executeBreakGlassAccess({
        patientId,
        doctorUser: req.user,
        reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        message: 'Emergency break-glass access established. Audit logs and review alerts dispatched.',
        emergencyConsent,
        warning: 'This action is permanently audit-logged, subject to retrospective clinical review, and flagged for patient notification.',
      });
    } catch (err) {
      if (err.message.includes('disabled')) {
        return res.status(403).json({ error: 'Forbidden', message: err.message });
      }
      return res.status(400).json({ error: 'Bad Request', message: err.message });
    }
  }
);

module.exports = router;
