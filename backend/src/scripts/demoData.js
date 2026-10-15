const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const runSeed = require('./seed');
const { haversineDistance } = require('./syntheticDataGenerator');
const {
  CREDENTIALS_PATH,
} = require('./seedHospitalAccounts');
const Hospital = require('../models/Hospital');
const HospitalCapacity = require('../models/HospitalCapacity');
const Practitioner = require('../models/Practitioner');
const User = require('../models/User');
const Referral = require('../models/Referral');
const Consent = require('../models/Consent');
const PatientRecord = require('../models/PatientRecord');
const Scheme = require('../models/Scheme');
const ConditionSpecialtyMap = require('../models/ConditionSpecialtyMap');
const { requestConsent, grantConsent, denyConsent, revokeConsent, expireOldConsents } = require('../services/consentService');
const { recordAuditLog } = require('../services/auditService');
const { syncHospitalSpecialists } = require('../services/practitionerService');

const DEMO_DATABASE_NAME = 'carebridge_demo';
const DEMO_MARKER_ID = 'carebridge-demo';
const DEMO_SEED_VERSION = 1;
const EVALUATION_ROOTS = [
  path.join(__dirname, '..', '..', 'data'),
  path.join(__dirname, '..', '..', 'src', 'evaluation', 'results'),
  path.join(__dirname, '..', '..', 'src', 'evaluation', 'RESULTS.md'),
  path.join(__dirname, '..', '..', '..', 'ml', 'RESULTS.md'),
  path.join(__dirname, '..', '..', '..', 'evaluation', 'RESULTS.md'),
];

function databaseNameFromUri(uri) {
  if (!uri) return null;
  let parsed;
  try {
    parsed = new URL(uri);
  } catch (error) {
    throw new Error('MONGODB_URI must be a valid MongoDB URI.');
  }
  return decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] || '');
}

function assertDemoEnvironment(env = process.env) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Demo data commands are disabled when NODE_ENV=production.');
  }
  if (env.CAREBRIDGE_DEMO_DATABASE !== 'true') {
    throw new Error('Set CAREBRIDGE_DEMO_DATABASE=true to explicitly mark the target as a demo database.');
  }
  if (env.DEMO_DATABASE_NAME !== DEMO_DATABASE_NAME) {
    throw new Error(`DEMO_DATABASE_NAME must be exactly "${DEMO_DATABASE_NAME}".`);
  }
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI must explicitly identify the local demo database.');
  const actualDatabaseName = databaseNameFromUri(env.MONGODB_URI);
  const hostname = new URL(env.MONGODB_URI).hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    throw new Error('Demo data commands are restricted to a local MongoDB host.');
  }
  if (actualDatabaseName !== DEMO_DATABASE_NAME) {
    throw new Error(`MONGODB_URI must target the explicitly named "${DEMO_DATABASE_NAME}" database.`);
  }
}

function demoMarkerCollection() {
  return mongoose.connection.collection('demoMetadata');
}

async function readDemoMarker() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Demo database must be connected before reading its marker.');
  }
  return demoMarkerCollection().findOne({ _id: DEMO_MARKER_ID });
}

async function assertStoredDemoMarker() {
  const marker = await readDemoMarker();
  if (!marker || marker.purpose !== 'synthetic-demo-only' || marker.databaseName !== DEMO_DATABASE_NAME) {
    throw new Error(`Database is not marked as the CareBridge demo database (${DEMO_DATABASE_NAME}).`);
  }
  return marker;
}

async function markDemoDatabase() {
  const collection = demoMarkerCollection();
  const marker = await collection.findOne({ _id: DEMO_MARKER_ID });
  if (marker && (marker.purpose !== 'synthetic-demo-only' || marker.databaseName !== DEMO_DATABASE_NAME)) {
    throw new Error('The target database already has a conflicting demo marker; refusing to seed.');
  }
  await collection.updateOne(
    { _id: DEMO_MARKER_ID },
    {
      $setOnInsert: {
        purpose: 'synthetic-demo-only',
        databaseName: DEMO_DATABASE_NAME,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

async function connectStrictDemoDatabase({ requireMarker = false } = {}) {
  assertDemoEnvironment();
  if (mongoose.connection.readyState !== 0) {
    throw new Error('Demo command expects a disconnected process; refusing to reuse an existing connection.');
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  if (mongoose.connection.name !== DEMO_DATABASE_NAME) {
    await mongoose.disconnect();
    throw new Error(`Connected database "${mongoose.connection.name}" does not match the demo database.`);
  }
  if (requireMarker) {
    try {
      await assertStoredDemoMarker();
    } catch (error) {
      await mongoose.disconnect();
      throw error;
    }
  } else {
    await markDemoDatabase();
  }
}

function getEvaluationSnapshot() {
  const files = [];
  const visit = entry => {
    if (!fs.existsSync(entry)) return;
    const stat = fs.statSync(entry);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(entry)) visit(path.join(entry, child));
    } else if (stat.isFile()) {
      const relativePath = path.relative(path.resolve(__dirname, '..', '..', '..'), entry);
      files.push([relativePath, crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex')]);
    }
  };
  EVALUATION_ROOTS.forEach(visit);
  return files.sort((left, right) => left[0].localeCompare(right[0]));
}

function credentialsOutputPath(credentialsPath = CREDENTIALS_PATH) {
  return credentialsPath;
}

async function cleanObsoleteRecordFiles(previousRefs, currentRefs) {
  const active = new Set(currentRefs);
  const recordsRoot = path.resolve(__dirname, '..', '..', 'storage', 'records');
  for (const ref of previousRefs) {
    if (active.has(ref) || !ref.startsWith('storage/records/')) continue;
    const filename = path.basename(ref);
    const target = path.resolve(recordsRoot, filename);
    if (path.dirname(target) !== recordsRoot) {
      throw new Error(`Refusing to remove record content outside protected storage: ${ref}`);
    }
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

function makeRecommendation(hospital, rank, score, extra = {}) {
  return {
    hospitalId: hospital._id,
    name: hospital.name,
    hospitalName: hospital.name,
    code: hospital.code,
    district: hospital.district,
    hospitalDistrict: hospital.district,
    rank,
    tier: hospital.tier,
    effectiveTier: hospital.tier,
    score,
    totalScore: score,
    scoreBreakdown: {
      capability: score * 0.5,
      distance: score * 0.2,
      capacity: score * 0.2,
      tier: score * 0.1,
    },
    distanceKm: rank * 8,
    distanceNotice: 'Straight-line distance estimate for synthetic demo data.',
    capacityState: extra.capacityState || 'unknown',
    capacityReportedState: extra.capacityState || 'unknown',
    capacityAgeMinutes: extra.capacityAgeMinutes ?? null,
    capacityAgeLabel: extra.capacityAgeLabel || 'Unknown, confirm by phone',
    isCapacityStale: extra.capacityState === 'stale',
    matchedCapabilities: extra.matchedCapabilities || [],
    flags: extra.flags || [],
    schemeParticipation: null,
    schemeMatched: false,
    explanation: 'Synthetic demonstration fixture; not an actual referral decision.',
  };
}

async function seedCapacityExamples(hospitals, admins) {
  const ordered = [...hospitals].sort((a, b) => a.code.localeCompare(b.code));
  const now = Date.now();
  const groups = [
    { state: 'fresh', items: ordered.slice(0, 10), ageMinutes: 15 },
    { state: 'almost-stale', items: ordered.slice(10, 20), ageMinutes: 110 },
    { state: 'stale', items: ordered.slice(20, 30), ageMinutes: 180 },
    { state: 'never-reported', items: ordered.slice(30, 40), ageMinutes: null },
  ];
  const adminByHospitalId = new Map(admins.map(admin => [String(admin.hospitalId), admin]));

  for (const group of groups) {
    for (const hospital of group.items) {
      if (group.state === 'never-reported') {
        await HospitalCapacity.deleteMany({ hospitalId: hospital._id, isSynthetic: true });
        continue;
      }
      const timestamp = new Date(now - group.ageMinutes * 60 * 1000);
      const capacity = await HospitalCapacity.findOne({ hospitalId: hospital._id, isSynthetic: true })
        .sort({ timestamp: -1 });
      if (!capacity) {
        throw new Error(`Expected seeded capacity snapshot for ${hospital.code}.`);
      }
      capacity.timestamp = timestamp;
      capacity.reportedAt = timestamp;
      capacity.stalenessThresholdMinutes = 120;
      await capacity.save();
      if (hospital.district === 'Salem') {
        const actor = adminByHospitalId.get(String(hospital._id));
        if (!actor) throw new Error(`Missing hospital admin for capacity update at ${hospital.code}.`);
        await recordAuditLog({
          actorId: actor?._id,
          actorRole: 'hospital_admin',
          action: 'UPDATE_CAPACITY',
          resourceType: 'HospitalCapacity',
          resourceId: capacity._id,
          hospitalId: hospital._id,
          accessGranted: true,
          justification: 'Synthetic demo capacity update recorded for the walkthrough.',
          meta: { demoSeed: true, freshnessState: group.state },
          strict: true,
        });
      }
    }
  }
  return groups.map(group => ({ state: group.state, count: group.items.length }));
}

async function seedHospitalReviewStates(hospitals) {
  const pending = hospitals.filter(hospital => hospital.verificationStatus === 'pending');
  const rejected = hospitals.filter(hospital => hospital.verificationStatus === 'rejected');
  if (pending.length < 4 || pending.length > 6 || rejected.length < 2) {
    throw new Error(`Base seed must provide 4-6 pending and at least 2 rejected hospitals; got ${pending.length} and ${rejected.length}.`);
  }
  for (const hospital of pending.slice(0, 2)) {
    hospital.consistencyWarnings = [{
      code: 'DEMO_MISSING_EVIDENCE',
      message: 'Synthetic demo warning: submitted evidence needs reviewer follow-up.',
      severity: 'medium',
      detectedAt: new Date(),
    }];
    await hospital.save();
  }
  for (const hospital of rejected.slice(0, 2)) {
    if (!hospital.rejectionReason) {
      hospital.rejectionReason = 'Synthetic demo example: submitted facility evidence did not match the simulated checklist.';
    }
    await hospital.save();
  }
  for (const hospital of rejected.slice(2)) {
    hospital.verificationStatus = 'verified';
    hospital.tierStatus = 'confirmed';
    hospital.verifiedAt = new Date();
    hospital.rejectionReason = undefined;
    await hospital.save();
  }
}

async function seedPractitionerExamples() {
  const pending = await Practitioner.find({
    isSynthetic: true,
    verificationStatus: 'pending_verification',
  }).sort({ practitionerId: 1 });
  const unlinkedActive = await Practitioner.find({
    isSynthetic: true,
    employmentStatus: 'active',
    verificationStatus: 'verified',
    userId: null,
  }).sort({ practitionerId: 1 });
  const onLeave = await Practitioner.exists({ isSynthetic: true, employmentStatus: 'on_leave' });
  if (!onLeave) {
    throw new Error('Base practitioner seed lacks pending, unlinked active, or on-leave examples.');
  }
  const pendingByHospital = new Map();
  for (const practitioner of pending) {
    const hospitalId = String(practitioner.hospitalId);
    if (!pendingByHospital.has(hospitalId)) pendingByHospital.set(hospitalId, practitioner);
  }
  const unlinkedByHospital = new Map();
  for (const practitioner of unlinkedActive) {
    const hospitalId = String(practitioner.hospitalId);
    if (!unlinkedByHospital.has(hospitalId)) unlinkedByHospital.set(hospitalId, practitioner);
  }
  const rejectedExamples = [...pendingByHospital.values()].slice(0, 3);
  const resignedExamples = [...unlinkedByHospital.values()].slice(0, 3);
  if (rejectedExamples.length < 3 || resignedExamples.length < 3) {
    throw new Error('Base practitioner seed must provide three distinct hospitals for rejected and resigned examples.');
  }
  for (const practitioner of rejectedExamples) {
    practitioner.verificationStatus = 'rejected';
    await practitioner.save();
  }
  for (const practitioner of resignedExamples) {
    practitioner.employmentStatus = 'resigned';
    await practitioner.save();
    await syncHospitalSpecialists(practitioner.hospitalId);
  }
}

async function seedReferralExamples(hospitals, patients, doctor, doctorHospital) {
  const verified = hospitals.filter(hospital => hospital.verificationStatus === 'verified');
  const tierPairs = [];
  for (const firstTier of verified.filter(hospital => hospital.tier === 'Tier 1')) {
    for (const secondTier of verified.filter(hospital => hospital.tier === 'Tier 2')) {
      const shared = firstTier.specialties.find(specialty => secondTier.specialties.includes(specialty));
      if (shared) tierPairs.push({ tier1: firstTier, tier2: secondTier, specialty: shared });
    }
  }
  const tierPair = tierPairs[0];
  const noCapacityGroup = [...hospitals]
    .sort((a, b) => a.code.localeCompare(b.code))
    .slice(30, 40);
  const noCapacity = noCapacityGroup.find(hospital =>
    hospital.verificationStatus === 'verified' &&
    hospital.specialties.includes(tierPair?.specialty)
  );
  if (!tierPair || !noCapacity) {
    throw new Error('Unable to find verified Tier 1, Tier 2, and no-capacity demo hospitals.');
  }
  const { tier1, tier2, specialty: sharedSpecialty } = tierPair;
  const capacityOrder = [...hospitals].sort((a, b) => a.code.localeCompare(b.code));
  const capacityProfile = hospital => {
    const index = capacityOrder.findIndex(item => item._id.equals(hospital._id));
    if (index < 10) return { capacityState: 'available', capacityReportedState: 'available', capacityAgeMinutes: 15, capacityAgeLabel: '15 min old' };
    if (index < 20) return { capacityState: 'available', capacityReportedState: 'available', capacityAgeMinutes: 110, capacityAgeLabel: '110 min old; almost stale' };
    if (index < 30) return { capacityState: 'unknown', capacityReportedState: 'available', capacityAgeMinutes: 180, capacityAgeLabel: '180 min old; stale', isCapacityStale: true };
    return { capacityState: 'unknown', capacityReportedState: 'unknown', capacityAgeMinutes: null, capacityAgeLabel: 'Never reported' };
  };
  const recommendation = (hospital, rank, score, extra = {}) =>
    makeRecommendation(hospital, rank, score, { ...capacityProfile(hospital), ...extra });

  const nearestHospital = [...hospitals].sort((a, b) =>
    haversineDistance(
      doctorHospital.location.latitude,
      doctorHospital.location.longitude,
      a.location.latitude,
      a.location.longitude
    ) - haversineDistance(
      doctorHospital.location.latitude,
      doctorHospital.location.longitude,
      b.location.latitude,
      b.location.longitude
    )
  )[0];
  const knownSpecialties = [...new Set(hospitals.flatMap(hospital => hospital.specialties))];
  let missingSpecialty = knownSpecialties.find(specialty => !nearestHospital.specialties.includes(specialty));
  let matchingHospital = missingSpecialty && verified.find(hospital =>
    hospital._id.toString() !== nearestHospital._id.toString() && hospital.specialties.includes(missingSpecialty));
  if (!missingSpecialty || !matchingHospital) {
    missingSpecialty = 'Medical Oncology';
    matchingHospital = verified.find(hospital =>
      hospital._id.toString() !== nearestHospital._id.toString());
  }

  const statusOrder = ['draft', 'reviewed', 'sent', 'accepted', 'declined', 'cancelled'];
  const records = [];
  for (let index = 0; index < 12; index++) {
    const patient = patients[index % patients.length];
    const status = statusOrder[Math.floor(index / 2)];
    const specialty = index === 4 ? missingSpecialty : sharedSpecialty;
    let rankedRecommendations = [
      recommendation(tier1, 1, 78, { matchedCapabilities: [specialty] }),
      recommendation(tier2, 2, 72, { matchedCapabilities: [specialty] }),
    ];
    let excludedHospitals = [];
    if (index === 4) {
      rankedRecommendations = [recommendation(matchingHospital, 1, 82, { matchedCapabilities: [specialty] })];
      excludedHospitals = [{
        hospitalId: nearestHospital._id.toString(),
        hospitalName: nearestHospital.name,
        reason: `The required specialty (${specialty}) is not listed for this hospital.`,
        filterCode: 'MISSING_SPECIALTY',
      }];
    }
    if (index === 5) {
      rankedRecommendations = [
        recommendation(noCapacity, 1, 87, {
          capacityState: 'unknown',
          capacityAgeLabel: 'Never reported',
          flags: ['capacity_unknown'],
          matchedCapabilities: [specialty],
        }),
        recommendation(tier1, 2, 78, { matchedCapabilities: [specialty] }),
      ];
    }
    if (index === 6) {
      rankedRecommendations = [
        recommendation(tier2, 1, 91, { matchedCapabilities: [specialty] }),
        recommendation(tier1, 2, 80, { matchedCapabilities: [specialty] }),
      ];
    }
    if (index === 10 || index === 11) {
      rankedRecommendations = [];
      excludedHospitals = [{
        hospitalId: tier1._id.toString(),
        hospitalName: tier1.name,
        reason: 'No synthetic hospital in this scenario lists the requested specialty.',
        filterCode: 'NO_SUITABLE_HOSPITAL',
      }];
    }

    const assessment = {
      assessedAt: new Date(),
      modelVersion: 'demo-fixture-v1',
      modelVersions: { triage: 'demo-fixture-v1' },
      modelArtifacts: [],
      triageScore: index === 1 ? null : 3,
      triageCategory: index === 1 ? 'insufficient_data' : index === 0 ? 'immediate' : 'urgent',
      flaggedConditions: index === 2 ? ['respiratory_distress', 'cardiac_risk'] : index === 0 ? ['red_flag_hypoxemia'] : [],
      topContributors: index === 0 ? ['low oxygen saturation', 'rapid respiratory rate'] : [],
      rawAssessment: {
        syntheticDemoFixture: true,
        inferenceExecuted: false,
        note: 'Static synthetic example only; no ML inference was run.',
        dataQualityWarning: index === 1 ? 'Insufficient intake data for a model assessment.' : null,
        redFlags: index === 0 ? ['SpO2 below the simulated threshold'] : [],
      },
    };
    const urgencyOverride = index === 3;
    const referral = new Referral({
      referralId: `DEMO-REF-2026-${String(index + 1).padStart(4, '0')}`,
      patientId: patient._id,
      patientName: patient.name,
      referringDoctorId: doctor._id,
      referringHospitalId: doctorHospital._id,
      patientSummary: {
        age: 40 + (index % 25),
        gender: index % 2 === 0 ? 'female' : 'male',
        chiefComplaint: index === 0 ? 'Breathing difficulty, synthetic red-flag example' : 'Synthetic demo referral',
        provisionalDiagnosis: specialty,
        triageSeverity: {
          score: index === 1 ? 0 : 3,
          category: index === 0 ? 'immediate' : index === 1 ? 'normal' : 'urgent',
          predictedBy: 'clinical_rule',
        },
      },
      requirements: {
        requiredSpecialty: index === 10 || index === 11 ? 'Cardiothoracic Surgery' : specialty,
        urgency: urgencyOverride ? 'urgent' : 'routine',
        requiredEquipment: [],
        requiredServices: [],
        patientCoordinates: {
          latitude: doctorHospital.location.latitude,
          longitude: doctorHospital.location.longitude,
          district: doctorHospital.district,
        },
        capacityMode: 'unknown_aware',
        modelSuggestedUrgency: urgencyOverride ? 'routine' : 'urgent',
        urgencyConfirmedByDoctor: true,
        urgencyOverrideReason: urgencyOverride ? 'Synthetic demo override: clinician review selected urgent follow-up.' : undefined,
      },
      mlAssessment: assessment,
      rankedRecommendations,
      candidates: rankedRecommendations,
      excludedHospitals,
      status,
      recordsConsentStatus: 'not_requested',
      doctorNotes: 'Synthetic demonstration record; not for real patient care.',
      isSynthetic: true,
    });
    await referral.save();
    records.push(referral);
    await recordAuditLog({
      actorId: doctor._id,
      actorRole: 'doctor',
      action: urgencyOverride ? 'OVERRIDE_MODEL_URGENCY' : 'CREATE_REFERRAL',
      resourceType: 'Referral',
      resourceId: referral.referralId,
      patientId: patient._id,
      hospitalId: doctorHospital._id,
      accessGranted: true,
      justification: urgencyOverride
        ? 'Synthetic demo urgency override with an explicit reason.'
        : 'Synthetic demo referral scenario created.',
      meta: { demoSeed: true, fixtureIndex: index + 1 },
      strict: true,
    });
    if (index < 4) {
      await recordAuditLog({
        actorId: doctor._id,
        actorRole: 'doctor',
        action: 'ASSESS_TRIAGE_SEVERITY',
        resourceType: 'ClinicalDecisionSupport',
        resourceId: referral.referralId,
        patientId: patient._id,
        hospitalId: doctorHospital._id,
        accessGranted: true,
        justification: 'Synthetic demo assessment fixture recorded; no ML inference was run.',
        meta: { modelVersion: assessment.modelVersion, inferenceExecuted: false },
        strict: true,
      });
    }
  }
  return { records, nearestHospital, noCapacity };
}

async function seedConsentExamples(patients, doctor, hospital, referral, records) {
  const consentIds = [];
  const targetPatient = patients.find(patient =>
    records.some(record => String(record.patientId) === String(patient._id) && record.sensitivityLevel === 'sensitive')
  ) || patients[0];
  const cases = [
    { state: 'requested', patient: targetPatient },
    { state: 'requested', patient: patients[1] },
    { state: 'granted', patient: targetPatient },
    { state: 'granted', patient: patients[2] },
    { state: 'narrowed', patient: targetPatient, narrow: true },
    { state: 'narrowed', patient: patients[3], narrow: true },
    { state: 'denied', patient: patients[4] },
    { state: 'denied', patient: patients[5] },
    { state: 'expired', patient: patients[6] },
    { state: 'expired', patient: patients[7] },
    { state: 'revoked', patient: patients[8] },
    { state: 'revoked', patient: patients[9] },
  ];
  for (const [index, item] of cases.entries()) {
    const consent = await requestConsent({
      patientId: item.patient._id,
      requestingDoctorId: doctor._id,
      requestingHospitalId: hospital._id,
      referralId: referral?._id || null,
      purpose: 'referral',
      recordTypes: ['lab_report', 'prescription'],
      durationDays: 30,
      includeSensitiveRecords: false,
      actorRole: 'doctor',
    });
    consent.isSynthetic = true;
    await consent.save();
    consentIds.push(consent.consentId);
    if (item.state === 'granted' || item.state === 'narrowed' || item.state === 'revoked') {
      await grantConsent({
        consentId: consent.consentId,
        patientId: item.patient._id,
        narrowedRecordTypes: item.narrow ? ['lab_report'] : null,
        includeSensitiveRecords: false,
      });
      if (item.state === 'revoked') {
        await revokeConsent({
          consentId: consent.consentId,
          patientId: item.patient._id,
          reason: 'Synthetic demo patient action: access revoked.',
        });
      }
    } else if (item.state === 'denied') {
      await denyConsent({
        consentId: consent.consentId,
        patientId: item.patient._id,
        reason: 'Synthetic demo patient action: consent declined.',
      });
    } else if (item.state === 'expired') {
      await Consent.updateOne(
        { consentId: consent.consentId },
        { $set: { expiresAt: new Date(Date.now() - 60_000) } }
      );
    }
    console.log(`Created demo consent ${index + 1}/12 (${item.state}).`);
  }

  await expireOldConsents();
  const expiredConsents = await Consent.find({ consentId: { $in: consentIds }, status: 'expired' });
  for (const consent of expiredConsents) {
    await recordAuditLog({
      actorRole: 'system',
      action: 'EXPIRE_CONSENT',
      resourceType: 'Consent',
      resourceId: consent.consentId,
      patientId: consent.patientId,
      hospitalId: consent.requestingHospitalId,
      accessGranted: false,
      justification: 'System expiry action for an expired synthetic demo consent.',
      meta: { demoSeed: true },
      strict: true,
    });
  }
  return { targetPatient, consentIds };
}

async function seedSecondaryExamples(hospitals, reviewer) {
  const schemes = await Scheme.find({ isSynthetic: false }).sort({ schemeId: 1 });
  if (schemes.length < 2 || schemes.length > 3) {
    throw new Error(`Expected 2-3 official-source scheme entries; found ${schemes.length}.`);
  }
  const outdatedScheme = schemes[schemes.length - 1];
  outdatedScheme.status = 'outdated';
  outdatedScheme.lastVerifiedDate = new Date('2020-01-01T00:00:00.000Z');
  outdatedScheme.notice = 'Possible match only. TO VERIFY: source details and current terms before any real-world use.';
  await outdatedScheme.save();
  await recordAuditLog({
    actorId: reviewer._id,
    actorRole: 'platform_reviewer',
    action: 'FLAG_OUTDATED_SCHEME',
    resourceType: 'Scheme',
    resourceId: outdatedScheme.schemeId,
    accessGranted: true,
    justification: 'Synthetic demo reviewer action: mark an old verification date for follow-up.',
    meta: { demoSeed: true },
    strict: true,
  });

  const maps = await ConditionSpecialtyMap.find({}).sort({ condition_id: 1 });
  const reviewedMap = maps.find(entry => entry.status === 'REVIEWED_ACCEPTED');
  if (!reviewedMap) throw new Error('Condition-specialty sheet has no reviewed example.');
  reviewedMap.reviewed_by = reviewer._id;
  reviewedMap.last_reviewed = new Date();
  await reviewedMap.save();
  await recordAuditLog({
    actorId: reviewer._id,
    actorRole: 'platform_reviewer',
    action: 'REVIEW_SPECIALTY_MAP',
    resourceType: 'ConditionSpecialtyMap',
    resourceId: reviewedMap.condition_id,
    accessGranted: true,
    justification: 'Synthetic demo reviewer action recorded on a reviewed mapping row.',
    meta: { demoSeed: true },
    strict: true,
  });
}

async function seedDemoData({ credentialsPath = CREDENTIALS_PATH, force = false } = {}) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Synthetic demo data is disabled in production.');
  }
  const marker = await readDemoMarker();
  if (!marker || marker.purpose !== 'synthetic-demo-only' || marker.databaseName !== DEMO_DATABASE_NAME) {
    throw new Error('Seed only runs against a database with the CareBridge demo marker.');
  }
  if (!force && marker.seedVersion === DEMO_SEED_VERSION && marker.seedComplete === true) {
    return { skipped: true, message: 'Demo fixture version is already seeded.' };
  }

  const previousRecordRefs = await PatientRecord.find({ isSynthetic: true }).distinct('contentRef');
  const evaluationBefore = getEvaluationSnapshot();
  const result = await runSeed({
    exportEvaluationData: false,
    seedSampleReferrals: false,
    disconnect: false,
    throwOnError: true,
    credentialsPath: credentialsOutputPath(credentialsPath),
  });
  const hospitals = await Hospital.find({ isSynthetic: true }).sort({ code: 1 });
  if (hospitals.length !== 40) {
    throw new Error(`Expected 40 synthetic hospitals after base seed; found ${hospitals.length}.`);
  }
  await seedHospitalReviewStates(hospitals);
  const admins = await User.find({ role: 'hospital_admin', isSynthetic: true });
  const doctor = await User.findOne({ email: 'doctor@carebridge.invalid', role: 'doctor', isSynthetic: true });
  const doctorHospital = doctor && await Hospital.findById(doctor.hospitalId);
  const reviewer = await User.findOne({ email: 'reviewer@carebridge.invalid', role: 'platform_reviewer', isSynthetic: true });
  const patients = await User.find({ role: 'patient', isSynthetic: true }).sort({ email: 1 });
  if (!doctor || !doctorHospital || !reviewer || patients.length < 10 || patients.length > 15) {
    throw new Error('Base seed is missing a demo doctor, reviewer, hospital, or 10-15 linked patient accounts.');
  }

  const capacitySummary = await seedCapacityExamples(hospitals, admins);
  await seedPractitionerExamples();
  const seededReferrals = await seedReferralExamples(hospitals, patients, doctor, doctorHospital);
  const patientRecords = await PatientRecord.find({ isSynthetic: true }).select('patientId sensitivityLevel');
  const consents = await seedConsentExamples(
    patients,
    doctor,
    doctorHospital,
    seededReferrals.records[0],
    patientRecords
  );
  await seedSecondaryExamples(hospitals, reviewer);

  const currentRecordRefs = await PatientRecord.find({ isSynthetic: true }).distinct('contentRef');
  await cleanObsoleteRecordFiles(previousRecordRefs, currentRecordRefs);
  const evaluationAfter = getEvaluationSnapshot();
  if (JSON.stringify(evaluationBefore) !== JSON.stringify(evaluationAfter)) {
    throw new Error('Demo seeding modified evaluation artifacts; stopping before marking the seed complete.');
  }

  await demoMarkerCollection().updateOne(
    { _id: DEMO_MARKER_ID },
    { $set: { seedVersion: DEMO_SEED_VERSION, seedComplete: true, seededAt: new Date() } }
  );
  return {
    skipped: false,
    hospitals: result.hospitals.length,
    patients: patients.length,
    referrals: seededReferrals.records.length,
    consents: consents.consentIds.length,
    capacitySummary,
  };
}

async function collectDemoReport() {
  const hospitals = await Hospital.find({ isSynthetic: true }).lean();
  const capacities = await HospitalCapacity.find({ isSynthetic: true }).lean();
  const practitioners = await Practitioner.find({ isSynthetic: true }).lean();
  const patients = await User.countDocuments({ role: 'patient', isSynthetic: true });
  const doctorUsers = await User.find({ role: 'doctor', isSynthetic: true }).select('_id hospitalId').lean();
  const doctorById = new Map(doctorUsers.map(user => [String(user._id), user]));
  const validDoctorLinkCounts = new Map();
  let invalidDoctorLinks = 0;
  for (const practitioner of practitioners) {
    if (!practitioner.userId) continue;
    const linkedUser = doctorById.get(String(practitioner.userId));
    if (!linkedUser || String(linkedUser.hospitalId) !== String(practitioner.hospitalId)) {
      invalidDoctorLinks++;
      continue;
    }
    if (practitioner.employmentStatus === 'active' && practitioner.verificationStatus === 'verified') {
      const hospitalId = String(practitioner.hospitalId);
      validDoctorLinkCounts.set(hospitalId, (validDoctorLinkCounts.get(hospitalId) || 0) + 1);
    }
  }
  const admins = await User.find({ role: 'hospital_admin', isSynthetic: true }).select('hospitalId').lean();
  const referrals = await Referral.find({ isSynthetic: true }).lean();
  const consents = await Consent.find({ isSynthetic: true }).lean();
  const records = await PatientRecord.find({ isSynthetic: true }).lean();
  const schemes = await Scheme.find({ isSynthetic: false }).lean();
  const conditionMaps = await ConditionSpecialtyMap.find({}).lean();
  const auditCount = await mongoose.connection.collection('auditlogs').countDocuments({});
  const now = Date.now();
  const latestCapacityByHospital = new Map();
  for (const capacity of capacities) {
    const key = String(capacity.hospitalId);
    const current = latestCapacityByHospital.get(key);
    if (!current || new Date(capacity.timestamp) > new Date(current.timestamp)) {
      latestCapacityByHospital.set(key, capacity);
    }
  }
  const capacityStates = { fresh: 0, 'almost-stale': 0, stale: 0, 'never-reported': 0 };
  for (const hospital of hospitals) {
    const latest = latestCapacityByHospital.get(String(hospital._id));
    if (!latest) {
      capacityStates['never-reported']++;
      continue;
    }
    const ageMinutes = (now - new Date(latest.timestamp).getTime()) / 60000;
    if (ageMinutes <= 60) capacityStates.fresh++;
    else if (ageMinutes <= latest.stalenessThresholdMinutes) capacityStates['almost-stale']++;
    else capacityStates.stale++;
  }
  const statusCounts = items => items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
  const practitionerCounts = practitioners.reduce((counts, item) => {
    const key = `${item.verificationStatus}/${item.employmentStatus}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const narrowedCount = consents.filter(consent =>
    consent.decisionHistory.some(event => event.status === 'narrowed')
  ).length;
  const patientsWithSensitiveRecords = new Set(records
    .filter(record => record.sensitivityLevel === 'sensitive')
    .map(record => String(record.patientId)));
  const report = {
    hospitals: {
      total: hospitals.length,
      verification: hospitals.reduce((counts, hospital) => {
        counts[hospital.verificationStatus] = (counts[hospital.verificationStatus] || 0) + 1;
        return counts;
      }, {}),
      withWarnings: hospitals.filter(hospital => hospital.consistencyWarnings?.length).length,
      capacity: capacityStates,
      adminLinkedHospitals: new Set(admins.map(admin => String(admin.hospitalId))).size,
      doctorLinkedHospitals: validDoctorLinkCounts.size,
      minimumLinkedActiveVerifiedDoctors: hospitals.length
        ? Math.min(...hospitals.map(hospital => validDoctorLinkCounts.get(String(hospital._id)) || 0))
        : 0,
      invalidDoctorLinks,
    },
    practitioners: { total: practitioners.length, states: practitionerCounts },
    patients: { total: patients },
    referrals: { total: referrals.length, states: statusCounts(referrals) },
    assessments: {
      total: referrals.filter(referral => referral.mlAssessment?.modelVersion).length,
      modelVersions: [...new Set(referrals.map(referral => referral.mlAssessment?.modelVersion).filter(Boolean))],
      withRedFlags: referrals.filter(referral => referral.mlAssessment?.flaggedConditions?.length).length,
      insufficientData: referrals.filter(referral => referral.mlAssessment?.triageCategory === 'insufficient_data').length,
      multipleConditions: referrals.filter(referral => referral.mlAssessment?.flaggedConditions?.length > 1).length,
      urgencyOverrides: referrals.filter(referral => referral.requirements?.urgencyOverrideReason).length,
      unknownCapacityRecommendation: referrals.some(referral =>
        referral.rankedRecommendations.some(item => item.capacityState === 'unknown' && item.capacityAgeLabel === 'Never reported')
      ),
      tier2OutranksTier1: referrals.some(referral => {
        const [first, second] = referral.rankedRecommendations;
        return first?.tier === 'Tier 2' && second?.tier === 'Tier 1' && first.score > second.score;
      }),
      nearestMissingSpecialty: referrals.some(referral =>
        referral.excludedHospitals.some(item => item.filterCode === 'MISSING_SPECIALTY')
      ),
      noSuitableHospital: referrals.filter(referral =>
        referral.excludedHospitals.some(item => item.filterCode === 'NO_SUITABLE_HOSPITAL') &&
        referral.rankedRecommendations.length === 0
      ).length,
    },
    consents: {
      total: consents.length,
      states: statusCounts(consents),
      narrowed: narrowedCount,
      sensitiveRecordsWithExcludedConsents: [...patientsWithSensitiveRecords].some(patientId =>
        consents.some(consent => String(consent.patientId) === patientId && !consent.includeSensitiveRecords)
      ),
    },
    records: {
      total: records.length,
      types: records.reduce((counts, record) => {
        counts[record.type] = (counts[record.type] || 0) + 1;
        return counts;
      }, {}),
      olderThan12Months: records.filter(record => now - new Date(record.recordDate).getTime() > 365 * 24 * 60 * 60 * 1000).length,
      sensitivity: records.reduce((counts, record) => {
        counts[record.sensitivityLevel] = (counts[record.sensitivityLevel] || 0) + 1;
        return counts;
      }, {}),
    },
    schemes: { total: schemes.length, states: statusCounts(schemes) },
    conditionSpecialty: { total: conditionMaps.length, states: statusCounts(conditionMaps) },
    audit: { total: auditCount },
  };
  return report;
}

function validateDemoReport(report) {
  const errors = [];
  const requireAtLeast = (value, expected, description) => {
    if (value < expected) errors.push(`${description}: expected at least ${expected}, got ${value}.`);
  };
  if (report.hospitals.total !== 40) errors.push(`Expected 40 synthetic hospitals, got ${report.hospitals.total}.`);
  if (report.hospitals.adminLinkedHospitals !== 40) errors.push(`Expected an admin linked to all 40 hospitals, got ${report.hospitals.adminLinkedHospitals}.`);
  const pendingHospitals = report.hospitals.verification.pending || 0;
  if (pendingHospitals < 4 || pendingHospitals > 6) errors.push(`Expected 4-6 pending hospitals, got ${pendingHospitals}.`);
  requireAtLeast(report.hospitals.verification.rejected || 0, 2, 'Rejected hospitals');
  requireAtLeast(report.hospitals.withWarnings, 2, 'Hospitals with consistency warnings');
  for (const state of Object.keys(report.hospitals.capacity)) requireAtLeast(report.hospitals.capacity[state], 3, `${state} capacity hospitals`);
  requireAtLeast(report.practitioners.states['verified/active'] || 0, 3, 'Active verified practitioners');
  requireAtLeast(report.practitioners.states['pending_verification/active'] || 0, 3, 'Pending practitioners');
  requireAtLeast(report.practitioners.states['rejected/active'] || 0, 3, 'Rejected practitioners');
  requireAtLeast(report.practitioners.states['verified/on_leave'] || 0, 3, 'On-leave practitioners');
  requireAtLeast(report.practitioners.states['verified/resigned'] || 0, 3, 'Resigned practitioners');
  requireAtLeast(report.hospitals.doctorLinkedHospitals, 40, 'Hospitals with linked verified doctors');
  requireAtLeast(report.hospitals.minimumLinkedActiveVerifiedDoctors, 2, 'Minimum active verified doctor accounts per hospital');
  if (report.hospitals.invalidDoctorLinks) errors.push(`${report.hospitals.invalidDoctorLinks} doctor/practitioner hospital links are inconsistent.`);
  if (report.patients.total < 10 || report.patients.total > 15) errors.push(`Expected 10-15 patient accounts, got ${report.patients.total}.`);
  if (report.referrals.total < 12) errors.push('Expected at least 12 referral examples.');
  for (const status of ['draft', 'reviewed', 'sent', 'accepted', 'declined', 'cancelled']) {
    requireAtLeast(report.referrals.states[status] || 0, 2, `${status} referrals`);
  }
  requireAtLeast(report.assessments.total, 12, 'Assessments with a model version');
  requireAtLeast(report.assessments.withRedFlags, 1, 'Red-flag assessments');
  requireAtLeast(report.assessments.insufficientData, 1, 'Insufficient-data assessments');
  requireAtLeast(report.assessments.multipleConditions, 1, 'Multi-condition assessments');
  requireAtLeast(report.assessments.urgencyOverrides, 1, 'Urgency override assessments');
  if (!report.assessments.unknownCapacityRecommendation) errors.push('Expected a ranked referral with unknown capacity.');
  if (!report.assessments.tier2OutranksTier1) errors.push('Expected a Tier 2 hospital to outrank a Tier 1 hospital.');
  if (!report.assessments.nearestMissingSpecialty) errors.push('Expected an excluded nearest hospital missing the requested specialty.');
  requireAtLeast(report.assessments.noSuitableHospital, 1, 'No-suitable-hospital referral examples');
  for (const status of ['requested', 'granted', 'denied', 'expired', 'revoked']) {
    requireAtLeast(report.consents.states[status] || 0, 2, `${status} consents`);
  }
  requireAtLeast(report.consents.narrowed, 2, 'Narrowed-scope consents');
  if (!report.consents.sensitiveRecordsWithExcludedConsents) errors.push('Expected a sensitive record excluded by a consent scope.');
  requireAtLeast(report.records.total, 1, 'Patient records');
  requireAtLeast(report.records.olderThan12Months, 1, 'Records older than 12 months');
  requireAtLeast(Object.keys(report.records.types).length, 3, 'Distinct patient record types');
  if (report.records.sensitivity.sensitive < 1) errors.push('Expected at least one sensitive patient record.');
  if (report.schemes.total < 2 || report.schemes.total > 3) errors.push(`Expected 2-3 scheme records, got ${report.schemes.total}.`);
  requireAtLeast(report.schemes.states.verified || 0, 1, 'Verified schemes');
  requireAtLeast(report.schemes.states.outdated || 0, 1, 'Outdated schemes');
  requireAtLeast(report.conditionSpecialty.states['PENDING CLINICIAN REVIEW'] || 0, 1, 'Pending condition-specialty rows');
  requireAtLeast(report.conditionSpecialty.states.REVIEWED_ACCEPTED || 0, 1, 'Reviewed condition-specialty rows');
  requireAtLeast(report.audit.total, 1, 'Generated audit entries');
  return errors;
}

function printDemoReport(report) {
  const rows = [
    ['Hospitals', report.hospitals.total, `${JSON.stringify(report.hospitals.verification)}; admins linked ${report.hospitals.adminLinkedHospitals}; hospitals with 2+ linked doctors ${report.hospitals.doctorLinkedHospitals}; invalid doctor links ${report.hospitals.invalidDoctorLinks}`],
    ['Capacity', Object.values(report.hospitals.capacity).reduce((sum, count) => sum + count, 0), JSON.stringify(report.hospitals.capacity)],
    ['Practitioners', report.practitioners.total, JSON.stringify(report.practitioners.states)],
    ['Patients', report.patients.total, 'linked synthetic login accounts'],
    ['Referrals', report.referrals.total, JSON.stringify(report.referrals.states)],
    ['Assessments', report.assessments.total, `red flags ${report.assessments.withRedFlags}; insufficient ${report.assessments.insufficientData}; multi-condition ${report.assessments.multipleConditions}; overrides ${report.assessments.urgencyOverrides}`],
    ['Consents', report.consents.total, `${JSON.stringify(report.consents.states)}; narrowed ${report.consents.narrowed}`],
    ['Records', report.records.total, `${JSON.stringify(report.records.types)}; old >12m ${report.records.olderThan12Months}; sensitive ${report.records.sensitivity.sensitive || 0}`],
    ['Schemes', report.schemes.total, JSON.stringify(report.schemes.states)],
    ['Condition-specialty', report.conditionSpecialty.total, JSON.stringify(report.conditionSpecialty.states)],
    ['Audit logs', report.audit.total, 'generated by seeded actions'],
  ];
  console.log('\n| Collection | Count | State/examples |');
  console.log('|---|---:|---|');
  rows.forEach(row => console.log(`| ${row[0]} | ${row[1]} | ${row[2]} |`));
}

async function runDemoCheck() {
  await assertStoredDemoMarker();
  const report = await collectDemoReport();
  printDemoReport(report);
  const errors = validateDemoReport(report);
  if (errors.length) {
    throw new Error(`Demo data check failed:\n- ${errors.join('\n- ')}`);
  }
  console.log('\nDemo data check passed.');
  return report;
}

module.exports = {
  DEMO_DATABASE_NAME,
  DEMO_MARKER_ID,
  assertDemoEnvironment,
  assertStoredDemoMarker,
  connectStrictDemoDatabase,
  collectDemoReport,
  getEvaluationSnapshot,
  markDemoDatabase,
  printDemoReport,
  runDemoCheck,
  seedDemoData,
  validateDemoReport,
};
