const express = require('express');
const router = express.Router({ mergeParams: true });
const Practitioner = require('../models/Practitioner');
const Hospital = require('../models/Hospital');
const { authenticate, authorizeRoles, requireHospitalOwnership } = require('../middleware/auth');
const { syncHospitalSpecialists } = require('../services/practitionerService');
const { recordAuditLog } = require('../services/auditService');

/**
 * GET /api/hospitals/:id/practitioners
 * List all practitioners associated with a hospital.
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const hospitalId = req.params.id;
    const practitioners = await Practitioner.find({ hospitalId })
      .sort({ specialty: 1, fullName: 1 });

    return res.json({
      hospitalId,
      totalPractitioners: practitioners.length,
      practitioners,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/hospitals/:id/practitioners
 * Hospital admin registers a new practitioner to their hospital.
 * SECURITY RULE: New practitioners ALWAYS start with verificationStatus = 'pending_verification'.
 * Hospital admins CANNOT self-verify practitioners.
 */
router.post(
  '/',
  authenticate,
  authorizeRoles('hospital_admin', 'platform_reviewer'),
  requireHospitalOwnership,
  async (req, res) => {
    try {
      const hospitalId = req.params.id;
      const {
        fullName,
        qualification,
        specialty,
        registrationNumber,
        employmentStatus = 'active',
        availability = 'on_call_24x7',
      } = req.body;

      if (!fullName || !qualification || !specialty || !registrationNumber) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'fullName, qualification, specialty, and registrationNumber are required.',
        });
      }

      const existingReg = await Practitioner.findOne({ registrationNumber: registrationNumber.trim() });
      if (existingReg) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'A practitioner with this state registration number already exists.',
        });
      }

      const practitionerId = `PRAC-2026-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 899 + 100)}`;

      // Verification status starts pending_verification (unless added directly by platform_reviewer)
      const verificationStatus = req.user.role === 'platform_reviewer' ? 'verified' : 'pending_verification';

      const practitioner = new Practitioner({
        practitionerId,
        hospitalId,
        fullName: fullName.trim(),
        qualification: qualification.trim(),
        specialty: specialty.trim(),
        registrationNumber: registrationNumber.trim(),
        employmentStatus,
        availability,
        verificationStatus,
        verifiedBy: req.user.role === 'platform_reviewer' ? req.user._id : null,
        verifiedAt: req.user.role === 'platform_reviewer' ? new Date() : null,
        isSynthetic: true,
      });

      await practitioner.save();

      // Synchronize derived specialist availability and trigger tier re-evaluation
      const syncResult = await syncHospitalSpecialists(hospitalId, req.user);

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'UPDATE_CAPACITY',
        resourceType: 'Hospital',
        resourceId: hospitalId,
        hospitalId,
        accessGranted: true,
        justification: `Added practitioner ${practitioner.fullName} (${specialty}). Status: ${verificationStatus}`,
        meta: {
          practitionerId,
          specialty,
          verificationStatus,
          newTier: syncResult.newTier,
        },
      });

      return res.status(201).json({
        message: 'Practitioner registered successfully.',
        practitioner,
        derivedSpecialists: syncResult.derivedSpecialists,
        currentHospitalTier: syncResult.newTier,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * PATCH /api/hospitals/:id/practitioners/:practitionerId/status
 * Update practitioner employment status, availability, or verification.
 * 
 * STRICT RULE: Only platform_reviewer can set verificationStatus to 'verified'.
 * Hospital admins attempting to verify return 403 Forbidden.
 * Status updates trigger hospital specialist re-derivation and tier re-evaluation.
 */
router.patch(
  '/:practitionerId/status',
  authenticate,
  authorizeRoles('hospital_admin', 'platform_reviewer'),
  requireHospitalOwnership,
  async (req, res) => {
    try {
      const { id: hospitalId, practitionerId } = req.params;
      const { verificationStatus, employmentStatus, availability } = req.body;

      const practitioner = await Practitioner.findOne({
        practitionerId,
        hospitalId,
      });

      if (!practitioner) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Practitioner ${practitionerId} not found in hospital ${hospitalId}.`,
        });
      }

      // Security check: Only platform_reviewer can verify
      if (verificationStatus) {
        if (req.user.role !== 'platform_reviewer') {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Access Denied: Only platform reviewers possess administrative authority to verify practitioner credentials.',
          });
        }
        practitioner.verificationStatus = verificationStatus;
        if (verificationStatus === 'verified') {
          practitioner.verifiedBy = req.user._id;
          practitioner.verifiedAt = new Date();
        }
      }

      if (employmentStatus) {
        practitioner.employmentStatus = employmentStatus;
      }

      if (availability) {
        practitioner.availability = availability;
      }

      practitioner.lastConfirmedAt = new Date();
      await practitioner.save();

      // Trigger tier re-evaluation in a consistent order:
      // 1. Re-derive hospital specialist counts from active verified practitioners
      // 2. Classify tier
      // 3. Update hospital document and record audit log
      const syncResult = await syncHospitalSpecialists(hospitalId, req.user);

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'UPDATE_CAPACITY',
        resourceType: 'Hospital',
        resourceId: hospitalId,
        hospitalId,
        accessGranted: true,
        justification: `Updated practitioner ${practitioner.fullName} status (emp: ${practitioner.employmentStatus}, ver: ${practitioner.verificationStatus})`,
        meta: {
          practitionerId,
          specialty: practitioner.specialty,
          employmentStatus: practitioner.employmentStatus,
          verificationStatus: practitioner.verificationStatus,
          tierChanged: syncResult.tierChanged,
          newTier: syncResult.newTier,
        },
      });

      return res.json({
        message: 'Practitioner status updated successfully.',
        practitioner,
        derivedSpecialists: syncResult.derivedSpecialists,
        currentHospitalTier: syncResult.newTier,
        tierChanged: syncResult.tierChanged,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

module.exports = router;
