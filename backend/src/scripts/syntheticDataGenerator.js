    /**
 * CareBridge Synthetic Data Generator (Updated for Phase 2)
 * Generates:
 * 1. 40 Synthetic Tamil Nadu Hospitals across districts (Salem, Erode, Coimbatore, Chennai, Madurai, Trichy, Vellore, Thanjavur, Tirunelveli, Dindigul)
 *    - Evaluated dynamically through classifyHospitalTier()
 *    - Realistic verification states: verified (30), pending (6), rejected (4)
 * 2. Realistic initial capacity telemetry records
 * 3. 500 Synthetic Referral Scenarios with ground-truth suitability sets
 * 4. Realistic Scheme catalogue (CMCHIS, PM-JAY)
 * 5. 5 Demo users: 2 hospital_admins, 1 platform_reviewer, 1 doctor, 1 patient
 * 
 * ALL DATA IS SYNTHETIC. RESEARCH PROTOTYPE ONLY.
 */

const { classifyHospitalTier } = require('../services/tierClassificationService');

// Tamil Nadu District Reference Centroids
const TN_DISTRICTS = [
  { name: 'Salem', lat: 11.6643, lon: 78.1460, region: 'Western' },
  { name: 'Erode', lat: 11.3410, lon: 77.7172, region: 'Western' },
  { name: 'Coimbatore', lat: 11.0168, lon: 76.9558, region: 'Western' },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707, region: 'Northern' },
  { name: 'Madurai', lat: 9.9252, lon: 78.1198, region: 'Southern' },
  { name: 'Tiruchirappalli', lat: 10.7905, lon: 78.7047, region: 'Central' },
  { name: 'Vellore', lat: 12.9165, lon: 79.1325, region: 'Northern' },
  { name: 'Thanjavur', lat: 10.7870, lon: 79.1378, region: 'Delta' },
  { name: 'Tirunelveli', lat: 8.7139, lon: 77.7567, region: 'Southern' },
  { name: 'Dindigul', lat: 10.3673, lon: 77.9803, region: 'Central' }
];

const SPECIALTY_LIST = [
  'Cardiology',
  'Pulmonology',
  'Neurology',
  'Nephrology',
  'Medical Oncology',
  'Emergency Medicine',
  'General Surgery',
  'Pediatrics',
  'Orthopedics',
  'Obstetrics & Gynecology'
];

/**
 * Deterministic pseudo-random number generator for reproducible seed data.
 */
function createSeededRandom(seed = 123456789) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

let rand = createSeededRandom(42);

/**
 * Calculates Haversine distance in kilometers between two lat/lon points.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Generates 40 synthetic hospitals across Tamil Nadu.
 * Each hospital runs through the pure classifyHospitalTier service.
 */
function generateSyntheticHospitals() {
  rand = createSeededRandom(42);
  const hospitals = [];

  const hospitalBlueprints = [
    // Salem (4)
    { district: 'Salem', name: 'Synthetic - Salem Government Mohan Kumaramangalam Medical College Hospital', ownership: 'government', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Salem', name: 'Synthetic - Salem Apex Heart & Critical Care Institute', ownership: 'private_corporate', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Salem', name: 'Synthetic - Salem Kongu Community Medical Center', ownership: 'private_trust', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Salem', name: 'Synthetic - Omalur Taluk Secondary Care Hospital', ownership: 'government', targetTier: 'Tier 3', status: 'verified' },

    // Erode (3)
    { district: 'Erode', name: 'Synthetic - Erode Cauvery Specialty Medical Institute', ownership: 'private_corporate', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Erode', name: 'Synthetic - Erode District Headquarters Hospital', ownership: 'government', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Erode', name: 'Synthetic - Bhavani Sub-District Hospital', ownership: 'government', targetTier: 'Tier 3', status: 'pending' },

    // Coimbatore (6)
    { district: 'Coimbatore', name: 'Synthetic - Kovai Apex Super Specialty Hospital & Research', ownership: 'private_corporate', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Coimbatore', name: 'Synthetic - Coimbatore Medical College Hospital', ownership: 'government', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Coimbatore', name: 'Synthetic - Western Ghats Pulmonology & Critical Care Center', ownership: 'private_trust', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Coimbatore', name: 'Synthetic - Pollachi Secondary Care Center', ownership: 'government', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Coimbatore', name: 'Synthetic - Mettupalayam Community Health Institute', ownership: 'private_trust', targetTier: 'Tier 3', status: 'verified' },
    { district: 'Coimbatore', name: 'Synthetic - Sulur Municipal Emergency Center', ownership: 'government', targetTier: 'Tier 3', status: 'rejected', rejectionReason: 'Failed mandatory fire safety compliance and critical oxygen backup audit.' },

    // Chennai (7)
    { district: 'Chennai', name: 'Synthetic - Madras Advanced Tertiary Institute of Medical Sciences', ownership: 'government', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Chennai', name: 'Synthetic - Chennai Metro Oncology & Neuro Super Specialty', ownership: 'private_corporate', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Chennai', name: 'Synthetic - Adyar Cardiac & Pulmonary Critical Care Trust', ownership: 'private_trust', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Chennai', name: 'Synthetic - Guindy Regional Trauma Care Center', ownership: 'government', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Chennai', name: 'Synthetic - Tambaram Secondary Hospital', ownership: 'private_trust', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Chennai', name: 'Synthetic - North Chennai Municipal Care Clinic', ownership: 'government', targetTier: 'Tier 3', status: 'verified' },
    { district: 'Chennai', name: 'Synthetic - Velachery Community Hospital', ownership: 'private_corporate', targetTier: 'Tier 3', status: 'pending' },

    // Madurai (5)
    { district: 'Madurai', name: 'Synthetic - Madurai Government Rajaji Super Specialty Wing', ownership: 'government', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Madurai', name: 'Synthetic - Meenakshi Regional Critical Care Hospital', ownership: 'private_corporate', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Madurai', name: 'Synthetic - Pandian Secondary Medical Trust', ownership: 'private_trust', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Madurai', name: 'Synthetic - Thirumangalam Sub-District Hospital', ownership: 'government', targetTier: 'Tier 3', status: 'verified' },
    { district: 'Madurai', name: 'Synthetic - Melur Community Clinic', ownership: 'government', targetTier: 'Tier 3', status: 'rejected', rejectionReason: 'Absence of registered Medical Officer on-duty during unannounced inspection.' },

    // Tiruchirappalli (4)
    { district: 'Tiruchirappalli', name: 'Synthetic - Tiruchirappalli Mahatma Gandhi Memorial Hospital', ownership: 'government', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Tiruchirappalli', name: 'Synthetic - Rockfort Advanced Multispecialty Center', ownership: 'private_corporate', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Tiruchirappalli', name: 'Synthetic - Srirangam Secondary Care Hospital', ownership: 'private_trust', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Tiruchirappalli', name: 'Synthetic - Manapparai Community Health Unit', ownership: 'government', targetTier: 'Tier 3', status: 'pending' },

    // Vellore (3)
    { district: 'Vellore', name: 'Synthetic - Vellore Regional Apex Healthcare Institute', ownership: 'private_trust', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Vellore', name: 'Synthetic - Vellore Government Pentland District Hospital', ownership: 'government', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Vellore', name: 'Synthetic - Ranipet Community Care Center', ownership: 'private_corporate', targetTier: 'Tier 3', status: 'verified' },

    // Thanjavur (3)
    { district: 'Thanjavur', name: 'Synthetic - Thanjavur Government Medical College Hospital', ownership: 'government', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Thanjavur', name: 'Synthetic - Delta Cauvery Multispecialty Hospital', ownership: 'private_trust', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Thanjavur', name: 'Synthetic - Kumbakonam Secondary Hospital', ownership: 'government', targetTier: 'Tier 2', status: 'pending' },

    // Tirunelveli (3)
    { district: 'Tirunelveli', name: 'Synthetic - Tirunelveli Apex Super Specialty Hospital', ownership: 'government', targetTier: 'Tier 1', status: 'verified' },
    { district: 'Tirunelveli', name: 'Synthetic - Nellai Southern Regional Care Trust', ownership: 'private_corporate', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Tirunelveli', name: 'Synthetic - Ambasamudram Community Hospital', ownership: 'government', targetTier: 'Tier 3', status: 'unverified' },

    // Dindigul (2)
    { district: 'Dindigul', name: 'Synthetic - Dindigul Rock Valley Specialty Hospital', ownership: 'private_trust', targetTier: 'Tier 2', status: 'verified' },
    { district: 'Dindigul', name: 'Synthetic - Palani Hills Secondary Care Hospital', ownership: 'government', targetTier: 'Tier 3', status: 'unverified' }
  ];

  hospitalBlueprints.forEach((bp, index) => {
    const code = `HOSP-TN-${String(index + 1).padStart(3, '0')}`;
    const registrationNumber = `CEA-TN-2026-${String(index + 1).padStart(3, '0')}`;
    const licenseNumber = `LIC-DHS-${String(index + 101).padStart(4, '0')}`;
    const distInfo = TN_DISTRICTS.find(d => d.name === bp.district) || TN_DISTRICTS[0];

    // Coordinate offset (+/- 0.015 - 0.05 degrees, ~2 to 6 km around district center)
    const latOffset = (rand() - 0.5) * 0.08;
    const lonOffset = (rand() - 0.5) * 0.08;
    const latitude = Math.round((distInfo.lat + latOffset) * 10000) / 10000;
    const longitude = Math.round((distInfo.lon + lonOffset) * 10000) / 10000;

    let specialties = [];
    let departments = [];
    let equipment = {};
    let bedCounts = {};
    let specialists = [];
    let has24x7Emergency = false;

    if (bp.targetTier === 'Tier 1') {
      // Tier 1 criteria: 24x7 emergency, ICU >= 20, vent >= 10, CT & MRI, Lab, OT >= 3, >= 8 specialties
      has24x7Emergency = true;
      specialties = [...SPECIALTY_LIST];
      departments = ['Emergency Medicine', 'Cardiology', 'Pulmonology', 'Neurology', 'Radiology', 'Pathology', 'General Surgery', 'Pediatrics'];
      equipment = {
        ventilators: { available: true, count: Math.floor(rand() * 20) + 15 }, // 15-34 >= 10
        ctScan: { available: true, count: Math.floor(rand() * 3) + 2 },
        mri: { available: true, count: Math.floor(rand() * 2) + 1 },
        xray: { available: true, count: 4 },
        ultrasound: { available: true, count: 3 },
        operationTheatres: { available: true, count: Math.floor(rand() * 4) + 4 }, // >= 4 >= 3
        bloodBank: { available: true, licenseValid: true },
        dialysis: { available: true, count: Math.floor(rand() * 15) + 10 },
        cardiacCathLab: { available: true, count: Math.floor(rand() * 2) + 1 },
        ecg: { available: true, count: 5 },
        echo: { available: true, count: 2 },
        strokeUnit: { available: true, count: 1 },
        endocrinologyLab: { available: true, count: 1 },
        lab: { available: true, level: 'advanced' },
      };
      bedCounts = {
        general: Math.floor(rand() * 250) + 250,
        emergency: Math.floor(rand() * 30) + 25,
        icu: Math.floor(rand() * 40) + 25, // 25-64 >= 20
        nicu: Math.floor(rand() * 15) + 10,
      };
      specialists = specialties.map(s => ({
        specialty: s,
        count: Math.floor(rand() * 4) + 2,
        onCall24x7: true,
      }));
    } else if (bp.targetTier === 'Tier 2') {
      // Tier 2 criteria: beds >= 30, Lab, Xray & Ultrasound, OT >= 1, >= 3 specialties
      has24x7Emergency = true;
      specialties = [
        'Emergency Medicine',
        'General Surgery',
        'Orthopedics',
        'Pediatrics',
        'Obstetrics & Gynecology',
        rand() > 0.4 ? 'Cardiology' : 'Pulmonology',
      ];
      departments = ['General Surgery', 'Pediatrics', 'Radiology', 'Laboratory', 'Emergency'];
      equipment = {
        ventilators: { available: true, count: Math.floor(rand() * 4) + 4 }, // 4-7 (< 10, so misses T1)
        ctScan: { available: rand() > 0.3, count: 1 },
        mri: { available: false, count: 0 }, // Misses T1
        xray: { available: true, count: 2 },
        ultrasound: { available: true, count: 2 },
        operationTheatres: { available: true, count: 2 }, // >= 1
        bloodBank: { available: true, licenseValid: true },
        dialysis: { available: rand() > 0.3, count: 4 },
        cardiacCathLab: { available: false, count: 0 },
        ecg: { available: true, count: 2 },
        echo: { available: true, count: 1 },
        strokeUnit: { available: false, count: 0 },
        endocrinologyLab: { available: false, count: 0 },
        lab: { available: true, level: 'advanced' },
      };
      bedCounts = {
        general: Math.floor(rand() * 80) + 70,
        emergency: Math.floor(rand() * 15) + 10,
        icu: Math.floor(rand() * 6) + 8, // 8-13 (< 20, misses T1)
        nicu: Math.floor(rand() * 6) + 4,
      };
      specialists = specialties.map(s => ({
        specialty: s,
        count: Math.floor(rand() * 2) + 1,
        onCall24x7: s === 'Emergency Medicine' || s === 'General Surgery',
      }));
    } else {
      // Tier 3 criteria: registered establishment
      has24x7Emergency = false;
      specialties = ['Emergency Medicine', 'General Surgery', 'Pediatrics'];
      departments = ['General Medicine', 'Outpatient'];
      equipment = {
        ventilators: { available: rand() > 0.5, count: 1 },
        ctScan: { available: false, count: 0 },
        mri: { available: false, count: 0 },
        xray: { available: false, count: 0 }, // Misses T2
        ultrasound: { available: false, count: 0 },
        operationTheatres: { available: false, count: 0 },
        bloodBank: { available: rand() > 0.5, licenseValid: true },
        dialysis: { available: false, count: 0 },
        cardiacCathLab: { available: false, count: 0 },
        ecg: { available: true, count: 1 },
        echo: { available: false, count: 0 },
        strokeUnit: { available: false, count: 0 },
        endocrinologyLab: { available: false, count: 0 },
        lab: { available: true, level: 'basic' },
      };
      bedCounts = {
        general: Math.floor(rand() * 15) + 15,
        emergency: 4,
        icu: 2,
        nicu: 0,
      };
      specialists = specialties.map(s => ({
        specialty: s,
        count: 1,
        onCall24x7: false,
      }));
    }

    // Scheme participation
    const schemeParticipation = [
      {
        schemeCode: 'CMCHIS',
        empaneled: bp.ownership === 'government' || rand() > 0.25,
        validUntil: new Date('2028-12-31'),
        specialtiesCovered: specialties.slice(0, 5),
      },
      {
        schemeCode: 'PM-JAY',
        empaneled: bp.ownership === 'government' || rand() > 0.4,
        validUntil: new Date('2028-12-31'),
        specialtiesCovered: specialties.slice(0, 4),
      }
    ];

    // Compliance Evidence Documents Metadata (stored outside MongoDB in protected storage)
    const evidenceDocuments = [
      {
        type: 'hospital_license',
        fileReference: `storage/evidence/lic_${code.toLowerCase()}.pdf`,
        originalFileName: `Tamil_Nadu_Clinical_Est_License_${code}.pdf`,
        fileSize: 142050,
        mimeType: 'application/pdf',
        uploadedAt: new Date('2026-01-10'),
      },
      {
        type: 'clinical_establishment_reg',
        fileReference: `storage/evidence/reg_${code.toLowerCase()}.pdf`,
        originalFileName: `Govt_Registration_Certificate_${registrationNumber}.pdf`,
        fileSize: 98450,
        mimeType: 'application/pdf',
        uploadedAt: new Date('2026-01-10'),
      }
    ];

    // Compile candidate hospital payload
    const candidateData = {
      name: bp.name,
      code,
      registrationNumber,
      licenseNumber,
      district: bp.district,
      state: 'Tamil Nadu',
      location: { latitude, longitude },
      address: `Ward ${Math.floor(rand() * 15) + 1}, Main Road, ${bp.district}, Tamil Nadu`,
      ownership: bp.ownership,
      has24x7Emergency,
      departments,
      specialties,
      specialists,
      equipment,
      bedCounts,
      schemeParticipation,
      evidenceDocuments,
      contact: {
        phone: `+91 44 ${Math.floor(rand() * 8999999 + 1000000)}`,
        email: `desk@${code.toLowerCase()}.tnhealth.synthetic`,
        emergencyHelpline: `108-${code.slice(-3)}`,
      },
      isSynthetic: true,
    };

    // RUN THE PURE RULE-BASED CLASSIFICATION FUNCTION
    const isVerified = bp.status === 'verified';
    const tierResult = classifyHospitalTier(candidateData, isVerified);

    const verificationHistory = [
      {
        action: 'INITIAL_REGISTRATION',
        fromState: 'none',
        toState: 'unverified',
        actorRole: 'hospital_admin',
        reason: 'Initial synthetic facility registration',
        timestamp: new Date('2026-01-10'),
      },
      {
        action: bp.status === 'verified' ? 'VERIFIED' : (bp.status === 'rejected' ? 'REJECTED' : 'SUBMITTED_FOR_VERIFICATION'),
        fromState: 'unverified',
        toState: bp.status,
        actorRole: bp.status === 'verified' ? 'platform_reviewer' : (bp.status === 'rejected' ? 'platform_reviewer' : 'hospital_admin'),
        reason: bp.rejectionReason || 'Compliance audit workflow action',
        timestamp: new Date('2026-01-15'),
      }
    ];

    hospitals.push({
      ...candidateData,
      verificationStatus: bp.status,
      verifiedAt: isVerified ? new Date('2026-01-15') : null,
      verifiedBy: isVerified ? 'Dr. K. Swaminathan (Platform Reviewer, TNHSP)' : null,
      rejectionReason: bp.rejectionReason || null,
      tier: tierResult.proposedTier,
      proposedTier: tierResult.proposedTier,
      tierStatus: tierResult.tierStatus,
      tierRationale: tierResult.rulesMet,
      tierDetails: {
        rulesMet: tierResult.rulesMet,
        rulesMissed: tierResult.rulesMissed,
        gapToNextTier: tierResult.gapToNextTier,
        computedAt: tierResult.computedAt,
        rulesVersion: tierResult.rulesVersion,
      },
      verificationHistory,
    });
  });

  return hospitals;
}

/**
 * Generates a synthetic practitioner roster independently of hospital specialist aggregates.
 */
function generateSyntheticPractitioners(hospitals) {
  let practitionerNumber = 1;

  return hospitals.flatMap(hospital => (hospital.specialties || []).map(specialty => {
    const registrationNumber = `SYN-TNC-${String(practitionerNumber).padStart(4, '0')}`;
    const practitioner = {
      practitionerId: `EVAL-PRAC-${String(practitionerNumber).padStart(4, '0')}`,
      hospitalId: hospital._id || hospital.code,
      fullName: `Synthetic Practitioner ${String(practitionerNumber).padStart(4, '0')}`,
      qualification: 'MBBS',
      specialty,
      registrationNumber,
      employmentStatus: 'active',
      availability: hospital.has24x7Emergency ? 'on_call_24x7' : 'shift_day',
      verificationStatus: hospital.verificationStatus === 'verified' ? 'verified' : 'pending_verification',
      isSynthetic: true,
    };
    practitionerNumber += 1;
    return practitioner;
  }));
}

/**
 * Generates initial capacity telemetry records for the 40 hospitals.
 */
function generateSyntheticCapacities(hospitals, referenceDate = new Date()) {
  const capacities = [];

  hospitals.forEach((hosp, idx) => {
    const isStaleTarget = idx >= 25;
    const ageMinutes = isStaleTarget
      ? Math.floor(rand() * 300) + 150
      : Math.floor(rand() * 45) + 10;

    const timestamp = new Date(referenceDate.getTime() - ageMinutes * 60 * 1000);

    const calcBeds = (total) => {
      if (!total || total === 0) return { total: 0, occupied: 0, available: 0, reportedStatus: 'unavailable' };
      const occupancyRate = 0.5 + rand() * 0.45;
      const occupied = Math.min(total, Math.floor(total * occupancyRate));
      const available = Math.max(0, total - occupied);
      return {
        total,
        occupied,
        available,
        reportedStatus: available > 0 ? 'available' : 'unavailable',
      };
    };

    capacities.push({
      hospitalCode: hosp.code,
      timestamp,
      stalenessThresholdMinutes: 120,
      beds: {
        general: calcBeds(hosp.bedCounts.general),
        emergency: calcBeds(hosp.bedCounts.emergency),
        icu: calcBeds(hosp.bedCounts.icu),
        ventilators: calcBeds(hosp.equipment.ventilators.count),
      },
      services: {
        emergencyDepartment: {
          reportedStatus: 'available',
          diversionActive: rand() > 0.9,
          note: 'Normal emergency intake',
        },
        cardiacCathLab: {
          reportedStatus: hosp.equipment.cardiacCathLab?.available ? 'available' : 'unavailable',
        },
        ctScan: {
          reportedStatus: hosp.equipment.ctScan?.available ? 'available' : 'unavailable',
        },
        dialysis: {
          reportedStatus: hosp.equipment.dialysis?.available ? 'available' : 'unavailable',
        },
        bloodBank: {
          reportedStatus: hosp.equipment.bloodBank?.available ? 'available' : 'unavailable',
        },
      },
      reportedBy: 'tn_telemetry_agent',
      isSynthetic: true,
      _seedMetadata: {
        initialAgeMinutes: ageMinutes,
        expectedStale: isStaleTarget,
      },
    });
  });

  return capacities;
}

/**
 * Generates 500 synthetic referral scenarios with pre-calculated ground truth.
 */
function generateSyntheticReferralScenarios(hospitals) {
  const scenarios = [];

  const CLINICAL_PROFILES = [
    {
      specialty: 'Cardiology',
      urgency: 'immediate',
      equipment: ['cardiacCathLab', 'ventilators'],
      provisionalDiagnosis: 'Acute ST-Elevation Myocardial Infarction (STEMI) with Cardiogenic Shock',
      complaints: ['Crushing substernal chest pain radiating to left jaw', 'Severe diaphoresis and dyspnea', 'Syncope with hypotension'],
      vitalsGen: () => ({ bpSystolic: 80, bpDiastolic: 50, heartRate: 122, respiratoryRate: 28, spo2: 89, gcs: 14, tempCelsius: 36.8 }),
      triageScore: 1,
    },
    {
      specialty: 'Pulmonology',
      urgency: 'immediate',
      equipment: ['ventilators'],
      provisionalDiagnosis: 'Severe Acute Respiratory Distress Syndrome (ARDS) secondary to Aspiration Pneumonia',
      complaints: ['Acute severe respiratory distress', 'Central cyanosis', 'Altered mental status'],
      vitalsGen: () => ({ bpSystolic: 110, bpDiastolic: 70, heartRate: 130, respiratoryRate: 34, spo2: 82, gcs: 12, tempCelsius: 38.9 }),
      triageScore: 1,
    },
    {
      specialty: 'Neurology',
      urgency: 'urgent',
      equipment: ['ctScan', 'ventilators'],
      provisionalDiagnosis: 'Acute Middle Cerebral Artery Ischemic Stroke within thrombolysis window',
      complaints: ['Sudden right hemiplegia and facial droop', 'Global aphasia since 90 minutes', 'Acute gaze palsy'],
      vitalsGen: () => ({ bpSystolic: 185, bpDiastolic: 105, heartRate: 88, respiratoryRate: 20, spo2: 95, gcs: 13, tempCelsius: 37.1 }),
      triageScore: 2,
    },
    {
      specialty: 'Nephrology',
      urgency: 'urgent',
      equipment: ['dialysis'],
      provisionalDiagnosis: 'End-Stage Renal Disease with Hyperkalemia (K+ 7.2) and Pulmonary Edema',
      complaints: ['Anuria for 48 hours', 'Severe orthopnea and bilateral pedal edema', 'Confusion and asterixis'],
      vitalsGen: () => ({ bpSystolic: 175, bpDiastolic: 100, heartRate: 64, respiratoryRate: 26, spo2: 91, gcs: 13, tempCelsius: 36.6 }),
      triageScore: 2,
    },
    {
      specialty: 'Orthopedics',
      urgency: 'urgent',
      equipment: ['ctScan', 'bloodBank'],
      provisionalDiagnosis: 'Polytrauma - Open Grade III Femur Fracture with Hemorrhagic Shock',
      complaints: ['High velocity road traffic collision', 'Active external hemorrhage', 'Gross pelvic instability'],
      vitalsGen: () => ({ bpSystolic: 85, bpDiastolic: 55, heartRate: 128, respiratoryRate: 24, spo2: 94, gcs: 14, tempCelsius: 36.2 }),
      triageScore: 2,
    },
    {
      specialty: 'Medical Oncology',
      urgency: 'urgent',
      equipment: ['bloodBank'],
      provisionalDiagnosis: 'Febrile Neutropenia with Severe Thrombocytopenia (Platelets 12k)',
      complaints: ['Spiking fevers and rigors post-chemotherapy', 'Petechiae and mucosal bleeding', 'Profound lethargy'],
      vitalsGen: () => ({ bpSystolic: 95, bpDiastolic: 60, heartRate: 115, respiratoryRate: 22, spo2: 96, gcs: 15, tempCelsius: 39.4 }),
      triageScore: 2,
    },
    {
      specialty: 'Emergency Medicine',
      urgency: 'immediate',
      equipment: ['ventilators', 'bloodBank'],
      provisionalDiagnosis: 'Severe Polytrauma with Tension Pneumothorax and Hemoperitoneum',
      complaints: ['Severe blunt thoracic and abdominal trauma', 'Tracheal deviation and absent breath sounds right', 'Cold clammy peripheries'],
      vitalsGen: () => ({ bpSystolic: 75, bpDiastolic: 45, heartRate: 140, respiratoryRate: 36, spo2: 84, gcs: 10, tempCelsius: 35.8 }),
      triageScore: 1,
    },
    {
      specialty: 'Pediatrics',
      urgency: 'urgent',
      equipment: ['ventilators'],
      provisionalDiagnosis: 'Severe Pediatric Bronchiolitis with Impending Respiratory Failure',
      complaints: ['Subcostal and intercostal retractions', 'Grunting respirations', 'Inability to feed and lethargy'],
      vitalsGen: () => ({ bpSystolic: 88, bpDiastolic: 54, heartRate: 172, respiratoryRate: 64, spo2: 88, gcs: 13, tempCelsius: 38.6 }),
      triageScore: 2,
    },
    {
      specialty: 'General Surgery',
      urgency: 'urgent',
      equipment: ['bloodBank'],
      provisionalDiagnosis: 'Perforated Viscus with Generalized Peritonitis and Septic Shock',
      complaints: ['Sudden generalized rigid abdomen', 'Severe rebound tenderness', 'Persistent bilious vomiting'],
      vitalsGen: () => ({ bpSystolic: 90, bpDiastolic: 58, heartRate: 118, respiratoryRate: 24, spo2: 94, gcs: 15, tempCelsius: 38.8 }),
      triageScore: 2,
    },
    {
      specialty: 'Obstetrics & Gynecology',
      urgency: 'immediate',
      equipment: ['bloodBank', 'ventilators'],
      provisionalDiagnosis: 'Eclampsia at 34 Weeks Gestation with HELLP Syndrome',
      complaints: ['Generalized tonic-clonic seizures in pregnancy', 'Severe epigastric pain and headache', 'Marked visual disturbances'],
      vitalsGen: () => ({ bpSystolic: 190, bpDiastolic: 120, heartRate: 112, respiratoryRate: 24, spo2: 93, gcs: 11, tempCelsius: 37.4 }),
      triageScore: 1,
    }
  ];

  for (let i = 1; i <= 500; i++) {
    const profile = CLINICAL_PROFILES[(i - 1) % CLINICAL_PROFILES.length];
    const distInfo = TN_DISTRICTS[(i - 1) % TN_DISTRICTS.length];

    const pLat = Math.round((distInfo.lat + (rand() - 0.5) * 0.3) * 10000) / 10000;
    const pLon = Math.round((distInfo.lon + (rand() - 0.5) * 0.3) * 10000) / 10000;

    const preferredScheme = (i % 3 === 0) ? 'CMCHIS' : (i % 4 === 0 ? 'PM-JAY' : null);

    // Compute ground-truth suitable hospitals:
    // MUST meet:
    // 1. verificationStatus === 'verified'
    // 2. has requiredSpecialty
    // 3. has all required equipment with available=true and count>0 (or licenseValid for bloodBank)
    const suitableHospitals = hospitals.filter(h => {
      if (h.verificationStatus !== 'verified') return false;
      if (!h.specialties.includes(profile.specialty)) return false;

      for (const eqKey of profile.equipment) {
        if (eqKey === 'bloodBank') {
          if (!h.equipment.bloodBank || !h.equipment.bloodBank.available) return false;
        } else {
          const eqObj = h.equipment[eqKey];
          if (!eqObj || !eqObj.available || eqObj.count < 1) return false;
        }
      }

      return true;
    }).map(h => {
      const dist = haversineDistance(pLat, pLon, h.location.latitude, h.location.longitude);
      const participatesScheme = preferredScheme
        ? h.schemeParticipation.some(sp => sp.schemeCode === preferredScheme && sp.empaneled)
        : true;

      return {
        hospitalCode: h.code,
        hospitalName: h.name,
        district: h.district,
        tier: h.tier,
        distanceKm: dist,
        participatesScheme,
      };
    });

    suitableHospitals.sort((a, b) => {
      const tierRank = { 'Tier 1': 1, 'Tier 2': 2, 'Tier 3': 3 };
      if (tierRank[a.tier] !== tierRank[b.tier]) {
        return tierRank[a.tier] - tierRank[b.tier];
      }
      return a.distanceKm - b.distanceKm;
    });

    const vitals = profile.vitalsGen();

    scenarios.push({
      scenarioIndex: i,
      referralId: `REF-SCN-${String(i).padStart(3, '0')}`,
      patientSummary: {
        age: Math.floor(rand() * 70) + 10,
        gender: i % 2 === 0 ? 'female' : 'male',
        chiefComplaint: profile.complaints[i % profile.complaints.length],
        provisionalDiagnosis: profile.provisionalDiagnosis,
        vitals,
        triageSeverity: {
          score: profile.triageScore,
          category: profile.urgency,
          predictedBy: 'clinical_rule',
          highRiskProbability: profile.triageScore === 1 ? 0.92 : 0.68,
        },
      },
      requirements: {
        requiredSpecialty: profile.specialty,
        urgency: profile.urgency,
        requiredEquipment: profile.equipment,
        patientCoordinates: {
          latitude: pLat,
          longitude: pLon,
          district: distInfo.name,
        },
        preferredScheme,
      },
      groundTruthSuitableHospitalCodes: suitableHospitals.map(s => s.hospitalCode),
      groundTruthSuitableDetails: suitableHospitals,
      groundTruthCount: suitableHospitals.length,
      isSynthetic: true,
    });
  }

  return scenarios;
}

/**
 * Generates official scheme catalogue entries for Tamil Nadu.
 */
function generateSchemeCatalogue() {
  return [
    {
      schemeCode: 'CMCHIS',
      name: "Chief Minister's Comprehensive Health Insurance Scheme (CMCHIS) - Tamil Nadu",
      authority: 'Government of Tamil Nadu / United India Insurance',
      officialUrl: 'https://cmchistn.com',
      lastVerifiedDate: new Date('2026-03-01'),
      summary: 'State health assurance scheme providing up to ₹5,00,000 per family per year for secondary and tertiary inpatient procedures across empaneled network hospitals in Tamil Nadu.',
      disclaimer: 'Potential match, verify eligibility. Emblemed referral requires pre-authorization through the hospital insurance desk and valid smart ration card verification.',
      eligibleBeneficiariesDescription: 'Families residing in Tamil Nadu with annual family income below specified threshold or designated vulnerable groups with valid CMCHIS Smart Card.',
      coveredSpecialties: [
        'Cardiology',
        'Pulmonology',
        'Neurology',
        'Nephrology',
        'Medical Oncology',
        'General Surgery',
        'Pediatrics',
        'Orthopedics',
        'Obstetrics & Gynecology'
      ],
      annualCoverageInr: 500000,
      isSynthetic: false,
    },
    {
      schemeCode: 'PM-JAY',
      name: 'Ayushman Bharat - Pradhan Mantri Jan Arogya Yojana (AB PM-JAY)',
      authority: 'National Health Authority (NHA) / State Health Agency Tamil Nadu',
      officialUrl: 'https://pmjay.gov.in',
      lastVerifiedDate: new Date('2026-03-01'),
      summary: 'Centrally sponsored health protection scheme offering coverage up to ₹5,00,000 per eligible family per year for secondary and tertiary care hospitalization.',
      disclaimer: 'Potential match, verify eligibility. Eligibility is governed by SECC 2011 criteria and requires biometric e-KYC authentication at the hospital Ayushman Mitra kiosk.',
      eligibleBeneficiariesDescription: 'Deprived rural families and identified occupational categories of urban workers based on Socio-Economic Caste Census (SECC) database.',
      coveredSpecialties: [
        'Cardiology',
        'Neurology',
        'Nephrology',
        'Medical Oncology',
        'General Surgery',
        'Pediatrics',
        'Orthopedics'
      ],
      annualCoverageInr: 500000,
      isSynthetic: false,
    }
  ];
}

/**
 * Generates demo user accounts for all required roles:
 * - 2 hospital_admins
 * - 1 platform_reviewer
 * - 1 doctor
 * - 1 patient
 */
function generateSyntheticUsers(hospitals) {
  const kovaiHosp = hospitals.find(h => h.district === 'Coimbatore' && h.code === 'HOSP-TN-008') || hospitals[0];
  const salemHosp = hospitals.find(h => h.district === 'Salem' && h.code === 'HOSP-TN-001') || hospitals[1];

  return [
    {
      name: 'Admin - Kovai Apex Super Specialty Hospital',
      email: 'admin.kovai@carebridge.invalid',
      role: 'hospital_admin',
      hospitalCode: kovaiHosp.code,
      phone: '+91 98422 78901',
      district: 'Coimbatore',
      isSynthetic: true,
    },
    {
      name: 'Admin - Salem Mohan Kumaramangalam Hospital',
      email: 'admin.salem@carebridge.invalid',
      role: 'hospital_admin',
      hospitalCode: salemHosp.code,
      phone: '+91 94431 11223',
      district: 'Salem',
      isSynthetic: true,
    },
    {
      name: 'Dr. K. Swaminathan (Platform Quality Reviewer)',
      email: 'reviewer@carebridge.invalid',
      role: 'platform_reviewer',
      phone: '+91 94420 99887',
      district: 'Chennai',
      isSynthetic: true,
    },
    {
      name: 'Dr. S. Sundaram, MD (Referring Pulmonologist)',
      email: 'doctor@carebridge.invalid',
      role: 'doctor',
      hospitalCode: salemHosp.code,
      phone: '+91 94431 23456',
      district: 'Salem',
      isSynthetic: true,
    },
    {
      name: 'M. Anandhi (Patient Representative)',
      email: 'patient@carebridge.invalid',
      role: 'patient',
      phone: '+91 97890 45678',
      district: 'Erode',
      isSynthetic: true,
    }
  ];
}

module.exports = {
  TN_DISTRICTS,
  SPECIALTY_LIST,
  haversineDistance,
  generateSyntheticHospitals,
  generateSyntheticPractitioners,
  generateSyntheticCapacities,
  generateSyntheticReferralScenarios,
  generateSchemeCatalogue,
  generateSyntheticUsers,
};
