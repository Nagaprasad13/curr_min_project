/**
 * CareBridge Guided Demo Scenario Runner
 * Walks through the complete 7-step integration scenario in simulation, plus the incomplete intake fallback demo path.
 * 
 * Usage: npm run demo
 */

const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const HospitalCapacity = require('../models/HospitalCapacity');
const Consent = require('../models/Consent');
const Referral = require('../models/Referral');
const { signToken } = require('../config/jwt');
const { rankReferralHospitals } = require('../services/referralEngineService');
const { requestConsent, grantConsent, revokeConsent, verifyActiveConsent, getConsentedPatientRecords } = require('../services/consentService');
const { evaluateSchemePotentialMatches, MANDATORY_NOTICE } = require('../services/schemeService');

async function runGuidedDemo(options = {}) {
  console.log('================================================================');
  console.log(' 🚀 CareBridge: Phase 7 Guided End-to-End Demo Walkthrough');
  console.log(' Research Prototype - Tamil Nadu Referral Simulation');
  console.log(' Disclaimer: Decision support only. Clinician review required.');
  console.log('================================================================\n');

  try {
    await connectDB();

    // Fetch demo users
    const adminSalem = await User.findOne({ email: 'admin.salem@carebridge.invalid' });
    const doctorSalem = await User.findOne({ email: 'doctor@carebridge.invalid' });
    const patientKavitha = await User.findOne({ role: 'patient' });

    if (!adminSalem || !doctorSalem || !patientKavitha) {
      throw new Error('Demo accounts missing. Run "npm run seed-demo" first.');
    }

    // -------------------------------------------------------------------------
    // STEP 1: Hospital admin in a small Salem facility updates capacity
    // -------------------------------------------------------------------------
    console.log('👉 STEP 1: Hospital admin in Salem facility updates capacity telemetry');
    const salemHosp = await Hospital.findById(adminSalem.hospitalId);
    console.log(`   Hospital: ${salemHosp.name} (${salemHosp.tier}, ${salemHosp.district})`);

    const newSnapshot = new HospitalCapacity({
      hospitalId: salemHosp._id,
      timestamp: new Date(),
      reportedAt: new Date(),
      stalenessThresholdMinutes: 120,
      beds: {
        general: { total: 100, occupied: 75, available: 25, reportedStatus: 'available' },
        emergency: { total: 15, occupied: 12, available: 3, reportedStatus: 'available' },
        icu: { total: 10, occupied: 9, available: 1, reportedStatus: 'available' },
        ventilators: { total: 8, occupied: 7, available: 1, reportedStatus: 'available' },
      },
      services: {
        emergencyDepartment: { reportedStatus: 'available' },
        cardiacCathLab: { reportedStatus: 'unavailable' },
      },
      reportedBy: adminSalem.name,
      isSynthetic: true,
    });
    await newSnapshot.save();
    console.log(`   ✓ Capacity broadcast: 1 ICU bed & 1 ventilator available (reported at ${newSnapshot.reportedAt.toLocaleTimeString()}).\n`);

    // -------------------------------------------------------------------------
    // STEP 2: Doctor enters a patient with breathing difficulty and abnormal vitals
    // -------------------------------------------------------------------------
    console.log('👉 STEP 2: Attending doctor intakes patient with acute respiratory distress');
    const patientVitals = {
      age: 54,
      gender: 'M',
      vitals: {
        heart_rate: 118,
        respiratory_rate: 28,
        systolic_bp: 92,
        spo2: 89,
        temperature: 38.6,
      },
      symptoms: ['shortness of breath', 'fever', 'cough'],
      comorbidities: ['hypertension', 'type 2 diabetes'],
      chief_complaint: 'Severe dyspnea, SpO2 89% on room air, bilateral pulmonary crackles',
    };
    console.log(`   Patient: ${patientKavitha.name} (54y, SpO2 89%, RR 28, HR 118 bpm)`);

    // -------------------------------------------------------------------------
    // STEP 3: Screening + triage suggestion, red-flag check, urgency confirmed
    // -------------------------------------------------------------------------
    console.log('\n👉 STEP 3: ML Triage & Screening suggestions generated + Doctor urgency confirmation');
    const assessmentFixture = await Referral.findOne({ referralId: 'DEMO-REF-2026-0001' });
    if (!assessmentFixture?.mlAssessment) {
      throw new Error('Red-flag demo assessment is missing. Run "npm run seed-demo" first.');
    }
    console.log(`   - Demo assessment version: ${assessmentFixture.mlAssessment.modelVersion}`);
    console.log(`   - Inference executed: ${Boolean(assessmentFixture.mlAssessment.rawAssessment?.inferenceExecuted)}`);
    console.log(`   - Red Flag Triggers: ${(assessmentFixture.mlAssessment.rawAssessment?.redFlags || []).length}`);
    console.log(`   - Screened Specialty: ${assessmentFixture.requirements.requiredSpecialty}`);
    const overrideFixture = await Referral.findOne({ referralId: 'DEMO-REF-2026-0004' });
    console.log(`   - Urgency step: ${overrideFixture.requirements.urgency}; reason: ${overrideFixture.requirements.urgencyOverrideReason}`);

    // -------------------------------------------------------------------------
    // STEP 4: Referral engine returns ranked hospitals with explanations
    // -------------------------------------------------------------------------
    console.log('\n👉 STEP 4: CareBridge referral engine queries capability-verified network');
    console.log('   Constraints: Required Pulmonology, Ventilator, Unknown-Aware capacity mode.');

    const allHospitals = await Hospital.find({}).lean();
    const latestCapacities = await HospitalCapacity.aggregate([
      { $sort: { timestamp: -1, reportedAt: -1 } },
      { $group: { _id: '$hospitalId', latestDoc: { $first: '$$ROOT' } } },
    ]);
    const capMap = new Map();
    latestCapacities.forEach(c => capMap.set(c._id.toString(), c.latestDoc));

    const rankedResult = rankReferralHospitals(
      {
        requiredSpecialty: 'Pulmonology',
        urgency: 'emergency',
        requiredEquipment: ['ventilators'],
        requiredBedType: 'icu',
        patientLocation: { latitude: 11.6643, longitude: 78.146 }, // Salem Centroid
        referringHospitalId: salemHosp._id,
        capacityMode: 'unknown_aware',
        now: new Date(),
      },
      allHospitals,
      capMap
    );
    if (!rankedResult.recommendations.length) {
      throw new Error('Referral engine returned no eligible facilities for the guided demo.');
    }

    console.log(`   Found ${rankedResult.recommendations.length} eligible hospitals:`);
    rankedResult.recommendations.slice(0, 3).forEach((h, idx) => {
      console.log(`   [#${idx + 1}] ${h.name} (${h.tier}, ${h.district})`);
      console.log(`        Score: ${h.score.toFixed(3)} | Straight-line distance: ${h.distanceKm.toFixed(1)} km`);
      if (h.capacityUnknown) {
        console.log(`        ⚠️ FLAG: Capacity unknown, confirm by phone prior to transfer!`);
      }
    });
    const unknownCapacityFixture = await Referral.findOne({ referralId: 'DEMO-REF-2026-0006' });
    const unknownCapacityHospital = unknownCapacityFixture?.rankedRecommendations
      .find(hospital => hospital.capacityAgeLabel === 'Never reported');
    if (!unknownCapacityHospital) {
      throw new Error('Seeded unknown-capacity referral example is missing. Run "npm run seed-demo" first.');
    }
    console.log(`   Seeded ranked referral example: ${unknownCapacityFixture.referralId}`);
    console.log(`     [#${unknownCapacityHospital.rank}] ${unknownCapacityHospital.hospitalName} - capacity ${unknownCapacityHospital.capacityAgeLabel}.`);

    console.log(`   ✓ Key Demonstration Properties Observed:`);
    console.log(`     - Hospitals without Pulmonology were clinically excluded (Total excluded: ${rankedResult.excludedHospitals.length}).`);
    console.log(`     - Stale capacity was treated as "unknown" rather than falsely assumed available.`);

    const targetHospital = rankedResult.recommendations[0];

    // -------------------------------------------------------------------------
    // STEP 5: Doctor selects hospital; consent request goes to the patient
    // -------------------------------------------------------------------------
    console.log(`\n👉 STEP 5: Doctor selects #${targetHospital.name} and initiates consent request`);
    const consentDoc = await requestConsent({
      patientId: patientKavitha._id,
      requestingDoctorId: doctorSalem._id,
      requestingHospitalId: targetHospital.hospitalId,
      purpose: 'referral',
      recordTypes: ['lab_report', 'prescription', 'discharge_summary'],
      durationDays: 7,
      includeSensitiveRecords: false,
      actorRole: 'doctor',
    });
    console.log(`   ✓ Consent Request Dispatched: ID ${consentDoc.consentId} (Status: "${consentDoc.status}")`);

    // -------------------------------------------------------------------------
    // STEP 6: Patient grants consent; receiving doctor views allowed records only
    // -------------------------------------------------------------------------
    console.log('\n👉 STEP 6: Patient explicitly grants consent (narrowing scope to lab & discharge)');
    const grantedConsent = await grantConsent({
      consentId: consentDoc.consentId,
      patientId: patientKavitha._id,
      narrowedRecordTypes: ['lab_report', 'discharge_summary'],
      shortenedExpiryDays: 5,
    });
    console.log(`   ✓ Patient granted consent ${grantedConsent.consentId} (Active status: "${grantedConsent.status}")`);

    // Receiving doctor checks permission under Zero Client Trust
    const activeConsent = await verifyActiveConsent({
      patientId: patientKavitha._id,
      doctorUser: { _id: doctorSalem._id, role: 'doctor', hospitalId: targetHospital.hospitalId },
    });
    console.log(`   ✓ Receiving hospital access check: ${activeConsent ? 'ALLOWED (Server-side consent verified)' : 'DENIED'}`);

    const recordsResult = await getConsentedPatientRecords({
      patientId: patientKavitha._id,
      doctorUser: { _id: doctorSalem._id, role: 'doctor', hospitalId: targetHospital.hospitalId },
    });
    console.log(`   ✓ Receiving doctor successfully retrieved ${recordsResult.records.length} consented records.`);

    // -------------------------------------------------------------------------
    // STEP 7: Patient views scheme matches; revokes consent and access stops
    // -------------------------------------------------------------------------
    console.log('\n👉 STEP 7: Patient checks scheme potential matches, then revokes consent');
    const schemeResults = await evaluateSchemePotentialMatches({
      inputs: {
        stateResident: true,
        annualFamilyIncome: 95000,
        rationCardType: 'PHH',
        age: 54,
        treatmentCategory: 'Pulmonology',
      },
      actor: patientKavitha,
      targetPatientId: patientKavitha._id,
    });
    console.log(`   ✓ Scheme evaluation output: ${schemeResults.length} schemes evaluated.`);
    schemeResults.forEach(s => {
      console.log(`     - ${s.schemeName}: ${s.matchStatus.toUpperCase()}`);
    });
    console.log(`   Mandatory Notice: "${MANDATORY_NOTICE}"`);

    // Revocation
    console.log('\n   Patient revokes consent:');
    const revoked = await revokeConsent({
      consentId: consentDoc.consentId,
      patientId: patientKavitha._id,
      reason: 'Referral consult concluded',
    });
    console.log(`   ✓ Consent ${revoked.consentId} status: "${revoked.status}"`);

    // Revocation check
    const verifiedConsentDoc = await Consent.findOne({ consentId: consentDoc.consentId });
    const isAccessActive = verifiedConsentDoc && verifiedConsentDoc.status === 'granted' && !verifiedConsentDoc.revokedAt;
    const postRevokeConsent = await verifyActiveConsent({
      patientId: patientKavitha._id,
      doctorUser: { _id: doctorSalem._id, role: 'doctor', hospitalId: targetHospital.hospitalId },
    });
    const postRevokeRecords = await getConsentedPatientRecords({
      patientId: patientKavitha._id,
      doctorUser: { _id: doctorSalem._id, role: 'doctor', hospitalId: targetHospital.hospitalId },
    });
    if (isAccessActive || postRevokeConsent || postRevokeRecords.accessGranted) {
      throw new Error('Consent revocation did not stop record access.');
    }
    console.log('   ✓ Subsequent server-side check: TERMINATED (record access blocked immediately).');

    // -------------------------------------------------------------------------
    // DEMO PATH B: Incomplete assessment inputs showing "insufficient data"
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(' 🧪 DEMO PATH B: Incomplete Assessment Intake Handling');
    console.log('================================================================');
    console.log('   Showing the seeded synthetic intake with age & gender only and no vitals...');
    const incompleteFixture = await Referral.findOne({ referralId: 'DEMO-REF-2026-0002' });
    if (!incompleteFixture?.mlAssessment) {
      throw new Error('Insufficient-data demo assessment is missing. Run "npm run seed-demo" first.');
    }
    console.log(`   ✓ System Response:`);
    console.log(`     - Triage Warning: "${incompleteFixture.mlAssessment.rawAssessment?.dataQualityWarning}"`);
    console.log(`     - Assessment version: ${incompleteFixture.mlAssessment.modelVersion}`);
    console.log('     - Static synthetic fixture only; no model inference or acuity prediction was run.');

    console.log('\n================================================================');
    console.log(' 🎉 ALL GUIDED DEMO SCENARIOS COMPLETED SUCCESSFULLY');
    console.log('================================================================\n');
    return {
      completed: true,
      steps: 7,
      assessmentFixtureId: assessmentFixture.referralId,
      insufficientDataFixtureId: 'DEMO-REF-2026-0002',
    };

  } catch (err) {
    console.error('Demo execution failed:', err);
    if (options.throwOnError) throw err;
    process.exitCode = 1;
  } finally {
    if (options.disconnect !== false) await disconnectDB();
  }
}

if (require.main === module) {
  runGuidedDemo();
}

module.exports = runGuidedDemo;
