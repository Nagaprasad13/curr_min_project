const Hospital = require('../models/Hospital');
const Practitioner = require('../models/Practitioner');
const { syncHospitalSpecialists } = require('../services/practitionerService');
const { connectDB, disconnectDB } = require('../config/db');

// Realistic synthetic names across Tamil Nadu medical community
const DOCTOR_FIRST_NAMES = [
  'Karthik', 'Senthil', 'Meenakshi', 'Anand', 'Priyadarshini',
  'Saravanan', 'Balamurugan', 'Deepa', 'Venkatesh', 'Gayathri',
  'Subramanian', 'Nandhini', 'Aravind', 'Kavitha', 'Vijay',
  'Sangeetha', 'Manoj', 'Radhika', 'Dinesh', 'Uma',
];

const DOCTOR_LAST_NAMES = [
  'Ramasamy', 'Natarajan', 'Sundaram', 'Krishnan', 'Chandrasekar',
  'Balakrishnan', 'Swaminathan', 'Murugesan', 'Rajendran', 'Palaniappan',
  'Thirunavukkarasu', 'Annamalai', 'Shanmugam', 'Dhanasekaran', 'Periyasamy',
];

const SPECIALTY_QUALIFICATIONS = {
  'Cardiology': 'MBBS, MD (Gen Med), DM (Cardiology), FACC',
  'Pulmonology': 'MBBS, MD (Pulmonary Med), DNB (Resp Med)',
  'Neurology': 'MBBS, MD (Gen Med), DM (Neurology)',
  'Nephrology': 'MBBS, MD (Gen Med), DM (Nephrology)',
  'Emergency Medicine': 'MBBS, MD (Emergency Medicine), MRCEM',
  'General Surgery': 'MBBS, MS (General Surgery), FMAS',
  'Pediatrics': 'MBBS, MD (Pediatrics), DCH',
  'Orthopedics': 'MBBS, MS (Orthopedics), DNB (Ortho)',
  'Obstetrics & Gynecology': 'MBBS, MS (OBG), DGO',
  'Medical Oncology': 'MBBS, MD (Gen Med), DM (Medical Oncology)',
};

/**
 * Seeds synthetic practitioners for all hospitals in MongoDB.
 * Generates 3-12 practitioners per hospital strictly matching its tier & specialties.
 * Includes edge cases (unverified, on_leave) to exercise capability filters.
 * Then calls syncHospitalSpecialists() so hospital.specialists is derived.
 */
async function seedPractitioners(hospitalsList = null) {
  const hospitals = hospitalsList || await Hospital.find({});
  console.log(`Seeding practitioners for ${hospitals.length} hospitals across Tamil Nadu...`);

  await Practitioner.deleteMany({ isSynthetic: true });

  let practitionerSeq = 1001;
  const allDocs = [];

  for (const hospital of hospitals) {
    const specialties = hospital.specialties || [];
    const tier = hospital.tier || 'Tier 2';

    // 1. Ensure at least 1 verified active practitioner for every claimed specialty
    for (const specialty of specialties) {
      const qualification = SPECIALTY_QUALIFICATIONS[specialty] || 'MBBS, MD';
      const fName = DOCTOR_FIRST_NAMES[(practitionerSeq * 7) % DOCTOR_FIRST_NAMES.length];
      const lName = DOCTOR_LAST_NAMES[(practitionerSeq * 11) % DOCTOR_LAST_NAMES.length];
      const initial = String.fromCharCode(65 + ((practitionerSeq * 3) % 26));

      // Tier 1 gets 2 verified active specialists with 24x7 on-call
      const countForTier = tier === 'Tier 1' ? 2 : 1;

      for (let c = 0; c < countForTier; c++) {
        const pSeq = practitionerSeq++;
        const pId = `PRAC-2026-${String(pSeq).padStart(5, '0')}`;
        const regNum = `SYN-TNC-${String(pSeq).padStart(4, '0')}`;

        allDocs.push({
          practitionerId: pId,
          hospitalId: hospital._id,
          fullName: `Dr. ${initial}. ${fName} ${c > 0 ? '(Senior)' : ''} ${lName}`,
          qualification,
          specialty,
          registrationNumber: regNum,
          employmentStatus: 'active',
          availability: 'on_call_24x7',
          verificationStatus: 'verified',
          verifiedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
          lastConfirmedAt: new Date(),
          isSynthetic: true,
        });
      }
    }

    // 2. Add realistic edge-cases (unverified or on_leave practitioners)
    // Edge case 1: A practitioner who is on leave
    const leaveSpecialty = specialties[0] || 'General Surgery';
    const leaveSeq = practitionerSeq++;
    allDocs.push({
      practitionerId: `PRAC-2026-${String(leaveSeq).padStart(5, '0')}`,
      hospitalId: hospital._id,
      fullName: `Dr. S. Leave Specialist (${leaveSpecialty})`,
      qualification: SPECIALTY_QUALIFICATIONS[leaveSpecialty] || 'MBBS, MS',
      specialty: leaveSpecialty,
      registrationNumber: `SYN-TNC-${String(leaveSeq).padStart(4, '0')}`,
      employmentStatus: 'on_leave', // Inactive: should be excluded from derived count
      availability: 'unavailable',
      verificationStatus: 'verified',
      lastConfirmedAt: new Date(),
      isSynthetic: true,
    });

    // Edge case 2: A newly joined practitioner pending reviewer verification
    const pendingSpecialty = specialties[specialties.length - 1] || 'Emergency Medicine';
    const pendingSeq = practitionerSeq++;
    allDocs.push({
      practitionerId: `PRAC-2026-${String(pendingSeq).padStart(5, '0')}`,
      hospitalId: hospital._id,
      fullName: `Dr. R. Pending Specialist (${pendingSpecialty})`,
      qualification: SPECIALTY_QUALIFICATIONS[pendingSpecialty] || 'MBBS, MD',
      specialty: pendingSpecialty,
      registrationNumber: `SYN-TNC-${String(pendingSeq).padStart(4, '0')}`,
      employmentStatus: 'active',
      availability: 'shift_day',
      verificationStatus: 'pending_verification', // Unverified: should be excluded from derived count
      lastConfirmedAt: new Date(),
      isSynthetic: true,
    });
  }

  const inserted = await Practitioner.insertMany(allDocs);
  console.log(`✓ Inserted ${inserted.length} synthetic practitioners into MongoDB.`);

  // 3. Synchronize derived specialist counts for all hospitals
  console.log('Deriving hospital specialist counts from verified active practitioners...');
  for (const hospital of hospitals) {
    await syncHospitalSpecialists(hospital._id);
  }
  console.log('✓ All hospitals updated with derived specialist availability.');

  return inserted;
}

if (require.main === module) {
  connectDB().then(async () => {
    await seedPractitioners();
    await disconnectDB();
  }).catch(console.error);
}

module.exports = { seedPractitioners };
