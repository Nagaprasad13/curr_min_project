/**
 * CareBridge Internationalization (i18n) Scaffold
 * Provides structured English interface strings with scaffolding for future Tamil (தமிழ்) translation.
 * 
 * NOTE: Medical terminology and clinical disclaimers are preserved in English
 * until formal clinician-validated localization review is completed.
 */

export const STRINGS = {
  en: {
    common: {
      appName: 'CareBridge',
      tagline: 'Capability-Verified, Freshness-Aware Hospital Referral Engine',
      prototypeNotice: 'RESEARCH PROTOTYPE. NOT FOR REAL CLINICAL CARE.',
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
      platform_reviewer: 'TNHSP Platform Reviewer & Auditor',
    },
    hospitalAdmin: {
      profileTitle: 'Hospital Profile & Clinical Capabilities',
      proposedTier: 'Proposed Capability Tier',
      effectiveTier: 'Confirmed Effective Tier',
      unconfirmedWarning: 'Unconfirmed Tier (Pending Formal TNHSP Review)',
      consistencyCheckTitle: 'Automated Capability Consistency Audit',
      updateCapacityTitle: 'Capacity & Bed Availability Telemetry',
      telemetryAge: 'Telemetry Age',
      approachingStaleness: 'Warning: Telemetry approaching 2-hour staleness threshold!',
      staleWarning: 'Telemetry is STALE. Referral engine will flag capacity as UNKNOWN.',
      updateSuccess: 'Capacity telemetry recorded successfully in append-only history.',
    },
    reviewer: {
      queueTitle: 'Hospital Verification & Tier Audit Queue',
      approve: 'Verify & Confirm Tier',
      reject: 'Reject Submission',
      rejectReasonRequired: 'A specific rejection reason is strictly required.',
      specialtyMapTitle: 'Condition-Specialty Escalation Mapping Sheet',
      specialtyMapDesc: 'Reviewer sign-off on clinical triage and specialty routing rules.',
      schemeManagementTitle: 'Healthcare Assurance Schemes Catalogue',
      sweepOutdated: 'Sweep Outdated Schemes (>180d)',
      markVerified: 'Mark Verified Against Official Portal',
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
      straightLineDistance: 'Straight-line Haversine distance',
      capacityUnknownPhone: 'Capacity Unknown - Confirm availability by phone prior to transfer',
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
      schemeMatches: 'Healthcare Scheme Potential Matches',
      possibleMatchNotice: 'Possible match only. Official enrollment & pre-authorization required.',
    },
    schemes: {
      forbiddenWordsNotice: 'CareBridge never guarantees coverage or claims free treatment.',
      matchPotential: 'Potential Match',
      unlikelyMatch: 'Unlikely Match',
      undeterminedMatch: 'Cannot Determine (Missing Input Criteria)',
    },
  },
  // Scaffold for Tamil (ta) localization (non-clinical strings)
  ta: {
    common: {
      appName: 'கேர்பிரிட்ஜ் (CareBridge)',
      tagline: 'திறன்-சரிபார்க்கப்பட்ட, புதிய தகவல் அடிப்படையிலான மருத்துவமனை பரிந்துரை தளம்',
      prototypeNotice: 'ஆராய்ச்சி முன்மாதிரி மட்டுமே. நேரடி மருத்துவ சிகிச்சைக்கு அல்ல.',
      clinicalDisclaimer: 'முடிவெடுக்கும் ஆதரவு மட்டுமே. மருத்துவர் மதிப்பாய்வு செய்ய வேண்டும்.',
      loading: 'ஏற்றுகிறது...',
      save: 'சேமி',
      cancel: 'ரத்து செய்',
      confirm: 'உறுதிப்படுத்து',
      submit: 'சமர்ப்பி',
      back: 'பின்செல்',
      status: 'நிலை',
      actions: 'செயல்கள்',
      refresh: 'புதுப்பி',
      error: 'பிழை ஏற்பட்டது.',
      empty: 'பதிவுகள் எதுவும் இல்லை.',
      district: 'மாவட்டம்',
    },
  },
};

export function getTranslation(lang = 'en', section, key) {
  const langDict = STRINGS[lang] || STRINGS.en;
  return langDict[section]?.[key] || STRINGS.en[section]?.[key] || key;
}
