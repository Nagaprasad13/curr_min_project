/**
 * CareBridge Internationalization (i18n) Scaffold
 * Provides structured English interface strings as a scaffold for future localization.
 * 
 * NOTE: Medical terminology and clinical disclaimers are preserved in English
 * until formal clinician-validated localization review is completed.
 */

export const STRINGS = {
  en: {
    common: {
      appName: 'CareBridge',
      tagline: 'Capability-Verified, Freshness-Aware Hospital Referral Engine',
      prototypeNotice: 'Synthetic data. Not for real patient care.',
      clinicalDisclaimer: 'Decision support only. A clinician must review.',
      loading: 'Loading data...',
      save: 'Save Changes',
      cancel: 'Cancel',
      confirm: 'Confirm',
      submit: 'Submit',
      back: 'Back',
      status: 'Status',
      actions: 'Actions',
      refresh: 'Refresh',
      error: 'An error occurred.',
      empty: 'No records found.',
      district: 'District',
    },
    roles: {
      patient: 'Patient Portal',
      doctor: 'Doctor Referral & Decision Support',
      hospital_admin: 'Hospital Admin & Capacity Telemetry',
      platform_reviewer: 'Platform reviewer',
    },
    hospitalAdmin: {
      profileTitle: 'Hospital Profile & Clinical Capabilities',
      proposedTier: 'Proposed Capability Tier',
      effectiveTier: 'Effective tier (simulated)',
      unconfirmedWarning: 'Proposed tier (simulation)',
      consistencyCheckTitle: 'Automated Capability Consistency Audit',
      updateCapacityTitle: 'Capacity & Bed Availability Telemetry',
      telemetryAge: 'Telemetry Age',
      approachingStaleness: 'Warning: Telemetry approaching 2-hour staleness threshold!',
      staleWarning: 'Telemetry is STALE. Referral engine will flag capacity as UNKNOWN.',
      updateSuccess: 'Capacity telemetry recorded successfully in append-only history.',
    },
    reviewer: {
      queueTitle: 'Hospital Verification & Tier Audit Queue',
      approve: 'Record simulated verification',
      reject: 'Reject Submission',
      rejectReasonRequired: 'A specific rejection reason is strictly required.',
      specialtyMapTitle: 'Condition-Specialty Escalation Mapping Sheet',
      specialtyMapDesc: 'Reviewer sign-off on clinical triage and specialty routing rules.',
      schemeManagementTitle: 'Healthcare Assurance Schemes Catalogue',
      sweepOutdated: 'Sweep Outdated Schemes (>180d)',
      markVerified: 'Record research source review',
    },
    doctor: {
      newAssessmentTitle: 'Clinical Triage & Condition Screening Intake',
      vitalsSection: 'Intake Vitals & Symptoms',
      suggestedUrgency: 'Model Suggested Urgency',
      redFlagsDetected: 'Red Flag Clinical Triggers',
      fusedUrgency: 'Fused Recommended Urgency',
      confirmUrgency: 'Confirm Urgency',
      overrideUrgency: 'Override Urgency (Mandatory Reason)',
      overrideReason: 'Clinical Justification for Urgency Override',
      insufficientDataWarning: 'Insufficient Intake Data: Vitals incomplete for algorithmic risk assessment.',
      referralsTitle: 'Capability-Verified Hospital Recommendations',
      straightLineDistance: 'Straight-line distance',
      capacityUnknownPhone: 'Unknown, confirm by phone',
      excludedTitle: 'Clinically Excluded Hospitals',
      recordsConsentTitle: 'Patient Clinical Records & Consent Status',
      requestConsent: 'Request Records Consent',
      oldRecordWarning: 'Warning: Record is older than 6 months. Verify current status.',
    },
    patient: {
      myProfile: 'My Patient Profile',
      myRecords: 'My Clinical Records',
      consentRequests: 'Active & Pending Consent Requests',
      grantConsent: 'Grant Consent',
      narrowConsent: 'Narrow Scope / Shorten Duration',
      revokeConsent: 'Revoke Consent Immediately',
      accessHistory: 'Transparent Record Access Audit Log',
      myReferrals: 'My Referral Status',
      schemeMatches: 'Possible scheme matches',
      possibleMatchNotice: 'Possible match only. Not confirmed eligibility.',
    },
    schemes: {
      disclaimer: 'Possible match only. Not confirmed eligibility. Check current details with the programme directly.',
      matchPotential: 'Possible match',
      unlikelyMatch: 'Unlikely Match',
      undeterminedMatch: 'Cannot Determine (Missing Input Criteria)',
    },
  },
};

export function getTranslation(lang = 'en', section, key) {
  const langDict = STRINGS[lang] || STRINGS.en;
  return langDict[section]?.[key] || STRINGS.en[section]?.[key] || key;
}
