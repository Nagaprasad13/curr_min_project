const Hospital = require('../models/Hospital');
const Practitioner = require('../models/Practitioner');
const User = require('../models/User');
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
  const hospitalsWithoutAdmins = [];
  const hospitalsWithoutTwoLinkedDoctors = [];
  const mismatchedDoctorLinks = [];

  for (const hospital of hospitals) {
    const adminCount = await User.countDocuments({
      role: 'hospital_admin',
      hospitalId: hospital._id,
    });
    if (adminCount < 1) {
      hospitalsWithoutAdmins.push({ hospitalCode: hospital.code, hospitalName: hospital.name });
    }

    const linkedDoctorCount = await Practitioner.countDocuments({
      hospitalId: hospital._id,
      employmentStatus: 'active',
      verificationStatus: 'verified',
      userId: { $ne: null },
    });
    if (linkedDoctorCount < 2) {
      hospitalsWithoutTwoLinkedDoctors.push({
        hospitalCode: hospital.code,
        hospitalName: hospital.name,
        linkedVerifiedDoctors: linkedDoctorCount,
      });
    }

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

  const linkedPractitioners = await Practitioner.find({ userId: { $ne: null } }).lean();
  for (const practitioner of linkedPractitioners) {
    const user = await User.findById(practitioner.userId).select('role hospitalId').lean();
    if (!user || user.role !== 'doctor' ||
        user.hospitalId?.toString() !== practitioner.hospitalId.toString()) {
      mismatchedDoctorLinks.push({
        practitionerId: practitioner.practitionerId,
        practitionerHospitalId: practitioner.hospitalId.toString(),
        userId: practitioner.userId.toString(),
        userHospitalId: user?.hospitalId?.toString() || null,
        userRole: user?.role || null,
      });
    }
  }

  // Phase 8.4c: Nurse hospitalId must match all supervising doctors' hospitalId
  const mismatchedNurseDoctorLinks = [];
  const nurses = await User.find({ role: 'triage_nurse' }).lean();
  for (const nurse of nurses) {
    if (nurse.supervisingDoctorIds && nurse.supervisingDoctorIds.length > 0) {
      for (const docId of nurse.supervisingDoctorIds) {
        const doctor = await User.findById(docId).select('role hospitalId').lean();
        if (!doctor || doctor.role !== 'doctor' || doctor.hospitalId?.toString() !== nurse.hospitalId?.toString()) {
          mismatchedNurseDoctorLinks.push({
            nurseId: nurse._id.toString(),
            nurseName: nurse.name,
            nurseHospitalId: nurse.hospitalId?.toString() || null,
            doctorId: docId.toString(),
            doctorHospitalId: doctor?.hospitalId?.toString() || null,
            doctorRole: doctor?.role || null,
          });
        }
      }
    }
  }

  const hasErrors = inconsistencies.length > 0 || unlistedPractitioners.length > 0;
  const hasAccountErrors = hospitalsWithoutAdmins.length > 0 ||
    hospitalsWithoutTwoLinkedDoctors.length > 0 ||
    mismatchedDoctorLinks.length > 0 ||
    mismatchedNurseDoctorLinks.length > 0;

  if (hasErrors || hasAccountErrors) {
    if (inconsistencies.length > 0) {
      console.error(`\n❌ DIRECT INCONSISTENCY CHECK FAILED: Found ${inconsistencies.length} orphaned specialty claims!\n`);
      console.table(inconsistencies);
    }
    if (unlistedPractitioners.length > 0) {
      console.error(`\n❌ REVERSE INCONSISTENCY CHECK FAILED: Found ${unlistedPractitioners.length} active verified practitioners with unlisted specialties!\n`);
      console.table(unlistedPractitioners);
    }
    if (hospitalsWithoutAdmins.length > 0) {
      console.error(`\n❌ ACCOUNT CHECK FAILED: ${hospitalsWithoutAdmins.length} hospitals have no administrator.\n`);
      console.table(hospitalsWithoutAdmins);
    }
    if (hospitalsWithoutTwoLinkedDoctors.length > 0) {
      console.error(`\n❌ ACCOUNT CHECK FAILED: ${hospitalsWithoutTwoLinkedDoctors.length} hospitals have fewer than two linked verified doctors.\n`);
      console.table(hospitalsWithoutTwoLinkedDoctors);
    }
    if (mismatchedDoctorLinks.length > 0) {
      console.error(`\n❌ ACCOUNT CHECK FAILED: ${mismatchedDoctorLinks.length} linked doctor accounts do not match their practitioners.\n`);
      console.table(mismatchedDoctorLinks);
    }
    if (mismatchedNurseDoctorLinks.length > 0) {
      console.error(`\n❌ ACCOUNT CHECK FAILED: ${mismatchedNurseDoctorLinks.length} triage nurses have supervising doctors at different hospitals.\n`);
      console.table(mismatchedNurseDoctorLinks);
    }
    return {
      passed: false,
      inconsistencies,
      unlistedPractitioners,
      hospitalsWithoutAdmins,
      hospitalsWithoutTwoLinkedDoctors,
      mismatchedDoctorLinks,
      mismatchedNurseDoctorLinks,
      totalClaimsChecked,
    };
  }

  console.log('✓ PASS: All hospitals have active verified practitioners for 100% of claimed specialties.');
  console.log('✓ PASS: 100% of active verified practitioners belong to listed hospital specialties (reverse check passed).');
  console.log(`✓ PASS: All ${hospitals.length} hospitals have at least one hospital administrator.`);
  console.log('✓ PASS: Every hospital has at least two active verified practitioners linked to doctor users.');
  console.log('✓ PASS: Every linked doctor user has role=doctor and the same hospitalId as their practitioner.');
  console.log('✓ PASS: Every triage nurse hospitalId strictly matches all supervising doctors.');
  console.log('✓ Zero specialty/account consistency violations detected.\n');
  return {
    passed: true,
    inconsistencies: [],
    unlistedPractitioners: [],
    hospitalsWithoutAdmins: [],
    hospitalsWithoutTwoLinkedDoctors: [],
    mismatchedDoctorLinks: [],
    mismatchedNurseDoctorLinks: [],
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
