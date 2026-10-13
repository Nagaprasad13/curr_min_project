const Hospital = require('../models/Hospital');
const Practitioner = require('../models/Practitioner');
const { connectDB, disconnectDB } = require('../config/db');

/**
 * CareBridge Data Consistency Checker (Phase 8.2)
 * 
 * Verifies that every hospital claiming a clinical specialty possesses at least
 * one active, verified practitioner registered in that specialty department.
 * Fails with process.exitCode = 1 if an inconsistency is detected.
 */
async function checkDataConsistency() {
  console.log('================================================================');
  console.log(' CareBridge Data Consistency Audit: Hospital Specialties vs Practitioners');
  console.log(' Rule: A hospital CANNOT claim a specialty with 0 active verified staff');
  console.log('================================================================\n');

  const hospitals = await Hospital.find({}).lean();
  let totalClaimsChecked = 0;
  const inconsistencies = [];

  for (const hospital of hospitals) {
    const specialties = hospital.specialties || [];

    for (const specialty of specialties) {
      totalClaimsChecked++;

      const activeVerifiedCount = await Practitioner.countDocuments({
        hospitalId: hospital._id,
        specialty,
        employmentStatus: 'active',
        verificationStatus: 'verified',
      });

      if (activeVerifiedCount === 0) {
        inconsistencies.push({
          hospitalId: hospital._id.toString(),
          hospitalCode: hospital.code,
          hospitalName: hospital.name,
          claimedSpecialty: specialty,
          activeVerifiedCount: 0,
          tier: hospital.tier,
        });
      }
    }
  }

  console.log(`Audited ${hospitals.length} hospitals across ${totalClaimsChecked} claimed specialty departments.`);

  // REVERSE CHECK: Every active verified practitioner must belong to hospital's claimed specialties
  const unlistedPractitioners = [];
  const allVerifiedPractitioners = await Practitioner.find({
    employmentStatus: 'active',
    verificationStatus: 'verified',
  }).lean();

  const hospitalMap = new Map(hospitals.map(h => [h._id.toString(), h]));

  for (const prac of allVerifiedPractitioners) {
    const hosp = hospitalMap.get(prac.hospitalId.toString());
    if (hosp) {
      const claimed = hosp.specialties || [];
      if (!claimed.includes(prac.specialty)) {
        unlistedPractitioners.push({
          hospitalId: hosp._id.toString(),
          hospitalCode: hosp.code,
          hospitalName: hosp.name,
          practitionerId: prac.practitionerId,
          practitionerName: prac.fullName,
          practitionerSpecialty: prac.specialty,
        });
      }
    }
  }

  const hasErrors = inconsistencies.length > 0 || unlistedPractitioners.length > 0;

  if (hasErrors) {
    if (inconsistencies.length > 0) {
      console.error(`\n❌ DIRECT INCONSISTENCY CHECK FAILED: Found ${inconsistencies.length} orphaned specialty claims!\n`);
      console.table(inconsistencies);
    }
    if (unlistedPractitioners.length > 0) {
      console.error(`\n❌ REVERSE INCONSISTENCY CHECK FAILED: Found ${unlistedPractitioners.length} active verified practitioners with unlisted specialties!\n`);
      console.table(unlistedPractitioners);
    }
    return {
      passed: false,
      inconsistencies,
      unlistedPractitioners,
      totalClaimsChecked,
    };
  }

  console.log('✓ PASS: All hospitals have active verified practitioners for 100% of claimed specialties.');
  console.log('✓ PASS: 100% of active verified practitioners belong to listed hospital specialties (reverse check passed).');
  console.log('✓ Zero orphaned specialty claims and zero unlisted practitioner specialties detected.\n');
  return {
    passed: true,
    inconsistencies: [],
    unlistedPractitioners: [],
    totalClaimsChecked,
  };
}

if (require.main === module) {
  connectDB().then(async () => {
    const result = await checkDataConsistency();
    await disconnectDB();
    if (!result.passed) {
      process.exit(1);
    }
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { checkDataConsistency };
