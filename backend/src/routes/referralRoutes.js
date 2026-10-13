const express = require('express');
const router = express.Router();
const Referral = require('../models/Referral');
const Hospital = require('../models/Hospital');
const HospitalCapacity = require('../models/HospitalCapacity');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { rankReferralHospitals } = require('../services/referralEngineService');
const { recordAuditLog } = require('../services/auditService');
const { assessPatient, predictSeverity, MANDATORY_DISCLAIMER } = require('../services/mlTriageService');
const freshnessConfig = require('../config/freshness.json');
const rankingRules = require('../config/rankingRules.json');

/**
 * Helper to fetch latest capacity snapshots for an array of hospitals.
 */
async function fetchLatestCapacitiesForHospitals(hospitalIds) {
  const latestSnapshots = await HospitalCapacity.aggregate([
    { $match: { hospitalId: { $in: hospitalIds } } },
    { $sort: { timestamp: -1, reportedAt: -1 } },
    {
      $group: {
        _id: '$hospitalId',
        latestDoc: { $first: '$$ROOT' },
      },
    },
  ]);

  const map = new Map();
  latestSnapshots.forEach(item => {
    map.set(item._id.toString(), item.latestDoc);
  });
  return map;
}

/**
 * POST /api/referrals/assess
 * Runs ML triage severity assessment & condition screening module.
 * Restricted to: doctor
 * Output: Decision support only. Clinician review required.
 */
router.post(
  '/assess',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const patientData = req.body || {};
      const assessment = await assessPatient(patientData);

      // Audit log prediction request WITHOUT raw PHI
      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'ASSESS_TRIAGE_SEVERITY',
        resourceType: 'ClinicalDecisionSupport',
        resourceId: `ASSESS-${Date.now()}`,
        hospitalId: req.user.hospitalId,
        accessGranted: true,
        justification: 'Clinician requested automated triage and condition screening decision support.',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: {
          urgency: assessment.urgency,
          specialties: assessment.specialties,
          redFlagCount: (assessment.red_flags || []).length,
          conditionsEvaluated: (assessment.condition_risks || []).length,
          fallbackUsed: Boolean(assessment.serviceFallback),
        },
      });

      return res.json(assessment);
    } catch (err) {
      console.error('[REFERRAL ASSESS ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/referrals/predict-severity
 * Runs Triage Severity/acuity model on intake vitals.
 * Restricted to: doctor
 */
router.post(
  '/predict-severity',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const result = await predictSeverity(req.body || {});

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'PREDICT_TRIAGE_SEVERITY',
        resourceType: 'ClinicalDecisionSupport',
        resourceId: `TRIAGE-${Date.now()}`,
        hospitalId: req.user.hospitalId,
        accessGranted: true,
        justification: 'Clinician evaluated triage acuity score.',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: {
          riskCategory: result.riskCategory,
          riskScore: result.riskScore,
          fallbackUsed: Boolean(result.serviceFallback),
        },
      });

      return res.json(result);
    } catch (err) {
      console.error('[TRIAGE PREDICTION ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/referrals/recommend
 * Runs the CareBridge referral ranking engine and persists a draft referral.
 * Restricted to: doctor
 */
router.post(
  '/recommend',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const {
        patientName,
        patientId,
        patientSummary = {},
        requiredSpecialty,
        urgency = 'urgent',
        requiredEquipment = [],
        requiredBedType = 'none',
        patientLocation,
        preferredScheme = null,
        capacityMode = 'unknown_aware',
        doctorNotes,
        modelSuggestedUrgency = null,
        urgencyConfirmedByDoctor = true,
        urgencyOverrideReason = null,
        mlAssessment = null,
      } = req.body;

      if (!requiredSpecialty) {
        return res.status(400).json({ error: 'Bad Request', message: 'requiredSpecialty is required.' });
      }
      if (!patientLocation || patientLocation.latitude === undefined || patientLocation.longitude === undefined) {
        return res.status(400).json({ error: 'Bad Request', message: 'Valid patientLocation { latitude, longitude } is required.' });
      }

      // Fetch all hospitals
      const allHospitals = await Hospital.find({}).lean();
      const hospitalIds = allHospitals.map(h => h._id);

      // Fetch latest capacity snapshot per hospital
      const capacityMap = await fetchLatestCapacitiesForHospitals(hospitalIds);

      // Run pure referral engine
      const engineResult = rankReferralHospitals(
        {
          requiredSpecialty,
          urgency,
          requiredEquipment,
          requiredBedType,
          patientLocation,
          referringHospitalId: req.user.hospitalId,
          preferredScheme,
          capacityMode,
          now: new Date(),
        },
        allHospitals,
        capacityMap
      );

      const referralId = `REF-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 899 + 100)}`;

      const referralDoc = new Referral({
        referralId,
        patientId: patientId || undefined,
        patientName: patientName || 'Synthetic Patient Referral',
        referringDoctorId: req.user._id,
        referringHospitalId: req.user.hospitalId,
        patientSummary,
        requirements: {
          requiredSpecialty,
          urgency,
          requiredEquipment,
          patientCoordinates: patientLocation,
          preferredScheme,
          capacityMode,
          modelSuggestedUrgency,
          urgencyConfirmedByDoctor: urgencyConfirmedByDoctor !== undefined ? urgencyConfirmedByDoctor : true,
          urgencyOverrideReason,
        },
        mlAssessment: mlAssessment || undefined,
        engineVersion: '1.0.0',
        configSnapshot: {
          freshness: freshnessConfig,
          rankingRules: rankingRules,
        },
        candidates: engineResult.recommendations,
        rankedRecommendations: engineResult.recommendations,
        excludedHospitals: engineResult.excludedHospitals,
        status: 'draft',
        doctorNotes,
        clinicalDisclaimerAcknowledged: true,
        decisionSupportDisclaimer: engineResult.decisionSupportNotice || MANDATORY_DISCLAIMER,
        isSynthetic: true,
      });

      const saved = await referralDoc.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'QUERY_REFERRAL_ENGINE',
        resourceType: 'Referral',
        resourceId: saved._id.toString(),
        hospitalId: req.user.hospitalId,
        accessGranted: true,
        justification: `Doctor generated referral recommendations for ${requiredSpecialty} (${urgency})`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: {
          eligibleCount: engineResult.recommendations.length,
          topHospitalId: engineResult.recommendations[0]?.hospitalId,
          capacityMode,
        },
      });

      // If doctor chose an urgency that overrides the model recommendation, log override event
      if (modelSuggestedUrgency && modelSuggestedUrgency !== urgency) {
        await recordAuditLog({
          actorId: req.user._id,
          actorRole: req.user.role,
          action: 'OVERRIDE_MODEL_URGENCY',
          resourceType: 'Referral',
          resourceId: saved._id.toString(),
          hospitalId: req.user.hospitalId,
          accessGranted: true,
          justification: `Doctor selected "${urgency}" overriding model suggested "${modelSuggestedUrgency}". Reason: ${urgencyOverrideReason || 'Clinical judgment'}`,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          meta: {
            modelSuggestedUrgency,
            selectedUrgency: urgency,
            hasOverrideReason: Boolean(urgencyOverrideReason),
          },
        });
      }

      return res.status(201).json({
        message: 'Referral recommendations generated. Draft saved for clinical review.',
        referralId: saved.referralId,
        referralDbId: saved._id,
        status: saved.status,
        summary: engineResult.summary,
        recommendations: engineResult.recommendations,
        excludedHospitals: engineResult.excludedHospitals,
        decisionSupportNotice: engineResult.decisionSupportNotice,
      });
    } catch (err) {
      console.error('[REFERRAL ROUTE ERROR]:', err);
      return res.status(500).json({ error: 'Server Error', message: err.message, stack: err.stack });
    }
  }
);

/**
 * GET /api/referrals/:id
 * Retrieve a referral document.
 * Access Control:
 * - Doctor: creating doctor only
 * - Reviewer: platform_reviewer
 * - Patient: can see their own referral status only (not clinical ranking scores or other patient records)
 */
const GENERIC_REFERRAL_404 = {
  error: 'Not Found',
  message: 'Referral document not found or access denied.',
};

router.get('/:id', authenticate, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json(GENERIC_REFERRAL_404);
    }

    const referral = await Referral.findById(req.params.id)
      .populate('referringHospitalId', 'name code district')
      .populate('selectedHospitalId', 'name code district');

    if (!referral) {
      return res.status(404).json(GENERIC_REFERRAL_404);
    }

    const currentUser = req.user;

    // Patient view: allowed if referral matches patientId, but strip clinical scores
    if (currentUser.role === 'patient') {
      if (!referral.patientId || referral.patientId.toString() !== currentUser._id.toString()) {
        return res.status(404).json(GENERIC_REFERRAL_404);
      }

      // Sync consent status if linked
      if (referral.recordsConsentId) {
        const Consent = require('../models/Consent');
        const linkedConsent = await Consent.findById(referral.recordsConsentId);
        if (linkedConsent && referral.recordsConsentStatus !== linkedConsent.status) {
          referral.recordsConsentStatus = linkedConsent.status;
          await referral.save();
        }
      }

      // Return sanitized patient view (status only)
      return res.json({
        referralId: referral.referralId,
        patientName: referral.patientName,
        status: referral.status,
        recordsConsentStatus: referral.recordsConsentStatus || 'not_requested',
        recordsConsentId: referral.recordsConsentId,
        selectedHospital: referral.selectedHospitalId ? {
          name: referral.selectedHospitalId.name,
          district: referral.selectedHospitalId.district,
        } : null,
        decisionSupportNotice: 'Decision support only. A clinician must review.',
      });
    }

    // Doctor access check: Must be the referring doctor
    if (currentUser.role === 'doctor') {
      if (referral.referringDoctorId && referral.referringDoctorId.toString() !== currentUser._id.toString()) {
        return res.status(404).json(GENERIC_REFERRAL_404);
      }
    } else if (currentUser.role !== 'platform_reviewer') {
      return res.status(404).json(GENERIC_REFERRAL_404);
    }

    // Sync consent status if linked
    if (referral.recordsConsentId) {
      const Consent = require('../models/Consent');
      const linkedConsent = await Consent.findById(referral.recordsConsentId);
      if (linkedConsent && referral.recordsConsentStatus !== linkedConsent.status) {
        referral.recordsConsentStatus = linkedConsent.status;
        await referral.save();
      }
    }

    return res.json({ referral });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * PATCH /api/referrals/:id/review
 * Doctor reviews recommendation, selects hospital (or rejects), provides clinical notes.
 * Moves status: draft -> reviewed -> sent -> accepted | declined | cancelled
 * Restricted to: doctor (the creating doctor)
 */
router.patch(
  '/:id/review',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const referral = await Referral.findById(req.params.id);
      if (!referral) {
        return res.status(404).json({ error: 'Not Found', message: 'Referral document not found.' });
      }

      // Check doctor ownership
      if (referral.referringDoctorId && referral.referringDoctorId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Security Policy Violation: You cannot review referrals initiated by another doctor.',
        });
      }

      const {
        selectedHospitalId,
        notes,
        overrideReason,
        newStatus = 'reviewed',
        requestRecordsConsent = false,
        recordTypes = ['lab_report', 'prescription', 'discharge_summary'],
      } = req.body;

      if (!['reviewed', 'sent', 'accepted', 'declined', 'cancelled'].includes(newStatus)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Invalid status "${newStatus}". Must be one of: reviewed, sent, accepted, declined, cancelled.`,
        });
      }

      const prevStatus = referral.status;
      referral.status = newStatus;

      if (selectedHospitalId) {
        referral.selectedHospitalId = selectedHospitalId;
      }

      // If requested, initiate a consent request for the receiving hospital
      // Referral acceptance does NOT auto-grant records consent.
      let createdConsent = null;
      if (requestRecordsConsent && referral.patientId && referral.selectedHospitalId) {
        const { requestConsent } = require('../services/consentService');
        createdConsent = await requestConsent({
          patientId: referral.patientId,
          requestingDoctorId: req.user._id,
          requestingHospitalId: referral.selectedHospitalId,
          purpose: 'referral',
          recordTypes,
          referralId: referral._id,
          actorRole: req.user.role,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
        referral.recordsConsentStatus = 'requested';
        referral.recordsConsentId = createdConsent._id;
      }

      referral.clinicianReview = {
        clinicianId: req.user._id,
        clinicianName: req.user.name,
        selectedHospitalId: selectedHospitalId || referral.selectedHospitalId,
        notes: notes || referral.clinicianReview?.notes,
        overrideReason: overrideReason || referral.clinicianReview?.overrideReason,
        reviewedAt: new Date(),
      };

      const saved = await referral.save();

      await recordAuditLog({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: 'CREATE_REFERRAL',
        resourceType: 'Referral',
        resourceId: saved._id.toString(),
        hospitalId: referral.selectedHospitalId,
        accessGranted: true,
        justification: `Clinician reviewed referral ${saved.referralId}. Status moved from ${prevStatus} to ${newStatus}. Override: ${overrideReason || 'None'}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        meta: {
          prevStatus,
          newStatus,
          selectedHospitalId,
          recordsConsentStatus: saved.recordsConsentStatus,
        },
      });

      return res.json({
        message: `Referral successfully updated to "${newStatus}". Clinician review recorded.`,
        referralId: saved.referralId,
        status: saved.status,
        recordsConsentStatus: saved.recordsConsentStatus,
        recordsConsentId: saved.recordsConsentId,
        clinicianReview: saved.clinicianReview,
        consentRequest: createdConsent,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

/**
 * POST /api/referrals/:id/request-records-consent
 * Explicitly sends a consent request to the patient for the receiving hospital.
 * Restricted to: doctor (the creating doctor)
 */
router.post(
  '/:id/request-records-consent',
  authenticate,
  authorizeRoles('doctor'),
  async (req, res) => {
    try {
      const referral = await Referral.findById(req.params.id);
      if (!referral) {
        return res.status(404).json({ error: 'Not Found', message: 'Referral document not found.' });
      }

      if (referral.referringDoctorId && referral.referringDoctorId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Security Policy Violation: You cannot request consent on referrals initiated by another doctor.',
        });
      }

      if (!referral.patientId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Referral does not have an associated patient account.',
        });
      }

      const receivingHospitalId = req.body.receivingHospitalId || referral.selectedHospitalId;
      if (!receivingHospitalId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Receiving hospital must be selected before requesting record consent.',
        });
      }

      const { recordTypes = ['lab_report', 'prescription', 'discharge_summary'], purpose = 'referral' } = req.body;
      const { requestConsent } = require('../services/consentService');

      const consent = await requestConsent({
        patientId: referral.patientId,
        requestingDoctorId: req.user._id,
        requestingHospitalId: receivingHospitalId,
        purpose,
        recordTypes,
        referralId: referral._id,
        actorRole: req.user.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      referral.recordsConsentStatus = 'requested';
      referral.recordsConsentId = consent._id;
      await referral.save();

      return res.status(201).json({
        message: 'Consent request dispatched to patient for receiving hospital.',
        referralId: referral.referralId,
        recordsConsentStatus: referral.recordsConsentStatus,
        consent,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server Error', message: err.message });
    }
  }
);

module.exports = router;
