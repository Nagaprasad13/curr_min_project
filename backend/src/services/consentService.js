const { v4: uuidv4 } = require('uuid');
const Consent = require('../models/Consent');
const PatientRecord = require('../models/PatientRecord');
const AuditLog = require('../models/AuditLog');
const { recordAuditLog } = require('./auditService');
const consentConfig = require('../config/consentConfig.json');

/**
 * Calculates human-readable age and clinical age warning flag for a record.
 * @param {Date} recordDate
 * @returns {{ ageMonths: number, ageDays: number, ageWarning: string|null, isOldRecord: boolean }}
 */
function computeRecordAgeInfo(recordDate) {
  const now = new Date();
  const rDate = new Date(recordDate);
  const diffMs = Math.max(0, now.getTime() - rDate.getTime());
  const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const ageMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.4375));

  const isOldRecord = ageMonths >= consentConfig.recordAgeWarningMonths;
  const ageWarning = isOldRecord
    ? `This result is ${ageMonths} months old; check clinical relevance.`
    : null;

  return {
    ageMonths,
    ageDays,
    ageWarning,
    isOldRecord,
  };
}

/**
 * Creates a new consent request initiated by a doctor for their hospital.
 */
async function requestConsent({
  patientId,
  requestingDoctorId,
  requestingHospitalId,
  purpose = 'referral',
  recordTypes = [],
  fromDate = null,
  toDate = null,
  durationDays = consentConfig.defaultExpiryDays,
  includeSensitiveRecords = false,
  referralId = null,
  actorRole = 'doctor',
  ipAddress = '127.0.0.1',
  userAgent = '',
}) {
  const enforcedDurationDays = Math.min(
    Math.max(1, Number(durationDays) || consentConfig.defaultExpiryDays),
    consentConfig.maxExpiryDays
  );

  const expiresAt = new Date(Date.now() + enforcedDurationDays * 24 * 60 * 60 * 1000);
  const consentId = `CNS-${uuidv4()}`;

  const consent = new Consent({
    consentId,
    patientId,
    requestingHospitalId,
    toHospitalId: requestingHospitalId,
    requestingDoctorId,
    referralId,
    purpose,
    recordTypes,
    scope: recordTypes,
    dateRange: {
      fromDate: fromDate ? new Date(fromDate) : null,
      toDate: toDate ? new Date(toDate) : null,
    },
    status: 'requested',
    includeSensitiveRecords: Boolean(includeSensitiveRecords),
    expiresAt,
    decisionHistory: [{
      status: 'requested',
      changedBy: requestingDoctorId,
      changedAt: new Date(),
      reason: `Consent requested for purpose: ${purpose}`,
      consentTextVersion: consentConfig.consentTextVersion,
    }],
    consentTextVersion: consentConfig.consentTextVersion,
  });

  const savedConsent = await consent.save();

  await recordAuditLog({
    actorId: requestingDoctorId,
    actorRole,
    action: 'REQUEST_CONSENT',
    resourceType: 'Consent',
    resourceId: savedConsent.consentId,
    patientId,
    hospitalId: requestingHospitalId,
    accessGranted: true,
    justification: `Doctor requested record access for purpose: ${purpose}`,
    ipAddress,
    userAgent,
    meta: {
      requestedTypes: recordTypes,
      expiresAt: savedConsent.expiresAt,
      includeSensitive: Boolean(includeSensitiveRecords),
    },
  });

  return savedConsent;
}

/**
 * Grants a consent request by patient action.
 * Allows patient to optionally narrow record types or shorten duration.
 */
async function grantConsent({
  consentId,
  patientId,
  narrowedRecordTypes = null,
  shortenedExpiryDays = null,
  includeSensitiveRecords = null,
  ipAddress = '127.0.0.1',
  userAgent = '',
}) {
  const consent = await Consent.findOne({ consentId, patientId });
  if (!consent) {
    throw new Error('Consent request not found or patient unauthorized.');
  }

  if (consent.status !== 'requested') {
    throw new Error(`Cannot grant consent currently in state: ${consent.status}`);
  }

  if (new Date(consent.expiresAt) <= new Date()) {
    consent.status = 'expired';
    await consent.save();
    throw new Error('Consent request has expired and cannot be granted.');
  }

  // Allow patient to narrow record types (must be subset of requested)
  if (Array.isArray(narrowedRecordTypes) && narrowedRecordTypes.length > 0) {
    const validNarrowed = narrowedRecordTypes.filter(rt => consent.recordTypes.includes(rt));
    if (validNarrowed.length === 0) {
      throw new Error('Narrowed record types must include at least one originally requested type.');
    }
    consent.recordTypes = validNarrowed;
    consent.scope = validNarrowed;
  }

  // Allow patient to shorten expiry, but never extend beyond requested
  if (shortenedExpiryDays) {
    const shortenedMs = Number(shortenedExpiryDays) * 24 * 60 * 60 * 1000;
    const requestedRemainingMs = new Date(consent.expiresAt).getTime() - Date.now();
    if (shortenedMs > 0 && shortenedMs < requestedRemainingMs) {
      consent.expiresAt = new Date(Date.now() + shortenedMs);
    }
  }

  // Patient can explicitly allow or disallow sensitive records
  if (includeSensitiveRecords !== null) {
    consent.includeSensitiveRecords = Boolean(includeSensitiveRecords);
  }

  consent.status = 'granted';
  consent.grantedAt = new Date();
  consent.decisionHistory.push({
    status: 'granted',
    changedBy: patientId,
    changedAt: new Date(),
    reason: 'Explicit patient authorization granted via patient portal',
    consentTextVersion: consent.consentTextVersion,
  });

  const updatedConsent = await consent.save();

  await recordAuditLog({
    actorId: patientId,
    actorRole: 'patient',
    action: 'GRANT_CONSENT',
    resourceType: 'Consent',
    resourceId: updatedConsent.consentId,
    patientId,
    hospitalId: updatedConsent.requestingHospitalId,
    accessGranted: true,
    justification: 'Patient explicitly granted consent with designated scope',
    ipAddress,
    userAgent,
    meta: {
      grantedTypes: updatedConsent.recordTypes,
      expiresAt: updatedConsent.expiresAt,
      includeSensitive: updatedConsent.includeSensitiveRecords,
      consentTextVersion: updatedConsent.consentTextVersion,
    },
  });

  return updatedConsent;
}

/**
 * Denies a consent request by patient action.
 */
async function denyConsent({
  consentId,
  patientId,
  reason = 'Patient declined to share records',
  ipAddress = '127.0.0.1',
  userAgent = '',
}) {
  const consent = await Consent.findOne({ consentId, patientId });
  if (!consent) {
    throw new Error('Consent request not found or patient unauthorized.');
  }

  if (consent.status !== 'requested') {
    throw new Error(`Cannot deny consent currently in state: ${consent.status}`);
  }

  consent.status = 'denied';
  consent.decisionHistory.push({
    status: 'denied',
    changedBy: patientId,
    changedAt: new Date(),
    reason,
    consentTextVersion: consent.consentTextVersion,
  });

  const updatedConsent = await consent.save();

  await recordAuditLog({
    actorId: patientId,
    actorRole: 'patient',
    action: 'DENY_CONSENT',
    resourceType: 'Consent',
    resourceId: updatedConsent.consentId,
    patientId,
    hospitalId: updatedConsent.requestingHospitalId,
    accessGranted: false,
    justification: reason,
    ipAddress,
    userAgent,
  });

  return updatedConsent;
}

/**
 * Revokes an active consent by patient action. Takes effect IMMEDIATELY.
 */
async function revokeConsent({
  consentId,
  patientId,
  reason = 'Revoked by patient',
  ipAddress = '127.0.0.1',
  userAgent = '',
}) {
  const consent = await Consent.findOne({ consentId, patientId });
  if (!consent) {
    throw new Error('Consent not found or patient unauthorized.');
  }

  if (consent.status !== 'granted') {
    throw new Error(`Only granted consents can be revoked. Current status: ${consent.status}`);
  }

  consent.status = 'revoked';
  consent.revokedAt = new Date();
  consent.revokedBy = patientId;
  consent.decisionHistory.push({
    status: 'revoked',
    changedBy: patientId,
    changedAt: new Date(),
    reason,
    consentTextVersion: consent.consentTextVersion,
  });

  const updatedConsent = await consent.save();

  await recordAuditLog({
    actorId: patientId,
    actorRole: 'patient',
    action: 'REVOKE_CONSENT',
    resourceType: 'Consent',
    resourceId: updatedConsent.consentId,
    patientId,
    hospitalId: updatedConsent.requestingHospitalId,
    accessGranted: false,
    justification: reason,
    ipAddress,
    userAgent,
  });

  return updatedConsent;
}

/**
 * Verifies active consent for a requesting doctor and patient server-side on EVERY fetch.
 * Returns the matching active consent document or null.
 */
async function verifyActiveConsent({
  patientId,
  doctorUser,
}) {
  if (!doctorUser || doctorUser.role !== 'doctor' || !doctorUser.hospitalId) {
    return null;
  }

  const now = new Date();

  // Find granted, unexpired, unrevoked consent for this doctor's hospital
  const consent = await Consent.findOne({
    patientId,
    requestingHospitalId: doctorUser.hospitalId,
    status: 'granted',
    expiresAt: { $gt: now },
    revokedAt: null,
  }).sort({ createdAt: -1 });

  return consent;
}

/**
 * Evaluates and marks expired consents in database.
 */
async function expireOldConsents() {
  const now = new Date();
  const expired = await Consent.updateMany(
    {
      status: { $in: ['requested', 'granted'] },
      expiresAt: { $lte: now },
    },
    {
      $set: { status: 'expired' },
      $push: {
        decisionHistory: {
          status: 'expired',
          changedAt: now,
          reason: 'System automated expiry based on configured time limit',
          consentTextVersion: consentConfig.consentTextVersion,
        },
      },
    }
  );
  return expired;
}

/**
 * Retrieves records for a patient filtered strictly by active consent permissions.
 * Never trusts request parameters or client-side caching.
 */
async function getConsentedPatientRecords({
  patientId,
  doctorUser,
  ipAddress = '127.0.0.1',
  userAgent = '',
}) {
  const consent = await verifyActiveConsent({ patientId, doctorUser });

  if (!consent) {
    // Audit denied access attempt
    await recordAuditLog({
      actorId: doctorUser._id,
      actorRole: doctorUser.role,
      action: 'DENIED_RECORD_ACCESS',
      resourceType: 'PatientRecord',
      resourceId: `PAT-${patientId}`,
      patientId,
      hospitalId: doctorUser.hospitalId,
      accessGranted: false,
      justification: 'No active, unexpired, granted consent found for requesting hospital',
      ipAddress,
      userAgent,
    });
    return { records: [], consent: null, accessGranted: false };
  }

  // Construct query respecting consent scope
  const allowedTypes = consent.recordTypes || [];
  const query = {
    patientId,
    type: { $in: allowedTypes },
  };

  // Exclude sensitive records unless explicitly permitted
  if (!consent.includeSensitiveRecords) {
    query.sensitivityLevel = 'normal';
  }

  // Date range filtering
  if (consent.dateRange && (consent.dateRange.fromDate || consent.dateRange.toDate)) {
    query.recordDate = {};
    if (consent.dateRange.fromDate) {
      query.recordDate.$gte = new Date(consent.dateRange.fromDate);
    }
    if (consent.dateRange.toDate) {
      query.recordDate.$lte = new Date(consent.dateRange.toDate);
    }
  }

  const rawRecords = await PatientRecord.find(query)
    .populate('sourceHospitalId', 'name district code tier')
    .sort({ recordDate: -1 });

  // Format with provenance, age computation, and warning flags
  const formattedRecords = rawRecords.map(rec => {
    const ageInfo = computeRecordAgeInfo(rec.recordDate);
    return {
      recordId: rec.recordId,
      patientId: rec.patientId,
      sourceHospital: {
        id: rec.sourceHospitalId ? rec.sourceHospitalId._id : null,
        name: rec.sourceHospitalId ? rec.sourceHospitalId.name : rec.provenance.facilityName,
        district: rec.sourceHospitalId ? rec.sourceHospitalId.district : rec.provenance.facilityDistrict,
        code: rec.sourceHospitalId ? rec.sourceHospitalId.code : 'UNKNOWN',
      },
      type: rec.type,
      title: rec.title,
      recordDate: rec.recordDate,
      createdAt: rec.createdAt,
      ageMonths: ageInfo.ageMonths,
      ageDays: ageInfo.ageDays,
      ageWarning: ageInfo.ageWarning,
      isOldRecord: ageInfo.isOldRecord,
      sensitivityLevel: rec.sensitivityLevel,
      provenance: {
        submittedBy: rec.provenance.submittedBy,
        sourceSystem: rec.provenance.sourceSystem,
        facilityName: rec.provenance.facilityName,
        practitionerName: rec.provenance.practitionerName,
        clinicalNotice: 'Authenticated by source hospital telemetry; verification unconfirmed by third parties.',
      },
      contentRef: rec.contentRef,
    };
  });

  // Audit record viewing (NO contents in log)
  await recordAuditLog({
    actorId: doctorUser._id,
    actorRole: doctorUser.role,
    action: 'VIEW_PATIENT_RECORD',
    resourceType: 'PatientRecord',
    resourceId: `PAT-${patientId}`,
    patientId,
    hospitalId: doctorUser.hospitalId,
    accessGranted: true,
    justification: `Doctor retrieved ${formattedRecords.length} clinical records under consent ${consent.consentId}`,
    ipAddress,
    userAgent,
    meta: {
      consentId: consent.consentId,
      recordsReturned: formattedRecords.length,
      allowedTypes,
      includesSensitive: consent.includeSensitiveRecords,
    },
  });

  return {
    records: formattedRecords,
    consent: {
      consentId: consent.consentId,
      purpose: consent.purpose,
      recordTypes: consent.recordTypes,
      expiresAt: consent.expiresAt,
      grantedAt: consent.grantedAt,
      includeSensitiveRecords: consent.includeSensitiveRecords,
    },
    accessGranted: true,
  };
}

/**
 * Emergency Break-Glass access handler.
 * Behind configurable feature flag; default OFF.
 */
async function executeBreakGlassAccess({
  patientId,
  doctorUser,
  reason,
  ipAddress = '127.0.0.1',
  userAgent = '',
}) {
  if (!consentConfig.breakGlassEnabled) {
    throw new Error('Break-glass emergency access is disabled by system policy.');
  }

  if (!reason || reason.trim().length < 10) {
    throw new Error('A detailed clinical emergency justification is mandatory for break-glass override.');
  }

  // Create temporary emergency consent window
  const emergencyConsentId = `BG-${uuidv4()}`;
  const timeLimitMs = consentConfig.breakGlassTimeLimitHours * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + timeLimitMs);

  const emergencyConsent = new Consent({
    consentId: emergencyConsentId,
    patientId,
    requestingHospitalId: doctorUser.hospitalId,
    toHospitalId: doctorUser.hospitalId,
    requestingDoctorId: doctorUser._id,
    purpose: 'emergency',
    recordTypes: ['lab_report', 'prescription', 'discharge_summary', 'diagnosis', 'allergy'],
    status: 'granted',
    includeSensitiveRecords: false, // emergency break-glass narrow view
    grantedAt: new Date(),
    expiresAt,
    breakGlass: {
      used: true,
      reason,
      accessedAt: new Date(),
      accessedBy: doctorUser._id,
    },
    decisionHistory: [{
      status: 'granted',
      changedBy: doctorUser._id,
      changedAt: new Date(),
      reason: `EMERGENCY BREAK-GLASS: ${reason}`,
      consentTextVersion: consentConfig.consentTextVersion,
    }],
    consentTextVersion: consentConfig.consentTextVersion,
  });

  await emergencyConsent.save();

  // Prominently audit log
  await recordAuditLog({
    actorId: doctorUser._id,
    actorRole: doctorUser.role,
    action: 'BREAK_GLASS_ACCESS',
    resourceType: 'Consent',
    resourceId: emergencyConsent.consentId,
    patientId,
    hospitalId: doctorUser.hospitalId,
    accessGranted: true,
    justification: `EMERGENCY BREAK-GLASS: ${reason}`,
    ipAddress,
    userAgent,
    meta: {
      emergencyTimeLimitHours: consentConfig.breakGlassTimeLimitHours,
      expiresAt,
      flaggedForPatientNotification: true,
      flaggedForPeerReview: true,
    },
  });

  return emergencyConsent;
}

/**
 * Retrieves the transparent patient-facing access audit report.
 * Shows who accessed what, when, and under which consent.
 */
async function getPatientAccessHistory(patientId) {
  const logs = await AuditLog.find({
    patientId,
    action: {
      $in: [
        'VIEW_PATIENT_RECORD',
        'REQUEST_CONSENT',
        'GRANT_CONSENT',
        'DENY_CONSENT',
        'REVOKE_CONSENT',
        'BREAK_GLASS_ACCESS',
        'DENIED_RECORD_ACCESS',
      ],
    },
  })
    .populate('hospitalId', 'name district code')
    .populate('actorId', 'name role')
    .sort({ timestamp: -1 })
    .lean();

  return logs.map(l => ({
    logId: l.logId,
    action: l.action,
    timestamp: l.timestamp,
    actor: {
      name: l.actorId ? l.actorId.name : 'Unknown User',
      role: l.actorRole,
    },
    hospital: {
      name: l.hospitalId ? l.hospitalId.name : 'Platform System',
      district: l.hospitalId ? l.hospitalId.district : 'N/A',
    },
    outcome: l.accessGranted ? 'Granted' : 'Denied',
    justification: l.justification,
    details: {
      consentId: l.meta ? l.meta.consentId : undefined,
      typesAccessed: l.meta ? (l.meta.allowedTypes || l.meta.requestedTypes || []) : [],
      recordsReturned: l.meta ? l.meta.recordsReturned : undefined,
    },
  }));
}

module.exports = {
  requestConsent,
  grantConsent,
  denyConsent,
  revokeConsent,
  verifyActiveConsent,
  expireOldConsents,
  getConsentedPatientRecords,
  executeBreakGlassAccess,
  getPatientAccessHistory,
  computeRecordAgeInfo,
};
