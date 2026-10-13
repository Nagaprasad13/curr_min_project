const express = require('express');
const router = express.Router();
const Scheme = require('../models/Scheme');
const User = require('../models/User');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const {
  evaluateSchemePotentialMatches,
  flagOutdatedSchemes,
  assertNoForbiddenPhrases,
  MANDATORY_NOTICE,
} = require('../services/schemeService');
const { recordAuditLog } = require('../services/auditService');

/**
 * GET /api/schemes
 * Accessible to any authenticated user.
 */
router.get(
  '/',
  authenticate,
  async (req, res) => {
    try {
      const schemes = await Scheme.find().sort({ schemeId: 1 });
      return res.json({
        count: schemes.length,
        schemes,
        clinicalNotice: 'Decision support only. A clinician must review.',
      });
    } catch (err) {
      console.error('[GET SCHEMES ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/schemes/:id
 * Accessible to any authenticated user.
 */
router.get(
  '/:id',
  authenticate,
  async (req, res) => {
    try {
      const scheme = await Scheme.findOne({
        $or: [
          { schemeId: req.params.id.toUpperCase() },
          { schemeCode: req.params.id.toUpperCase() },
          { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
        ],
      });

      if (!scheme) {
        return res.status(404).json({ error: 'Not Found', message: 'Scheme not found.' });
      }

      return res.json(scheme);
    } catch (err) {
      console.error('[GET SCHEME BY ID ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/schemes/match
 * Potential match calculation.
 * Patient or Doctor only.
 * Doctors can run for their own patients only, with a logged purpose.
 */
router.post(
  '/match',
  authenticate,
  authorizeRoles('patient', 'doctor'),
  async (req, res) => {
    try {
      const {
        patientId = null,
        inputs = {},
        clinicalPurpose = 'Evaluation of health assurance scheme potential suitability',
      } = req.body;

      let targetPatientId = patientId;

      if (req.user.role === 'patient') {
        targetPatientId = req.user._id.toString();
      } else if (req.user.role === 'doctor') {
        if (!targetPatientId) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'patientId is required when a doctor initiates a scheme match.',
          });
        }
        // Verify patient exists
        const patient = await User.findById(targetPatientId);
        if (!patient || patient.role !== 'patient') {
          return res.status(404).json({ error: 'Not Found', message: 'Target patient not found.' });
        }
      }

      const results = await evaluateSchemePotentialMatches({
        inputs,
        actor: req.user,
        targetPatientId,
        clinicalPurpose,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Defensive check: Assert zero forbidden phrases in output payload
      assertNoForbiddenPhrases(results);

      return res.json({
        totalEvaluated: results.length,
        potentialMatches: results,
        notice: MANDATORY_NOTICE,
        clinicalNotice: 'Decision support only. A clinician must review.',
      });
    } catch (err) {
      console.error('[SCHEME MATCH ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/schemes
 * Admin or Platform Reviewer only: create scheme entry.
 * Newly created scheme begins with status 'draft'.
 */
router.post(
  '/',
  authenticate,
  authorizeRoles('hospital_admin', 'platform_reviewer'),
  async (req, res) => {
    try {
      const {
        schemeId,
        name,
        authority,
        shortDescription,
        eligibilityCriteria,
        requiredDocuments,
        coveredTreatmentNotes,
        participatingHospitalInfo,
        officialApplicationUrl,
        helplineInfo,
        sourceUrls,
        lastVerifiedDate,
      } = req.body;

      if (!schemeId || !name || !authority || !shortDescription || !officialApplicationUrl) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'schemeId, name, authority, shortDescription, and officialApplicationUrl are required.',
        });
      }

      const scheme = new Scheme({
        schemeId: schemeId.toUpperCase(),
        schemeCode: schemeId.toUpperCase(),
        name,
        authority,
        shortDescription,
        eligibilityCriteria: eligibilityCriteria || [],
        requiredDocuments: requiredDocuments || [],
        coveredTreatmentNotes: coveredTreatmentNotes || 'See official package master.',
        participatingHospitalInfo: participatingHospitalInfo || 'hospital-reported, verify with scheme',
        officialApplicationUrl,
        officialUrl: officialApplicationUrl,
        helplineInfo,
        sourceUrls: sourceUrls || [officialApplicationUrl],
        lastVerifiedDate: lastVerifiedDate ? new Date(lastVerifiedDate) : new Date(),
        status: 'draft', // Always draft until verified by reviewer
        rulesVersion: '1.0',
      });

      const saved = await scheme.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'CREATE_SCHEME',
        resourceType: 'Scheme',
        resourceId: saved.schemeId,
        accessGranted: true,
        justification: `Scheme ${saved.schemeId} draft created`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(201).json(saved);
    } catch (err) {
      console.error('[CREATE SCHEME ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * PUT /api/schemes/:id
 * Admin or Platform Reviewer: update scheme entry.
 */
router.put(
  '/:id',
  authenticate,
  authorizeRoles('hospital_admin', 'platform_reviewer'),
  async (req, res) => {
    try {
      const scheme = await Scheme.findOne({
        $or: [
          { schemeId: req.params.id.toUpperCase() },
          { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
        ],
      });

      if (!scheme) {
        return res.status(404).json({ error: 'Not Found', message: 'Scheme not found.' });
      }

      const allowedFields = [
        'name',
        'authority',
        'shortDescription',
        'eligibilityCriteria',
        'requiredDocuments',
        'coveredTreatmentNotes',
        'participatingHospitalInfo',
        'officialApplicationUrl',
        'helplineInfo',
        'sourceUrls',
        'rulesVersion',
      ];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          scheme[field] = req.body[field];
        }
      }

      // If non-reviewer updates, set status back to draft
      if (req.user.role !== 'platform_reviewer') {
        scheme.status = 'draft';
      }

      const updated = await scheme.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'UPDATE_SCHEME',
        resourceType: 'Scheme',
        resourceId: updated.schemeId,
        accessGranted: true,
        justification: `Scheme ${updated.schemeId} updated`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json(updated);
    } catch (err) {
      console.error('[UPDATE SCHEME ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/schemes/:id/verify
 * Platform Reviewer ONLY: Verifies and approves scheme rules against official sources.
 */
router.post(
  '/:id/verify',
  authenticate,
  authorizeRoles('platform_reviewer'),
  async (req, res) => {
    try {
      const scheme = await Scheme.findOne({
        $or: [
          { schemeId: req.params.id.toUpperCase() },
          { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
        ],
      });

      if (!scheme) {
        return res.status(404).json({ error: 'Not Found', message: 'Scheme not found.' });
      }

      scheme.status = 'verified';
      scheme.lastVerifiedDate = new Date();
      scheme.verifiedBy = req.user._id;

      const verified = await scheme.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'VERIFY_SCHEME',
        resourceType: 'Scheme',
        resourceId: verified.schemeId,
        accessGranted: true,
        justification: `Scheme ${verified.schemeId} rules verified against official portal`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        message: `Scheme ${verified.schemeId} successfully marked verified by platform reviewer.`,
        scheme: verified,
      });
    } catch (err) {
      console.error('[VERIFY SCHEME ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/schemes/check-outdated
 * Scheduled check or administrative trigger to flag older schemes as outdated.
 */
router.post(
  '/check-outdated',
  authenticate,
  authorizeRoles('platform_reviewer', 'hospital_admin'),
  async (req, res) => {
    try {
      const maxAgeDays = req.body.maxAgeDays || undefined;
      const result = await flagOutdatedSchemes(maxAgeDays);

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'FLAG_OUTDATED_SCHEME',
        resourceType: 'Scheme',
        resourceId: 'ALL',
        accessGranted: true,
        justification: `Ran outdated verification sweep: ${result.modifiedCount} schemes flagged`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        message: 'Outdated check completed.',
        flaggedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error('[CHECK OUTDATED ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

module.exports = router;
