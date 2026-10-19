const express = require('express');
const router = express.Router();
const TriageRecord = require('../models/TriageRecord');
const TriageAlert = require('../models/TriageAlert');
const User = require('../models/User');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditService');
const { createRateLimiter } = require('../middleware/rateLimiter');

// Rate limit triage submission endpoints (30 req / min)
const triageRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Triage submission rate limit exceeded. Please wait a moment before submitting again.',
});

/**
 * Helper to compute age in minutes and recency warning
 */
function enrichTriageRecency(record) {
  const plain = record.toObject ? record.toObject() : { ...record };
  const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(plain.recordedAt).getTime()) / 60000));
  plain.ageMinutes = ageMinutes;
  
  // Format human-readable age
  if (ageMinutes < 1) {
    plain.ageDisplay = 'just now';
  } else if (ageMinutes < 60) {
    plain.ageDisplay = `${ageMinutes} min ago`;
  } else {
    const hours = Math.floor(ageMinutes / 60);
    const mins = ageMinutes % 60;
    plain.ageDisplay = `${hours}h ${mins}m ago`;
  }

  // Thresholds: emergency 30 min, urgent/routine 60 min
  const threshold = (plain.confirmedUrgency === 'emergency' || plain.modelSuggestedUrgency === 'emergency') ? 30 : 60;
  plain.reMeasureThresholdMinutes = threshold;
  plain.reMeasureNeeded = ageMinutes >= threshold;
  
  return plain;
}

/**
 * POST /api/triage/records
 * Create a draft or submitted triage record.
 * Allowed for triage_nurse and doctor (doctor direct entry flagged).
 */
router.post(
  '/records',
  authenticate,
  authorizeRoles('triage_nurse', 'doctor'),
  triageRateLimiter,
  async (req, res) => {
    try {
      const {
        patientId,
        chiefComplaint,
        symptomDuration,
        arrivalMode = 'walk-in',
        vitals,
        measurementMethod = 'manual',
        notes = '',
        status = 'submitted',
        supervisingDoctorId,
      } = req.body;

      if (!patientId || !chiefComplaint || !vitals) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'patientId, chiefComplaint, and vitals are required.',
        });
      }

      if (!chiefComplaint.text || !chiefComplaint.text.trim()) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Chief complaint text is required.',
        });
      }

      // Check physiological plausibility
      const validation = TriageRecord.validatePhysiologicalVitals(vitals);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid Physiological Vitals',
          message: validation.error,
        });
      }

      // Hospital scoping
      const hospitalId = req.user.hospitalId;
      if (!hospitalId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'User is not assigned to a hospital.',
        });
      }

      // Verify patient exists
      const patient = await User.findById(patientId);
      if (!patient) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Patient not found.',
        });
      }

      const isDoctor = req.user.role === 'doctor';
      if (isDoctor && process.env.ALLOW_DOCTOR_DIRECT_VITALS === 'false') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Direct vitals entry by doctors is currently disabled by hospital configuration.',
        });
      }

      // Compute scores and red flags if submitted
      let computedScores = { news2: 0, label: 'Approximate NEWS2' };
      let redFlags = [];
      let modelSuggestedUrgency = 'routine';

      if (status === 'submitted') {
        const scores = TriageRecord.computeTriageScores(vitals);
        computedScores = { news2: scores.news2, label: 'Approximate NEWS2' };
        redFlags = scores.redFlags;
        modelSuggestedUrgency = scores.modelSuggestedUrgency;
      }

      // Generate unique token TRG-YYYY-XXXXX
      const year = new Date().getFullYear();
      const randNum = Math.floor(1000 + Math.random() * 9000);
      const triageId = `TRG-${year}-${randNum}`;

      const triageRecord = new TriageRecord({
        triageId,
        patientId,
        hospitalId,
        recordedBy: req.user._id,
        recordedByRole: req.user.role,
        supervisingDoctorId: supervisingDoctorId || (isDoctor ? req.user._id : null),
        recordedAt: new Date(),
        arrivalMode,
        chiefComplaint: {
          category: chiefComplaint.category || 'General',
          text: chiefComplaint.text.trim(),
        },
        symptomDuration: symptomDuration || '1 hour',
        vitals,
        measurementMethod,
        notes: notes.trim(),
        status,
        computedScores,
        redFlags,
        modelSuggestedUrgency,
        isDoctorEntered: isDoctor,
        isSynthetic: true,
      });

      await triageRecord.save();

      // If red flags fired, create in-app critical alert for doctors
      let criticalAlert = null;
      if (status === 'submitted' && redFlags.length > 0) {
        criticalAlert = await TriageAlert.create({
          triageId: triageRecord.triageId,
          triageRecordId: triageRecord._id,
          hospitalId,
          patientId,
          patientName: patient.name,
          redFlags,
          news2Score: computedScores.news2,
          severity: 'critical',
          message: `CRITICAL TRIAGE ALERT: ${patient.name} has ${redFlags.length} red flag(s): ${redFlags.join('; ')}`,
        });
      }

      // Audit log (strictly NO vitals or notes in audit log text)
      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: status === 'submitted' ? 'SUBMIT_TRIAGE_RECORD' : 'CREATE_DRAFT_TRIAGE_RECORD',
        resourceType: 'TriageRecord',
        resourceId: triageRecord._id.toString(),
        patientId: patient._id,
        hospitalId,
        accessGranted: true,
        meta: {
          triageId,
          status,
          modelSuggestedUrgency,
          redFlagCount: redFlags.length,
          isDoctorEntered: isDoctor,
        },
      });

      const responseData = enrichTriageRecency(triageRecord);
      responseData.validationWarnings = validation.warnings;
      responseData.escalationRequired = redFlags.length > 0;
      responseData.escalationBanner = redFlags.length > 0 ? 'Escalate to doctor now' : null;
      responseData.criticalAlert = criticalAlert;

      return res.status(201).json({
        message: status === 'submitted' ? 'Triage record submitted successfully' : 'Draft triage record created',
        record: responseData,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/triage/records
 * List triage records for user's own hospital.
 * Allowed for triage_nurse and doctor.
 */
router.get(
  '/records',
  authenticate,
  authorizeRoles('triage_nurse', 'doctor'),
  async (req, res) => {
    try {
      const hospitalId = req.user.hospitalId;
      if (!hospitalId) {
        return res.status(403).json({ error: 'Forbidden', message: 'No hospital assigned.' });
      }

      const { status, patientId, limit = 50 } = req.query;
      const query = { hospitalId };

      if (status) query.status = status;
      if (patientId) query.patientId = patientId;

      const records = await TriageRecord.find(query)
        .populate('patientId', 'name age district phone')
        .populate('recordedBy', 'name role qualification registrationNumber')
        .populate('supervisingDoctorId', 'name role')
        .populate('confirmedBy', 'name role')
        .sort({ recordedAt: -1 })
        .limit(Number(limit));

      const enriched = records.map(enrichTriageRecency);

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'LIST_TRIAGE_RECORDS',
        resourceType: 'TriageRecord',
        resourceId: 'list',
        hospitalId,
        accessGranted: true,
        meta: { count: enriched.length, filterStatus: status || 'all' },
      });

      return res.json({ records: enriched });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/triage/records/:id
 * Retrieve a single triage record. Scoped strictly to hospital.
 * Returns identical generic 404 for missing or cross-hospital IDs (prevents ID probing).
 */
router.get(
  '/records/:id',
  authenticate,
  authorizeRoles('triage_nurse', 'doctor'),
  async (req, res) => {
    try {
      const hospitalId = req.user.hospitalId;
      const idOrTriageId = req.params.id;

      const isMongoId = /^[0-9a-fA-F]{24}$/.test(idOrTriageId);
      const query = isMongoId ? { _id: idOrTriageId } : { triageId: idOrTriageId.toUpperCase() };

      const record = await TriageRecord.findOne(query)
        .populate('patientId', 'name age district phone')
        .populate('recordedBy', 'name role qualification registrationNumber')
        .populate('supervisingDoctorId', 'name role')
        .populate('confirmedBy', 'name role');

      // Enforce cross-hospital isolation: return identical 404
      if (!record || record.hospitalId.toString() !== hospitalId.toString()) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Triage record not found.',
        });
      }

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'VIEW_TRIAGE_RECORD',
        resourceType: 'TriageRecord',
        resourceId: record._id.toString(),
        patientId: record.patientId?._id,
        hospitalId,
        accessGranted: true,
        meta: { triageId: record.triageId },
      });

      return res.json({ record: enrichTriageRecency(record) });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * PUT /api/triage/records/:id
 * Update draft triage record. Triage nurses only.
 */
router.put(
  '/records/:id',
  authenticate,
  authorizeRoles('triage_nurse'),
  async (req, res) => {
    try {
      const hospitalId = req.user.hospitalId;
      const idOrTriageId = req.params.id;
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(idOrTriageId);
      const query = isMongoId ? { _id: idOrTriageId } : { triageId: idOrTriageId.toUpperCase() };

      const record = await TriageRecord.findOne(query);
      if (!record || record.hospitalId.toString() !== hospitalId.toString()) {
        return res.status(404).json({ error: 'Not Found', message: 'Triage record not found.' });
      }

      if (record.status !== 'draft') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Only draft triage records can be edited. Submitted records require clinical amendment.',
        });
      }

      const { vitals, chiefComplaint, symptomDuration, notes, arrivalMode } = req.body;

      if (vitals) {
        const validation = TriageRecord.validatePhysiologicalVitals(vitals);
        if (!validation.valid) {
          return res.status(400).json({ error: 'Invalid Physiological Vitals', message: validation.error });
        }
        record.vitals = vitals;
      }

      if (chiefComplaint) {
        if (chiefComplaint.category) record.chiefComplaint.category = chiefComplaint.category;
        if (chiefComplaint.text) record.chiefComplaint.text = chiefComplaint.text.trim();
      }
      if (symptomDuration) record.symptomDuration = symptomDuration;
      if (notes !== undefined) record.notes = notes.trim();
      if (arrivalMode) record.arrivalMode = arrivalMode;

      await record.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'UPDATE_DRAFT_TRIAGE_RECORD',
        resourceType: 'TriageRecord',
        resourceId: record._id.toString(),
        patientId: record.patientId,
        hospitalId,
        accessGranted: true,
        meta: { triageId: record.triageId },
      });

      return res.json({ message: 'Draft triage record updated', record: enrichTriageRecency(record) });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/triage/records/:id/submit
 * Submit draft triage record, calculate red flags, create critical alert if needed.
 */
router.post(
  '/records/:id/submit',
  authenticate,
  authorizeRoles('triage_nurse', 'doctor'),
  triageRateLimiter,
  async (req, res) => {
    try {
      const hospitalId = req.user.hospitalId;
      const idOrTriageId = req.params.id;
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(idOrTriageId);
      const query = isMongoId ? { _id: idOrTriageId } : { triageId: idOrTriageId.toUpperCase() };

      const record = await TriageRecord.findOne(query).populate('patientId', 'name age district');
      if (!record || record.hospitalId.toString() !== hospitalId.toString()) {
        return res.status(404).json({ error: 'Not Found', message: 'Triage record not found.' });
      }

      const scores = TriageRecord.computeTriageScores(record.vitals);
      record.computedScores = { news2: scores.news2, label: 'Approximate NEWS2' };
      record.redFlags = scores.redFlags;
      record.modelSuggestedUrgency = scores.modelSuggestedUrgency;
      record.status = 'submitted';
      await record.save();

      let criticalAlert = null;
      if (scores.redFlags.length > 0) {
        criticalAlert = await TriageAlert.create({
          triageId: record.triageId,
          triageRecordId: record._id,
          hospitalId,
          patientId: record.patientId._id,
          patientName: record.patientId.name,
          redFlags: scores.redFlags,
          news2Score: scores.news2,
          severity: 'critical',
          message: `CRITICAL TRIAGE ALERT: ${record.patientId.name} has ${scores.redFlags.length} red flag(s): ${scores.redFlags.join('; ')}`,
        });
      }

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'SUBMIT_TRIAGE_RECORD',
        resourceType: 'TriageRecord',
        resourceId: record._id.toString(),
        patientId: record.patientId._id,
        hospitalId,
        accessGranted: true,
        meta: {
          triageId: record.triageId,
          modelSuggestedUrgency: record.modelSuggestedUrgency,
          redFlagCount: scores.redFlags.length,
        },
      });

      const responseData = enrichTriageRecency(record);
      responseData.escalationRequired = scores.redFlags.length > 0;
      responseData.escalationBanner = scores.redFlags.length > 0 ? 'Escalate to doctor now' : null;
      responseData.criticalAlert = criticalAlert;

      return res.json({
        message: 'Triage record submitted successfully',
        record: responseData,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/triage/records/:id/amend
 * Doctor clinical amendment to a nurse-entered triage record.
 * Doctors cannot edit nurse values in-place; original is kept in amendment history.
 * Reason is required.
 */
router.post(
  '/records/:id/amend',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const hospitalId = req.user.hospitalId;
      const idOrTriageId = req.params.id;
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(idOrTriageId);
      const query = isMongoId ? { _id: idOrTriageId } : { triageId: idOrTriageId.toUpperCase() };

      const record = await TriageRecord.findOne(query);
      if (!record || record.hospitalId.toString() !== hospitalId.toString()) {
        return res.status(404).json({ error: 'Not Found', message: 'Triage record not found.' });
      }

      const { reason, vitals, notes } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Clinical justification reason is required for amendments.',
        });
      }

      if (vitals) {
        const validation = TriageRecord.validatePhysiologicalVitals(vitals);
        if (!validation.valid) {
          return res.status(400).json({ error: 'Invalid Physiological Vitals', message: validation.error });
        }
      }

      // Record amendment history
      record.amendmentHistory.push({
        amendedBy: req.user._id,
        amendedAt: new Date(),
        reason: reason.trim(),
        previousVitals: { ...record.vitals },
        previousNotes: record.notes,
      });

      if (vitals) {
        record.vitals = vitals;
        const scores = TriageRecord.computeTriageScores(vitals);
        record.computedScores = { news2: scores.news2, label: 'Approximate NEWS2' };
        record.redFlags = scores.redFlags;
        record.modelSuggestedUrgency = scores.modelSuggestedUrgency;
      }

      if (notes !== undefined) {
        record.notes = notes.trim();
      }

      record.status = 'amended';
      await record.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: 'doctor',
        action: 'AMEND_TRIAGE_RECORD',
        resourceType: 'TriageRecord',
        resourceId: record._id.toString(),
        patientId: record.patientId,
        hospitalId,
        accessGranted: true,
        justification: reason.trim(),
        meta: {
          triageId: record.triageId,
          amendmentIndex: record.amendmentHistory.length - 1,
        },
      });

      return res.json({
        message: 'Triage record amended successfully with original preserved in history.',
        record: enrichTriageRecency(record),
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/triage/records/:id/confirm-urgency
 * Doctor confirms or overrides urgency.
 * TRIAGE NURSES ARE STRICTLY FORBIDDEN FROM THIS ENDPOINT.
 */
router.post(
  '/records/:id/confirm-urgency',
  authenticate,
  authorizeRoles('doctor'), // Doctor only!
  async (req, res) => {
    try {
      const hospitalId = req.user.hospitalId;
      const idOrTriageId = req.params.id;
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(idOrTriageId);
      const query = isMongoId ? { _id: idOrTriageId } : { triageId: idOrTriageId.toUpperCase() };

      const record = await TriageRecord.findOne(query);
      if (!record || record.hospitalId.toString() !== hospitalId.toString()) {
        return res.status(404).json({ error: 'Not Found', message: 'Triage record not found.' });
      }

      const { confirmedUrgency, overrideReason } = req.body;
      if (!confirmedUrgency || !['emergency', 'urgent', 'routine'].includes(confirmedUrgency)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'confirmedUrgency must be "emergency", "urgent", or "routine".',
        });
      }

      const isOverride = confirmedUrgency !== record.modelSuggestedUrgency;
      if (isOverride && (!overrideReason || !overrideReason.trim())) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'A clinical justification reason is mandatory when overriding suggested urgency.',
        });
      }

      record.confirmedUrgency = confirmedUrgency;
      record.confirmedBy = req.user._id;
      record.confirmedAt = new Date();
      record.overrideReason = isOverride ? overrideReason.trim() : null;
      record.status = 'reviewed';

      await record.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: 'doctor',
        action: isOverride ? 'OVERRIDE_TRIAGE_URGENCY' : 'CONFIRM_TRIAGE_URGENCY',
        resourceType: 'TriageRecord',
        resourceId: record._id.toString(),
        patientId: record.patientId,
        hospitalId,
        accessGranted: true,
        justification: isOverride ? overrideReason.trim() : 'Accepted suggested urgency',
        meta: {
          triageId: record.triageId,
          suggested: record.modelSuggestedUrgency,
          confirmed: confirmedUrgency,
          isOverride,
        },
      });

      return res.json({
        message: `Urgency confirmed as ${confirmedUrgency.toUpperCase()}`,
        record: enrichTriageRecency(record),
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/triage/records/:id/remeasure
 * Doctor requests re-measurement by nurse.
 */
router.post(
  '/records/:id/remeasure',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const hospitalId = req.user.hospitalId;
      const idOrTriageId = req.params.id;
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(idOrTriageId);
      const query = isMongoId ? { _id: idOrTriageId } : { triageId: idOrTriageId.toUpperCase() };

      const record = await TriageRecord.findOne(query);
      if (!record || record.hospitalId.toString() !== hospitalId.toString()) {
        return res.status(404).json({ error: 'Not Found', message: 'Triage record not found.' });
      }

      const { reason = 'Vitals age threshold exceeded; re-measure required.' } = req.body;
      record.remeasureRequested = true;
      record.remeasureReason = reason;
      await record.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: 'doctor',
        action: 'REQUEST_REMEASURE',
        resourceType: 'TriageRecord',
        resourceId: record._id.toString(),
        patientId: record.patientId,
        hospitalId,
        accessGranted: true,
        justification: reason,
        meta: { triageId: record.triageId },
      });

      return res.json({
        message: 'Re-measurement request dispatched to triage nurse roster.',
        record: enrichTriageRecency(record),
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/triage/patients
 * Minimum patient summary for triage intake queue.
 * Returns only: name, age, gender, allergies, current medications, district.
 */
router.get(
  '/patients',
  authenticate,
  authorizeRoles('triage_nurse', 'doctor'),
  async (req, res) => {
    try {
      const patients = await User.find({ role: 'patient' })
        .select('name district age gender allergies currentMedications')
        .limit(20);

      // Return synthetic minimum profile
      const intakePatients = patients.map((p, idx) => ({
        _id: p._id,
        id: p._id,
        patientId: p._id,
        name: p.name,
        district: p.district || 'Salem',
        age: p.age || (35 + (idx * 7) % 40),
        gender: p.gender || (idx % 2 === 0 ? 'Female' : 'Male'),
        allergies: p.allergies || (idx % 3 === 0 ? ['Penicillin'] : ['No known drug allergies']),
        currentMedications: p.currentMedications || (idx % 2 === 0 ? ['Amlodipine 5mg'] : ['Metformin 500mg']),
      }));

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'LIST_TRIAGE_INTAKE_PATIENTS',
        resourceType: 'User',
        resourceId: 'patient_intake_list',
        hospitalId: req.user.hospitalId,
        accessGranted: true,
        meta: { count: intakePatients.length },
      });

      return res.json({ patients: intakePatients });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/triage/alerts
 * Active critical triage alerts for doctor dashboard.
 */
router.get(
  '/alerts',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const hospitalId = req.user.hospitalId;
      const alerts = await TriageAlert.find({ hospitalId, acknowledged: false })
        .sort({ createdAt: -1 })
        .limit(20);

      return res.json({ alerts });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/triage/alerts/:alertId/ack
 * Acknowledge critical alert.
 */
router.post(
  '/alerts/:alertId/ack',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const alert = await TriageAlert.findOne({
        _id: req.params.alertId,
        hospitalId: req.user.hospitalId,
      });

      if (!alert) {
        return res.status(404).json({ error: 'Not Found', message: 'Alert not found.' });
      }

      alert.acknowledged = true;
      alert.acknowledgedBy = req.user._id;
      alert.acknowledgedAt = new Date();
      await alert.save();

      return res.json({ message: 'Critical alert acknowledged.', alert });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/triage/doctor/my-nurses
 * Doctor fetches the list of nurses they supervise.
 */
router.get(
  '/doctor/my-nurses',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const doctor = await User.findById(req.user._id).select('supervisingDoctorIds');
      // supervisingDoctorIds on User — but for doctors we store which nurseIds they supervise in a similar field
      // We look for nurses whose supervisingDoctorIds includes this doctor
      const nurses = await User.find({
        role: 'triage_nurse',
        hospitalId: req.user.hospitalId,
        supervisingDoctorIds: req.user._id,
      }).select('name email qualification registrationNumber status');

      return res.json({ nurses });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/triage/doctor/available-nurses
 * Doctor fetches all nurses at their hospital to pick from.
 */
router.get(
  '/doctor/available-nurses',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const nurses = await User.find({
        role: 'triage_nurse',
        hospitalId: req.user.hospitalId,
      }).select('name email qualification registrationNumber status supervisingDoctorIds');

      return res.json({ nurses });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/triage/doctor/add-nurse
 * Doctor adds a nurse to their supervised list.
 * Body: { nurseId }
 */
router.post(
  '/doctor/add-nurse',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const { nurseId } = req.body;
      if (!nurseId) {
        return res.status(400).json({ error: 'Bad Request', message: 'nurseId is required.' });
      }

      const nurse = await User.findOne({
        _id: nurseId,
        role: 'triage_nurse',
        hospitalId: req.user.hospitalId,
      });

      if (!nurse) {
        return res.status(404).json({ error: 'Not Found', message: 'Nurse not found at your hospital.' });
      }

      // Add this doctor to the nurse's supervisingDoctorIds if not already there
      if (!nurse.supervisingDoctorIds.map(id => id.toString()).includes(req.user._id.toString())) {
        nurse.supervisingDoctorIds.push(req.user._id);
        await nurse.save();
      }

      return res.json({ message: `Nurse ${nurse.name} added to your supervised roster.`, nurse });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/triage/doctor/remove-nurse
 * Doctor removes a nurse from their supervised list.
 * Body: { nurseId }
 */
router.post(
  '/doctor/remove-nurse',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const { nurseId } = req.body;
      if (!nurseId) {
        return res.status(400).json({ error: 'Bad Request', message: 'nurseId is required.' });
      }

      const nurse = await User.findOne({
        _id: nurseId,
        role: 'triage_nurse',
        hospitalId: req.user.hospitalId,
      });

      if (!nurse) {
        return res.status(404).json({ error: 'Not Found', message: 'Nurse not found.' });
      }

      nurse.supervisingDoctorIds = nurse.supervisingDoctorIds.filter(
        (id) => id.toString() !== req.user._id.toString()
      );
      await nurse.save();

      return res.json({ message: `Nurse ${nurse.name} removed from your supervised roster.` });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * GET /api/triage/doctor/queue
 * Doctor fetches triage submissions from nurses they supervise.
 * Only returns records submitted by nurses with this doctor in their supervisingDoctorIds.
 */
router.get(
  '/doctor/queue',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const hospitalId = req.user.hospitalId;
      if (!hospitalId) {
        return res.status(403).json({ error: 'Forbidden', message: 'No hospital assigned.' });
      }

      // Find nurses supervised by this doctor
      const myNurses = await User.find({
        role: 'triage_nurse',
        hospitalId,
        supervisingDoctorIds: req.user._id,
      }).select('_id name');

      if (myNurses.length === 0) {
        return res.json({ records: [], nurseCount: 0, message: 'No nurses assigned. Add nurses from the My Nurses tab.' });
      }

      const nurseIds = myNurses.map((n) => n._id);

      const records = await TriageRecord.find({
        hospitalId,
        recordedBy: { $in: nurseIds },
        status: { $in: ['submitted', 'reviewed', 'amended'] },
      })
        .populate('patientId', 'name age district gender phone')
        .populate('recordedBy', 'name qualification registrationNumber')
        .populate('supervisingDoctorId', 'name')
        .sort({ recordedAt: -1 })
        .limit(50);

      const enriched = records.map(enrichTriageRecency);

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'LIST_DOCTOR_TRIAGE_QUEUE',
        resourceType: 'TriageRecord',
        resourceId: 'doctor_queue',
        hospitalId,
        accessGranted: true,
        meta: { count: enriched.length, nurseCount: myNurses.length },
      });

      return res.json({ records: enriched, nurseCount: myNurses.length, nurses: myNurses });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

module.exports = router;

