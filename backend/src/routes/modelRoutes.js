const express = require('express');
const router = express.Router();
const ModelRegistry = require('../models/ModelRegistry');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditService');

/**
 * Model Registry Routes (Phase 8.3)
 * Provides governance, cataloging, and lifecycle management for machine learning models.
 * ALL CLINICAL MODELS ARE RESEARCH PROTOTYPES ONLY.
 */

/**
 * GET /api/models
 * Returns all registered ML models with versions, operating thresholds,
 * metrics (ROC-AUC, F1, sensitivity, specificity, Brier score), and SHA-256 hashes.
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, modelType, condition } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (modelType) filter.modelType = modelType;
    if (condition) filter.condition = condition;

    const models = await ModelRegistry.find(filter).sort({ condition: 1, version: -1 });

    return res.json({
      totalModels: models.length,
      models,
      notice: 'CareBridge Clinical Decision Support Models. Research prototype only. Not certified for autonomous clinical diagnosis.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * GET /api/models/:id
 * Retrieve a single model card by modelId or MongoDB ObjectId.
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    let model = await ModelRegistry.findOne({ modelId: id.toUpperCase() });
    if (!model && id.match(/^[0-9a-fA-F]{24}$/)) {
      model = await ModelRegistry.findById(id);
    }

    if (!model) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Model artifact ${id} not found in model registry.`,
      });
    }

    return res.json({
      model,
      notice: 'CareBridge Decision Support Model Card. Clinician review required before acting on model outputs.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * PATCH /api/models/:id/status
 * Promotes, stages, or retires an ML model.
 * STRICT AUTHORIZATION: Only platform_reviewer can promote or retire models.
 * Records immutable audit log.
 */
router.patch(
  '/:id/status',
  authenticate,
  authorizeRoles('platform_reviewer'),
  async (req, res) => {
    try {
      const id = req.params.id;
      const { status: newStatus, justification = 'Routine model governance lifecycle action' } = req.body;

      if (!newStatus || !['candidate', 'active', 'retired'].includes(newStatus)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: "Valid status ('candidate', 'active', 'retired') is required.",
        });
      }

      let model = await ModelRegistry.findOne({ modelId: id.toUpperCase() });
      if (!model && id.match(/^[0-9a-fA-F]{24}$/)) {
        model = await ModelRegistry.findById(id);
      }

      if (!model) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Model artifact ${id} not found in model registry.`,
        });
      }

      const oldStatus = model.status;
      model.status = newStatus;
      model.promotedBy = req.user._id;
      model.promotedAt = new Date();
      await model.save();

      // Record immutable audit log
      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'UPDATE_CAPACITY',
        resourceType: 'Hospital',
        resourceId: model._id,
        accessGranted: true,
        justification: `Model ${model.modelId} status transitioned from ${oldStatus} to ${newStatus}. ${justification}`,
        meta: {
          modelId: model.modelId,
          condition: model.condition,
          version: model.version,
          oldStatus,
          newStatus,
          artifactSha256: model.artifactSha256,
        },
      });

      return res.json({
        message: `Model ${model.modelId} status successfully updated to ${newStatus}.`,
        model,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

module.exports = router;
