const express = require('express');
const router = express.Router();
const ModelRegistry = require('../models/ModelRegistry');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditService');

const MODEL_NAMES = ['triage', 'ckd', 'diabetes', 'heart', 'liver', 'thyroid'];

async function findModelByIdentifier(id) {
  const model = await ModelRegistry.findOne({ modelId: id.toUpperCase() });
  if (model || !/^[0-9a-fA-F]{24}$/.test(id)) return model;
  return ModelRegistry.findById(id);
}

function presentModel(model, includeMetrics) {
  const value = model.toObject ? model.toObject() : model;
  const response = {
    modelId: value.modelId,
    name: value.name,
    version: value.version,
    status: value.status,
    datasetName: value.datasetName,
    datasetSource: value.datasetSource,
    limitations: value.limitations,
  };
  if (includeMetrics) {
    Object.assign(response, {
      datasetRowCount: value.datasetRowCount,
      trainingDate: value.trainingDate,
      metrics: value.metrics,
      threshold: value.threshold,
      thresholdPolicy: value.thresholdPolicy,
      featureList: value.featureList,
      calibrationMethod: value.calibrationMethod,
      artifactPath: value.artifactPath,
      artifactSha256: value.artifactSha256,
      modelCardRef: value.modelCardRef,
      createdBy: value.createdBy,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  }
  return response;
}

function canViewMetrics(user) {
  return user.role === 'platform_reviewer';
}

router.get('/', authenticate, authorizeRoles('doctor', 'hospital_admin', 'platform_reviewer'), async (req, res) => {
  try {
    const { name, status } = req.query;
    if (name && !MODEL_NAMES.includes(name)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid model name filter.' });
    }
    if (status && !['candidate', 'active', 'retired'].includes(status)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid model status filter.' });
    }

    const filter = {};
    if (name) filter.name = name;
    if (status) filter.status = status;
    const models = await ModelRegistry.find(filter).sort({ name: 1, version: -1 }).lean();
    return res.json({
      totalModels: models.length,
      models: models.map(model => presentModel(model, canViewMetrics(req.user))),
      notice: 'CareBridge clinical decision support models are research prototypes. Clinician review required.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

router.get('/:id', authenticate, authorizeRoles('doctor', 'hospital_admin', 'platform_reviewer'), async (req, res) => {
  try {
    const model = await findModelByIdentifier(req.params.id);
    if (!model) {
      return res.status(404).json({ error: 'Not Found', message: 'Model not found in registry.' });
    }
    return res.json({
      model: presentModel(model, canViewMetrics(req.user)),
      notice: 'Research prototype. Clinician review required before acting on model outputs.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

router.patch(
  '/:id/status',
  authenticate,
  authorizeRoles('platform_reviewer', 'hospital_admin'),
  async (req, res) => {
    try {
      const { status: newStatus, justification } = req.body || {};
      if (!['active', 'retired'].includes(newStatus)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: "Status must be 'active' (promote) or 'retired'.",
        });
      }
      if (typeof justification !== 'string' || !justification.trim() || justification.trim().length > 500) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'A reason of 1–500 characters is required for model promotion or retirement.',
        });
      }

      const model = await findModelByIdentifier(req.params.id);
      if (!model) {
        return res.status(404).json({ error: 'Not Found', message: 'Model not found in registry.' });
      }
      if (model.status === newStatus) {
        return res.json({ message: `Model ${model.modelId} is already ${newStatus}.`, model });
      }

      let retiredModel = null;
      if (newStatus === 'active') {
        retiredModel = await ModelRegistry.findOneAndUpdate(
          { name: model.name, status: 'active', _id: { $ne: model._id } },
          { $set: { status: 'retired' } },
          { new: true }
        );
      }

      const updatedModel = await ModelRegistry.findOneAndUpdate(
        { _id: model._id, status: model.status },
        { $set: { status: newStatus } },
        { new: true, runValidators: true }
      );
      if (!updatedModel) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Model status changed concurrently. Reload the model and retry.',
        });
      }

      const audit = await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'UPDATE_MODEL_STATUS',
        resourceType: 'ModelRegistry',
        resourceId: updatedModel._id,
        accessGranted: true,
        justification: justification.trim(),
        meta: {
          modelId: model.modelId,
          modelName: model.name,
          version: model.version,
          oldStatus: model.status,
          newStatus,
          retiredModelId: retiredModel?.modelId || null,
          artifactSha256: model.artifactSha256,
        },
        strict: true,
      });
      if (!audit) {
        return res.status(500).json({ error: 'Audit Failure', message: 'Model status changed but audit logging failed.' });
      }

      return res.json({
        message: `Model ${updatedModel.modelId} status successfully updated to ${newStatus}.`,
        model: presentModel(updatedModel, true),
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Another version of this model is active. Reload the registry and retry.',
        });
      }
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

module.exports = router;
