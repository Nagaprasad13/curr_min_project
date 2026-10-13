const mongoose = require('mongoose');
const Practitioner = require('../models/Practitioner');
const Hospital = require('../models/Hospital');
const { classifyHospitalTier } = require('./tierClassificationService');
const { recordAuditLog } = require('./auditService');

/**
 * Derives specialist availability for a hospital strictly from active, verified practitioners.
 * Unverified, on-leave, or resigned practitioners are excluded.
 * 
 * @param {string|mongoose.Types.ObjectId} hospitalId
 * @returns {Promise<Array<{ specialty: string, count: number, onCall24x7: boolean }>>}
 */
async function deriveHospitalSpecialists(hospitalId) {
  const hId = typeof hospitalId === 'string' ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

  const aggregated = await Practitioner.aggregate([
    {
      $match: {
        hospitalId: hId,
        employmentStatus: 'active',
        verificationStatus: 'verified',
      },
    },
    {
      $group: {
        _id: '$specialty',
        count: { $sum: 1 },
        has24x7: {
          $max: {
            $cond: [{ $eq: ['$availability', 'on_call_24x7'] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        specialty: '$_id',
        count: 1,
        onCall24x7: { $eq: ['$has24x7', 1] },
      },
    },
    {
      $sort: { specialty: 1 },
    },
  ]);

  return aggregated;
}

/**
 * Synchronizes derived specialist counts onto the Hospital document,
 * and re-evaluates the hospital tier based on the derived capability metrics.
 * 
 * @param {string|mongoose.Types.ObjectId} hospitalId
 * @param {object} [actorUser] - Optional user initiating the change for audit trail
 * @returns {Promise<{ hospital: object, derivedSpecialists: Array }>}
 */
async function syncHospitalSpecialists(hospitalId, actorUser = null) {
  const derived = await deriveHospitalSpecialists(hospitalId);
  const hospital = await Hospital.findById(hospitalId);

  if (!hospital) {
    throw new Error(`Hospital ${hospitalId} not found`);
  }

  const previousSpecialists = hospital.specialists ? JSON.parse(JSON.stringify(hospital.specialists)) : [];
  const previousTier = hospital.tier;

  hospital.specialists = derived;

  // Re-evaluate tier with updated derived specialists
  const tierEvaluation = classifyHospitalTier(hospital, hospital.verificationStatus === 'verified');
  const newTier = tierEvaluation.proposedTier;
  const tierChanged = previousTier !== newTier;

  hospital.proposedTier = newTier;
  hospital.tierRationale = tierEvaluation.rulesMet;
  hospital.tierDetails = {
    rulesMet: tierEvaluation.rulesMet,
    rulesMissed: tierEvaluation.rulesMissed,
    gapToNextTier: tierEvaluation.gapToNextTier,
    computedAt: new Date(),
  };

  // If tier changed, update tier and record audit log
  if (tierChanged) {
    hospital.tier = newTier;
    hospital.tierStatus = hospital.verificationStatus === 'verified' ? 'confirmed' : 'unconfirmed';

    if (actorUser) {
      await recordAuditLog({
        actorId: actorUser._id,
        actorRole: actorUser.role,
        action: 'TIER_RECLASSIFIED',
        resourceType: 'Hospital',
        resourceId: hospital._id.toString(),
        hospitalId: hospital._id,
        accessGranted: true,
        justification: `Staffing roster modification triggered tier reclassification from ${previousTier} to ${newTier}`,
        meta: {
          previousTier,
          newTier,
          derivedSpecialistsCount: derived.length,
          rationale: tierEvaluation.rationale,
        },
      });
    }
  }

  await hospital.save();

  return {
    hospital,
    derivedSpecialists: derived,
    tierChanged,
    previousTier,
    newTier,
  };
}

module.exports = {
  deriveHospitalSpecialists,
  syncHospitalSpecialists,
};
