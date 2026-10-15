const express = require('express');
const router = express.Router();
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const Practitioner = require('../models/Practitioner');
const HospitalCapacity = require('../models/HospitalCapacity');
const { authenticate, authorizeRoles, requireHospitalOwnership } = require('../middleware/auth');
const { validateBody, hospitalValidationSchema, hospitalUpdateValidationSchema } = require('../middleware/validate');
const { classifyHospitalTier } = require('../services/tierClassificationService');
const { performVerificationConsistencyChecks } = require('../services/verificationService');
const { recordAuditLog } = require('../services/auditService');

/**
 * Helper to optionally authenticate if Authorization header is present.
 */
async function optionalAuthenticate(req, res, next) {
  if (req.headers.authorization) {
    return authenticate(req, res, next);
  }
  next();
}

/**
 * POST /api/hospitals
 * Register a new hospital.
 * Restricted to: hospital_admin
 */
router.post(
  '/',
  authenticate,
  authorizeRoles('hospital_admin'),
  validateBody(hospitalValidationSchema),
  async (req, res) => {
    try {
      const data = req.validatedBody;

      // Ensure unique registration number
      const existingReg = await Hospital.findOne({ registrationNumber: data.registrationNumber });
      if (existingReg) {
        return res.status(409).json({
          error: 'Conflict',
          message: `A hospital with registration number "${data.registrationNumber}" is already registered.`,
        });
      }

      // Generate code if not supplied
      const code = data.code || `HOSP-TN-${Date.now().toString().slice(-4)}`;

      // Run pure rule-based tier classification
      const tierClassification = classifyHospitalTier(data, false);

      const newHospital = new Hospital({
        ...data,
        code,
        adminUserId: req.user._id,
        verificationStatus: 'unverified', // Initially unverified until submitted
        tier: tierClassification.proposedTier,
        proposedTier: tierClassification.proposedTier,
        tierStatus: 'unconfirmed', // Only verified hospitals get confirmed effective tiers
        tierRationale: tierClassification.rulesMet,
        tierDetails: {
          rulesMet: tierClassification.rulesMet,
          rulesMissed: tierClassification.rulesMissed,
          gapToNextTier: tierClassification.gapToNextTier,
          computedAt: tierClassification.computedAt,
          rulesVersion: tierClassification.rulesVersion,
        },
        verificationHistory: [{
          action: 'REGISTERED',
          fromState: 'none',
          toState: 'unverified',
          actorId: req.user._id,
          actorRole: req.user.role,
          reason: 'Initial hospital establishment registration',
          timestamp: new Date(),
        }],
        isSynthetic: true,
      });

      const saved = await newHospital.save();

      // Associate hospital with the hospital_admin user
      await User.findByIdAndUpdate(req.user._id, { hospitalId: saved._id });

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'REGISTER_HOSPITAL',
        resourceType: 'Hospital',
        resourceId: saved._id.toString(),
        hospitalId: saved._id,
        accessGranted: true,
        justification: `Hospital "${saved.name}" registered with registration number "${saved.registrationNumber}"`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: { proposedTier: tierClassification.proposedTier },
      });

      return res.status(201).json({
        message: 'Hospital registered successfully. Current status is "unverified". Please submit for verification.',
        hospital: saved,
        tierEvaluation: tierClassification,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * PUT /api/hospitals/:id
 * Edit own hospital capabilities.
 * Restricted to: hospital_admin (enforcing ownership via requireHospitalOwnership)
 * RULE: Any edit to capability fields resets verificationStatus to "pending" and triggers tier re-evaluation.
 */
router.put(
  '/:id',
  authenticate,
  authorizeRoles('hospital_admin'),
  requireHospitalOwnership,
  validateBody(hospitalUpdateValidationSchema),
  async (req, res) => {
    try {
      const hospital = req.targetHospital;
      const updates = req.validatedBody;

      // Track whether capability-defining fields were changed
      const capabilityKeys = ['specialties', 'equipment', 'bedCounts', 'has24x7Emergency', 'specialists', 'departments'];
      const hasCapabilityChange = capabilityKeys.some(key => updates[key] !== undefined);

      const prevStatus = hospital.verificationStatus;
      const prevTier = hospital.proposedTier;

      // Apply updates to the hospital instance
      Object.assign(hospital, updates);

      let tierEvaluation = null;

      if (hasCapabilityChange) {
        // Re-run rule-based tier classification
        tierEvaluation = classifyHospitalTier(hospital.toObject(), false);

        hospital.proposedTier = tierEvaluation.proposedTier;
        hospital.tier = tierEvaluation.proposedTier;
        hospital.tierStatus = 'unconfirmed'; // Reset to unconfirmed pending audit
        hospital.tierRationale = tierEvaluation.rulesMet;
        hospital.tierDetails = {
          rulesMet: tierEvaluation.rulesMet,
          rulesMissed: tierEvaluation.rulesMissed,
          gapToNextTier: tierEvaluation.gapToNextTier,
          computedAt: tierEvaluation.computedAt,
          rulesVersion: tierEvaluation.rulesVersion,
        };

        // CORE WORKFLOW RULE: Capability edits reset verification status to 'pending'
        hospital.verificationStatus = 'pending';
        hospital.verifiedAt = null;
        hospital.verifiedBy = null;

        hospital.verificationHistory.push({
          action: 'CAPABILITY_EDIT_RESET',
          fromState: prevStatus,
          toState: 'pending',
          actorId: req.user._id,
          actorRole: req.user.role,
          reason: 'Capabilities modified by administrator; status reset to pending verification and tier re-evaluated',
          timestamp: new Date(),
        });
      }

      const saved = await hospital.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'EDIT_HOSPITAL',
        resourceType: 'Hospital',
        resourceId: saved._id.toString(),
        hospitalId: saved._id,
        accessGranted: true,
        justification: `Hospital capabilities edited. Status changed from ${prevStatus} to ${saved.verificationStatus}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: { hasCapabilityChange, prevTier, newTier: saved.proposedTier },
      });

      return res.json({
        message: hasCapabilityChange
          ? 'Hospital updated. Capability modifications have reset verification status to "pending" and triggered tier re-evaluation.'
          : 'Hospital details updated.',
        hospital: saved,
        tierEvaluation,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/hospitals
 * List hospitals with filters: district, tier, verificationStatus, specialty.
 * Access Control:
 * - Public / doctor / patient: Verified hospitals ONLY.
 * - hospital_admin: Verified hospitals + their own hospital.
 * - platform_reviewer: All hospitals across all states.
 */
router.get('/', optionalAuthenticate, async (req, res) => {
  try {
    const { district, tier, verificationStatus, specialty } = req.query;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));

    const query = {};

    if (district) {
      query.district = district;
    }
    if (tier) {
      query.tier = tier;
    }
    if (specialty) {
      query.specialties = specialty;
    }

    const currentUser = req.user;

    if (!currentUser || currentUser.role === 'patient' || currentUser.role === 'doctor') {
      // Public / doctor / patient can ONLY view verified hospitals
      query.verificationStatus = 'verified';
    } else if (currentUser.role === 'hospital_admin') {
      // Hospital admins are scoped to their assigned facility.
      query._id = currentUser.hospitalId || null;
      if (verificationStatus) {
        query.verificationStatus = verificationStatus;
      }
    } else if (currentUser.role === 'platform_reviewer') {
      // Reviewers can see any status
      if (verificationStatus) {
        query.verificationStatus = verificationStatus;
      }
    }

    const [hospitals, total] = await Promise.all([
      Hospital.find(query).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Hospital.countDocuments(query),
    ]);

    // Augment records with explicit disclosure
    const formatted = hospitals.map(h => ({
      ...h,
      tierStatusNotice: h.verificationStatus === 'verified'
        ? 'Confirmed capability tier (verified by audit)'
        : 'Unconfirmed proposed tier (pending verification)',
      decisionSupportDisclaimer: 'Decision support only. A clinician must review.',
    }));

    return res.json({
      count: formatted.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      userRole: currentUser ? currentUser.role : 'public',
      hospitals: formatted,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * GET /api/hospitals/reviewer-directory
 * Reviewer-only directory with synthetic admin, practitioner-status, and capacity metadata.
 */
router.get(
  '/reviewer-directory',
  authenticate,
  authorizeRoles('platform_reviewer'),
  async (req, res) => {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
      const [hospitals, total] = await Promise.all([
        Hospital.find({}).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
        Hospital.countDocuments({}),
      ]);
      const hospitalIds = hospitals.map(hospital => hospital._id);
      const [admins, practitionerGroups, capacityRows] = await Promise.all([
        User.find({ role: 'hospital_admin', hospitalId: { $in: hospitalIds } })
          .select('name email hospitalId')
          .lean(),
        Practitioner.aggregate([
          { $match: { hospitalId: { $in: hospitalIds } } },
          {
            $group: {
              _id: {
                hospitalId: '$hospitalId',
                verificationStatus: '$verificationStatus',
                employmentStatus: '$employmentStatus',
              },
              count: { $sum: 1 },
            },
          },
        ]),
        HospitalCapacity.aggregate([
          { $match: { hospitalId: { $in: hospitalIds } } },
          { $sort: { reportedAt: -1, timestamp: -1, createdAt: -1 } },
          {
            $group: {
              _id: '$hospitalId',
              reportedAt: {
                $first: { $ifNull: ['$reportedAt', { $ifNull: ['$timestamp', '$createdAt'] }] },
              },
            },
          },
        ]),
      ]);

      const adminsByHospital = new Map();
      for (const admin of admins) {
        const key = admin.hospitalId.toString();
        if (!adminsByHospital.has(key)) adminsByHospital.set(key, []);
        adminsByHospital.get(key).push({ name: admin.name, email: admin.email });
      }

      const countsByHospital = new Map();
      for (const group of practitionerGroups) {
        const key = group._id.hospitalId.toString();
        if (!countsByHospital.has(key)) countsByHospital.set(key, {});
        const counts = countsByHospital.get(key);
        counts[group._id.verificationStatus] ||= {};
        counts[group._id.verificationStatus][group._id.employmentStatus] = group.count;
      }

      const capacityByHospital = new Map(
        capacityRows.map(row => [row._id.toString(), row.reportedAt])
      );
      const now = Date.now();
      const directory = hospitals.map(hospital => {
        const key = hospital._id.toString();
        const reportedAt = capacityByHospital.get(key) || null;
        const ageMinutes = reportedAt ? Math.max(0, Math.floor((now - new Date(reportedAt).getTime()) / 60000)) : null;
        return {
          hospitalId: hospital._id,
          code: hospital.code,
          name: hospital.name,
          district: hospital.district,
          admins: adminsByHospital.get(key) || [],
          practitionerCounts: countsByHospital.get(key) || {},
          latestCapacity: reportedAt ? { reportedAt, ageMinutes } : null,
        };
      });
      return res.json({ count: directory.length, total, page, limit, totalPages: Math.ceil(total / limit), hospitals: directory });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/hospitals/:id
 * Retrieve a single hospital.
 * Access Control:
 * - If verified: Any authenticated user or doctor can view.
 * - If unverified/pending/rejected: Only owning hospital_admin or platform_reviewer can view.
 */
router.get('/:id', optionalAuthenticate, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Not Found', message: 'Hospital not found.' });
    }

    const hospital = await Hospital.findById(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: 'Not Found', message: 'Hospital not found.' });
    }

    const currentUser = req.user;
    const isOwner = currentUser?.hospitalId?.toString() === hospital._id.toString();
    const isReviewer = currentUser && currentUser.role === 'platform_reviewer';

    if (currentUser && ['hospital_admin', 'doctor'].includes(currentUser.role) && !isOwner) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access is limited to the hospital assigned to your account.',
      });
    }

    if (hospital.verificationStatus !== 'verified' && !isOwner && !isReviewer) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This hospital record is currently pending verification and is not publicly visible.',
      });
    }

    const consistencyChecks = (isOwner || isReviewer)
      ? performVerificationConsistencyChecks(hospital.toObject())
      : null;

    return res.json({
      hospital,
      consistencyChecks,
      disclaimer: 'Decision support only. A clinician must review.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/hospitals/:id/submit-for-verification
 * Submit a hospital for review.
 * Runs simulated format and consistency checks.
 * Restricted to: hospital_admin (enforcing ownership)
 */
router.post(
  '/:id/submit-for-verification',
  authenticate,
  authorizeRoles('hospital_admin'),
  requireHospitalOwnership,
  async (req, res) => {
    try {
      const hospital = req.targetHospital;

      // Run simulated consistency checks
      const checkResults = performVerificationConsistencyChecks(hospital.toObject());

      const prevStatus = hospital.verificationStatus;
      hospital.verificationStatus = 'pending';
      hospital.consistencyWarnings = checkResults.warnings;

      hospital.verificationHistory.push({
        action: 'SUBMIT_FOR_VERIFICATION',
        fromState: prevStatus,
        toState: 'pending',
        actorId: req.user._id,
        actorRole: req.user.role,
        reason: req.body.notes || 'Submitted for platform verification review',
        timestamp: new Date(),
      });

      await hospital.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'SUBMIT_FOR_VERIFICATION',
        resourceType: 'Hospital',
        resourceId: hospital._id.toString(),
        hospitalId: hospital._id,
        accessGranted: true,
        justification: `Hospital submitted for verification with ${checkResults.warnings.length} consistency warnings`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: { warningCodes: checkResults.warnings.map(w => w.code) },
      });

      return res.json({
        message: 'Hospital submitted for verification successfully. Current state is "pending".',
        status: hospital.verificationStatus,
        consistencyWarnings: checkResults.warnings,
        authenticityDisclaimer: checkResults.authenticityDisclaimer,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/hospitals/:id/verify
 * Approve and verify hospital.
 * Restricted to: platform_reviewer only
 */
router.post(
  '/:id/verify',
  authenticate,
  authorizeRoles('platform_reviewer'),
  async (req, res) => {
    try {
      const hospital = await Hospital.findById(req.params.id);
      if (!hospital) {
        return res.status(404).json({ error: 'Not Found', message: 'Hospital not found.' });
      }

      const prevStatus = hospital.verificationStatus;
      hospital.verificationStatus = 'verified';
      hospital.verifiedAt = new Date();
      hospital.verifiedBy = req.user.name;
      hospital.rejectionReason = null;

      // Re-evaluate tier with isVerified = true: tier becomes CONFIRMED!
      const tierEvaluation = classifyHospitalTier(hospital.toObject(), true);
      hospital.tier = tierEvaluation.proposedTier;
      hospital.proposedTier = tierEvaluation.proposedTier;
      hospital.tierStatus = 'confirmed'; // Effective confirmed tier
      hospital.tierRationale = tierEvaluation.rulesMet;
      hospital.tierDetails = {
        rulesMet: tierEvaluation.rulesMet,
        rulesMissed: tierEvaluation.rulesMissed,
        gapToNextTier: tierEvaluation.gapToNextTier,
        computedAt: tierEvaluation.computedAt,
        rulesVersion: tierEvaluation.rulesVersion,
      };

      hospital.verificationHistory.push({
        action: 'VERIFIED',
        fromState: prevStatus,
        toState: 'verified',
        actorId: req.user._id,
        actorRole: req.user.role,
        reason: req.body.reason || 'Verification audit criteria satisfied; capabilities verified.',
        timestamp: new Date(),
      });

      await hospital.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'VERIFY_HOSPITAL',
        resourceType: 'Hospital',
        resourceId: hospital._id.toString(),
        hospitalId: hospital._id,
        accessGranted: true,
        justification: `Hospital verified by platform reviewer ${req.user.name}. Tier confirmed as ${hospital.tier}.`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: { confirmedTier: hospital.tier },
      });

      return res.json({
        message: `Hospital verified successfully. Capability tier confirmed as ${hospital.tier}.`,
        hospital,
        tierEvaluation,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/hospitals/:id/reject
 * Reject verification of a hospital.
 * Restricted to: platform_reviewer only
 * RULE: Rejection requires an explicit reason.
 */
router.post(
  '/:id/reject',
  authenticate,
  authorizeRoles('platform_reviewer'),
  async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'A detailed rejection reason is strictly required to reject a hospital.',
        });
      }

      const hospital = await Hospital.findById(req.params.id);
      if (!hospital) {
        return res.status(404).json({ error: 'Not Found', message: 'Hospital not found.' });
      }

      const prevStatus = hospital.verificationStatus;
      hospital.verificationStatus = 'rejected';
      hospital.rejectionReason = reason.trim();
      hospital.tierStatus = 'unconfirmed';

      hospital.verificationHistory.push({
        action: 'REJECTED',
        fromState: prevStatus,
        toState: 'rejected',
        actorId: req.user._id,
        actorRole: req.user.role,
        reason: reason.trim(),
        timestamp: new Date(),
      });

      await hospital.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'REJECT_HOSPITAL',
        resourceType: 'Hospital',
        resourceId: hospital._id.toString(),
        hospitalId: hospital._id,
        accessGranted: true,
        justification: `Hospital rejected by ${req.user.name}. Reason: ${reason}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: { reason },
      });

      return res.json({
        message: 'Hospital verification rejected.',
        status: hospital.verificationStatus,
        rejectionReason: hospital.rejectionReason,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

module.exports = router;
