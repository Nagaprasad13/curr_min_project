const express = require('express');
const router = express.Router();
const ConditionSpecialtyMap = require('../models/ConditionSpecialtyMap');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditService');

/**
 * GET /api/specialty-map
 * Retrieves the full condition-specialty mapping sheet.
 * Accessible to: doctor, platform_reviewer, hospital_admin
 */
router.get(
  '/',
  authenticate,
  authorizeRoles('doctor', 'platform_reviewer', 'hospital_admin'),
  async (req, res) => {
    try {
      const mappings = await ConditionSpecialtyMap.find({}).sort({ condition_id: 1 }).lean();
      return res.json({
        total: mappings.length,
        decisionSupportNotice: 'Decision support only. A clinician must review.',
        mappings,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * PATCH /api/specialty-map/:id
 * Reviewer sign-off on condition specialty mapping.
 * Updates review status, notes, or modified escalation rules.
 * Restricted to: platform_reviewer only
 */
router.patch(
  '/:id',
  authenticate,
  authorizeRoles('platform_reviewer'),
  async (req, res) => {
    try {
      const { status, escalation_rules, notes, min_hospital_tier } = req.body;
      const validStatuses = ['PENDING CLINICIAN REVIEW', 'REVIEWED_ACCEPTED', 'MODIFIED'];

      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const mapping = await ConditionSpecialtyMap.findById(req.params.id);
      if (!mapping) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Resource not found or access denied.',
        });
      }

      const prevStatus = mapping.status;
      if (status) mapping.status = status;
      if (escalation_rules) mapping.escalation_rules = escalation_rules;
      if (min_hospital_tier) mapping.min_hospital_tier = min_hospital_tier;

      mapping.reviewed_by = req.user._id;
      mapping.last_reviewed = new Date();

      await mapping.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'REVIEW_SPECIALTY_MAP',
        resourceType: 'ConditionSpecialtyMap',
        resourceId: mapping._id.toString(),
        hospitalId: req.user.hospitalId,
        accessGranted: true,
        justification: `Reviewer signed off condition ${mapping.condition_id} (${mapping.status}). Notes: ${notes || 'Standard protocol verification'}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: {
          condition_id: mapping.condition_id,
          fromStatus: prevStatus,
          toStatus: mapping.status,
        },
      });

      return res.json({
        message: `Condition specialty mapping ${mapping.condition_id} updated.`,
        mapping,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

module.exports = router;
