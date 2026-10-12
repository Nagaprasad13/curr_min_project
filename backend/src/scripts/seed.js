const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../config/db');
const Hospital = require('../models/Hospital');
const HospitalCapacity = require('../models/HospitalCapacity');
const Scheme = require('../models/Scheme');
const User = require('../models/User');
const Referral = require('../models/Referral');
const {
  generateSyntheticHospitals,
  generateSyntheticCapacities,
  generateSyntheticReferralScenarios,
  generateSchemeCatalogue,
  generateSyntheticUsers,
} = require('./syntheticDataGenerator');

async function runSeed() {
  console.log('================================================================');
  console.log(' CareBridge: Phase 2 Synthetic Seed Data Generation');
  console.log(' Target: Tamil Nadu, India (Research Prototype)');
  console.log(' Disclaimer: Decision support only. Clinician review required.');
  console.log('================================================================\n');

  try {
    await connectDB();

    console.log('[1/6] Generating 40 synthetic Tamil Nadu hospitals through classifyHospitalTier()...');
    const rawHospitals = generateSyntheticHospitals();

    // Persist hospitals to MongoDB
    await Hospital.deleteMany({ isSynthetic: true });
    const insertedHospitals = await Hospital.insertMany(rawHospitals);
    console.log(`✓ Inserted ${insertedHospitals.length} synthetic hospitals across Tamil Nadu districts.`);

    // Map code -> ObjectId
    const hospitalCodeMap = new Map();
    insertedHospitals.forEach(h => hospitalCodeMap.set(h.code, h._id));

    console.log('[2/6] Generating timestamped capacity telemetry snapshots...');
    const rawCapacities = generateSyntheticCapacities(rawHospitals);
    const capacityDocs = rawCapacities.map(c => ({
      ...c,
      hospitalId: hospitalCodeMap.get(c.hospitalCode),
    }));

    await HospitalCapacity.deleteMany({ isSynthetic: true });
    const insertedCapacities = await HospitalCapacity.insertMany(capacityDocs);
    console.log(`✓ Inserted ${insertedCapacities.length} capacity telemetry snapshots.`);

    console.log('[3/6] Seeding Scheme Catalogue (CMCHIS & PM-JAY)...');
    const rawSchemes = generateSchemeCatalogue();
    await Scheme.deleteMany({});
    const insertedSchemes = await Scheme.insertMany(rawSchemes);
    console.log(`✓ Inserted ${insertedSchemes.length} health assurance schemes.`);

    console.log('[4/6] Creating 5 role-based demo user accounts (2 admins, 1 reviewer, 1 doctor, 1 patient)...');
    const rawUsers = generateSyntheticUsers(rawHospitals);
    await User.deleteMany({ isSynthetic: true });

    for (const u of rawUsers) {
      const userDoc = new User({
        ...u,
        hospitalId: u.hospitalCode ? hospitalCodeMap.get(u.hospitalCode) : undefined,
      });
      const savedUser = await userDoc.save();

      // If user is a hospital_admin, associate their adminUserId on the hospital document
      if (savedUser.role === 'hospital_admin' && savedUser.hospitalId) {
        await Hospital.findByIdAndUpdate(savedUser.hospitalId, { adminUserId: savedUser._id });
      }
    }
    console.log(`✓ Created ${rawUsers.length} role-based demo accounts with hashed passwords.`);

    console.log('[5/6] Generating 500 synthetic referral scenarios with ground-truth suitability sets...');
    const scenarios = generateSyntheticReferralScenarios(rawHospitals);

    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(dataDir, 'synthetic_hospitals.json'),
      JSON.stringify(rawHospitals, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(dataDir, 'synthetic_referral_scenarios.json'),
      JSON.stringify(scenarios, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(dataDir, 'synthetic_schemes.json'),
      JSON.stringify(rawSchemes, null, 2),
      'utf-8'
    );
    console.log(`✓ Exported synthetic datasets to ${dataDir}`);

    console.log('[6/6] Seeding sample active referral requests into database...');
    await Referral.deleteMany({ isSynthetic: true });
    const doctorUser = await User.findOne({ role: 'doctor' });
    const patientUser = await User.findOne({ role: 'patient' });

    const sampleReferralDocs = scenarios.slice(0, 10).map((scn, idx) => ({
      referralId: `REF-2026-${String(idx + 1).padStart(4, '0')}`,
      patientId: patientUser ? patientUser._id : undefined,
      patientName: `Synthetic Patient ${idx + 1} (${scn.patientSummary.gender}, ${scn.patientSummary.age}y)`,
      referringDoctorId: doctorUser ? doctorUser._id : undefined,
      referringHospitalId: doctorUser && doctorUser.hospitalId ? doctorUser.hospitalId : undefined,
      patientSummary: scn.patientSummary,
      requirements: scn.requirements,
      rankedRecommendations: [],
      status: 'submitted',
      clinicalDisclaimerAcknowledged: true,
      decisionSupportDisclaimer: 'Decision support only. A clinician must review.',
      isSynthetic: true,
    }));
    await Referral.insertMany(sampleReferralDocs);
    console.log(`✓ Inserted 10 sample active referrals in MongoDB.`);

    // Summary statistics table
    console.log('\n=================== SEED GENERATION SUMMARY ===================');
    console.log(`Total Hospitals: ${insertedHospitals.length}`);
    console.log('---------------------------------------------------------------');
    console.log('CAPABILITY TIERS (Proposed Categories, Evaluated Dynamically):');
    console.log(`  - Tier 1 (Advanced Tertiary):   ${insertedHospitals.filter(h => h.tier === 'Tier 1').length}`);
    console.log(`  - Tier 2 (Secondary Referral):  ${insertedHospitals.filter(h => h.tier === 'Tier 2').length}`);
    console.log(`  - Tier 3 (Basic Community):     ${insertedHospitals.filter(h => h.tier === 'Tier 3').length}`);
    console.log('---------------------------------------------------------------');
    console.log('VERIFICATION STATES (Simulated Audit Workflow):');
    console.log(`  - Verified (Referable):         ${insertedHospitals.filter(h => h.verificationStatus === 'verified').length}`);
    console.log(`  - Pending Review:               ${insertedHospitals.filter(h => h.verificationStatus === 'pending').length}`);
    console.log(`  - Rejected (Non-compliant):     ${insertedHospitals.filter(h => h.verificationStatus === 'rejected').length}`);
    console.log('---------------------------------------------------------------');
    console.log('DEMO ACCOUNTS:');
    console.log('  1. admin.kovai@carebridge.tn.gov.in    (Role: hospital_admin, Kovai Apex Hospital)');
    console.log('  2. admin.salem@carebridge.tn.gov.in    (Role: hospital_admin, Salem Mohan Kumaramangalam)');
    console.log('  3. reviewer@carebridge.tn.gov.in       (Role: platform_reviewer, TNHSP Audit Directorate)');
    console.log('  4. doctor@carebridge.tn.gov.in         (Role: doctor, Referring Pulmonologist)');
    console.log('  5. patient@carebridge.tn.gov.in        (Role: patient, Erode District)');
    console.log('  (Password for all demo accounts: AdminPassword123! / ReviewerPassword123! / DoctorPassword123! / PatientPassword123!)');
    console.log('===============================================================\n');

  } catch (error) {
    console.error('Seed script encountered an error:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  runSeed();
}

module.exports = runSeed;
