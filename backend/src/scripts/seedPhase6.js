const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const {
  ensureCredential,
  loadSeedCredentials,
  writeSeedCredentials,
} = require('./seedHospitalAccounts');
const PatientRecord = require('../models/PatientRecord');
const Scheme = require('../models/Scheme');
const Consent = require('../models/Consent');
const { saveRecordContent } = require('../services/recordStorageService');
const { connectDB, disconnectDB } = require('../config/db');

/**
 * Verified Official Scheme Definitions (Checked against official state & central portals on 2026-10-13)
 */
function getOfficialSchemeSeedData() {
  return [
    {
      schemeId: 'CMCHIS',
      schemeCode: 'CMCHIS',
      name: "Chief Minister's Comprehensive Health Insurance Scheme (CMCHIS) - Tamil Nadu",
      authority: 'Government of Tamil Nadu / United India Insurance',
      shortDescription: 'State welfare scheme offering health assurance coverage up to ₹5,00,000 per family per year on a family-floater basis across empanelled network hospitals in Tamil Nadu.',
      summary: 'State welfare scheme offering health assurance coverage up to ₹5,00,000 per family per year.',
      eligibilityCriteria: [
        {
          criterion: 'Resident of Tamil Nadu (verified via Smart Family Ration Card or VAO certificate)',
          sourceUrl: 'https://cmchistn.com',
          isConfirmed: true,
          fieldKey: 'stateResident',
          thresholdValue: true,
          verificationNote: 'Confirmed on official portal cmchistn.com on 2026-10-13',
        },
        {
          criterion: 'Annual family income less than ₹1,20,000 per year (certified by revenue authority)',
          sourceUrl: 'https://cmchistn.com',
          isConfirmed: true,
          fieldKey: 'annualFamilyIncome',
          thresholdValue: 120000,
          verificationNote: 'Updated threshold of ₹1.2 lakh confirmed from Tamil Nadu Health Department notification (checked 2026-10-13)',
        },
        {
          criterion: 'Eligible family members listed on the official Tamil Nadu Family Ration Card',
          sourceUrl: 'https://cmchistn.com',
          isConfirmed: true,
          fieldKey: 'rationCardRegistered',
          thresholdValue: true,
          verificationNote: 'Confirmed: family floater covers spouse, children, and dependent parents listed on the card',
        },
        {
          criterion: 'TO VERIFY: Specific specialized procedures exceeding ₹5 lakh requiring special corpus approval',
          sourceUrl: 'https://cmchistn.com',
          isConfirmed: false,
          fieldKey: 'corpusExtension',
          thresholdValue: null,
          verificationNote: 'Exact high-end procedure package list updates to be re-verified from current government gazette',
        },
      ],
      requiredDocuments: [
        'Tamil Nadu Family Smart Ration Card',
        'Income Certificate issued by Revenue Authorities / VAO (< ₹1,20,000/yr)',
        'Aadhaar Card for each family member',
        'Pre-authorization request from empanelled hospital insurance desk',
      ],
      coveredTreatmentNotes: 'Secondary and tertiary inpatient medical & surgical care, diagnostic packages, and specified day-care procedures.',
      participatingHospitalInfo: 'hospital-reported, verify with scheme',
      officialApplicationUrl: 'https://cmchistn.com',
      officialUrl: 'https://cmchistn.com',
      helplineInfo: 'CMCHIS Toll-Free Helpline: 1800 425 3993',
      sourceUrls: [
        'https://cmchistn.com',
        'https://tnhealth.tn.gov.in',
      ],
      lastVerifiedDate: new Date('2026-10-13'),
      status: 'verified',
      rulesVersion: '2026.1',
      notice: 'This is a possible match only, not confirmed eligibility. Eligibility, coverage and hospital participation must be confirmed with the scheme authority or the hospital. Coverage or free treatment is never guaranteed.',
      disclaimer: 'This is a possible match only, not confirmed eligibility. Eligibility, coverage and hospital participation must be confirmed with the scheme authority or the hospital. Coverage or free treatment is never guaranteed.',
      coveredSpecialties: ['Cardiology', 'Pulmonology', 'Neurology', 'Nephrology', 'Medical Oncology', 'General Surgery', 'Pediatrics', 'Orthopedics'],
      annualCoverageInr: 500000,
      isSynthetic: false,
    },
    {
      schemeId: 'PM-JAY',
      schemeCode: 'PM-JAY',
      name: 'Ayushman Bharat - Pradhan Mantri Jan Arogya Yojana (AB PM-JAY)',
      authority: 'National Health Authority (NHA) / MoHFW, Government of India',
      shortDescription: 'Centrally sponsored health assurance scheme providing ₹5,00,000 per family per year for secondary and tertiary care hospitalization to bottom 40% vulnerable population.',
      summary: 'Centrally sponsored health assurance scheme providing ₹5,00,000 per family per year.',
      eligibilityCriteria: [
        {
          criterion: 'Deprived rural households or identified urban occupational categories mapped under SECC 2011 database',
          sourceUrl: 'https://pmjay.gov.in',
          isConfirmed: true,
          fieldKey: 'seccDeprivationCategory',
          thresholdValue: true,
          verificationNote: 'Confirmed from NHA guidelines on 2026-10-13: D1-D7 rural deprivation and 11 urban worker categories',
        },
        {
          criterion: 'All Senior Citizens aged 70 years and above irrespective of economic status (expanded provision)',
          sourceUrl: 'https://beneficiary.nha.gov.in',
          isConfirmed: true,
          fieldKey: 'age70PlusProvision',
          thresholdValue: 70,
          verificationNote: 'Confirmed via official Union Cabinet expansion notifications (checked 2026-10-13)',
        },
        {
          criterion: 'Biometric / OTP Aadhaar e-KYC completed at Common Service Centre (CSC) or Ayushman Mitra kiosk',
          sourceUrl: 'https://beneficiary.nha.gov.in',
          isConfirmed: true,
          fieldKey: 'eKycCompleted',
          thresholdValue: true,
          verificationNote: 'Confirmed on beneficiary.nha.gov.in (checked 2026-10-13)',
        },
        {
          criterion: 'TO VERIFY: State-specific convergence package matching between CMCHIS and PM-JAY in Tamil Nadu',
          sourceUrl: 'https://pmjay.gov.in',
          isConfirmed: false,
          fieldKey: 'stateConvergenceSchedule',
          thresholdValue: null,
          verificationNote: 'State Health Agency Tamil Nadu dual-card package rates change periodically; requires verification',
        },
      ],
      requiredDocuments: [
        'Aadhaar Card (mandatory for authentication)',
        'Ration Card / PM-JAY Family ID / Ration card showing household linkage',
        'Active mobile number linked to Aadhaar',
      ],
      coveredTreatmentNotes: 'Secondary and tertiary hospitalization, medicines, diagnostics, and up to 15 days post-hospitalization follow-up.',
      participatingHospitalInfo: 'hospital-reported, verify with scheme',
      officialApplicationUrl: 'https://beneficiary.nha.gov.in',
      officialUrl: 'https://pmjay.gov.in',
      helplineInfo: 'National Health Authority Toll-Free: 14555',
      sourceUrls: [
        'https://pmjay.gov.in',
        'https://beneficiary.nha.gov.in',
      ],
      lastVerifiedDate: new Date('2026-10-13'),
      status: 'verified',
      rulesVersion: '2026.1',
      notice: 'This is a possible match only, not confirmed eligibility. Eligibility, coverage and hospital participation must be confirmed with the scheme authority or the hospital. Coverage or free treatment is never guaranteed.',
      disclaimer: 'This is a possible match only, not confirmed eligibility. Eligibility, coverage and hospital participation must be confirmed with the scheme authority or the hospital. Coverage or free treatment is never guaranteed.',
      coveredSpecialties: ['Cardiology', 'Neurology', 'Nephrology', 'Medical Oncology', 'General Surgery', 'Pediatrics', 'Orthopedics'],
      annualCoverageInr: 500000,
      isSynthetic: false,
    },
    {
      schemeId: 'RAN',
      schemeCode: 'RAN',
      name: 'Rashtriya Arogya Nidhi (RAN)',
      authority: 'Ministry of Health and Family Welfare (MoHFW), Government of India',
      shortDescription: 'One-time financial assistance grant up to ₹15,00,000 for Below Poverty Line (BPL) patients suffering from major life-threatening diseases receiving treatment in Government super-speciality hospitals.',
      summary: 'One-time financial assistance grant up to ₹15,00,000 for BPL patients in Government hospitals.',
      eligibilityCriteria: [
        {
          criterion: 'Patients living Below Poverty Line (BPL) certified by state revenue authorities',
          sourceUrl: 'https://mohfw.gov.in',
          isConfirmed: true,
          fieldKey: 'bplStatus',
          thresholdValue: true,
          verificationNote: 'Confirmed from MoHFW RAN Scheme Guidelines (checked 2026-10-13)',
        },
        {
          criterion: 'Suffering from major life-threatening disease (cardiology, oncology, nephrology, liver diseases)',
          sourceUrl: 'https://mohfw.gov.in',
          isConfirmed: true,
          fieldKey: 'lifeThreateningIllness',
          thresholdValue: true,
          verificationNote: 'Confirmed from MoHFW Technical Committee Guidelines (checked 2026-10-13)',
        },
        {
          criterion: 'Treatment strictly in participating Government super-speciality hospitals / Regional Cancer Centres (Private hospitals not eligible)',
          sourceUrl: 'https://mohfw.gov.in',
          isConfirmed: true,
          fieldKey: 'hospitalTypeGovernment',
          thresholdValue: 'government',
          verificationNote: 'Confirmed: grants disbursed directly to Government Medical Superintendent (checked 2026-10-13)',
        },
        {
          criterion: 'TO VERIFY: Specific state revolving fund spending caps and fast-track clearance thresholds',
          sourceUrl: 'https://mohfw.gov.in',
          isConfirmed: false,
          fieldKey: 'revolvingFundLimits',
          thresholdValue: null,
          verificationNote: 'Current revolving fund emergency allocation per central hospital (₹2-5 Lakh) to be re-verified with MoHFW circular',
        },
      ],
      requiredDocuments: [
        'Prescribed RAN Application Form countersigned by treating Head of Department and Medical Superintendent',
        'Official Cost Estimation Certificate from treating Government Hospital',
        'BPL Card / Income Certificate from Competent Revenue Authority',
        'Aadhaar Card / Ration Card copy',
      ],
      coveredTreatmentNotes: 'One-time grant up to ₹15 Lakh for life-saving surgery, implants, and chemotherapy in Government institutions.',
      participatingHospitalInfo: 'hospital-reported, verify with scheme (participating Government hospitals only)',
      officialApplicationUrl: 'https://mohfw.gov.in',
      officialUrl: 'https://mohfw.gov.in',
      helplineInfo: 'MoHFW Central Helpdesk: 011-23061439',
      sourceUrls: [
        'https://mohfw.gov.in',
        'https://myscheme.gov.in/schemes/ran',
      ],
      lastVerifiedDate: new Date('2026-10-13'),
      status: 'verified',
      rulesVersion: '2026.1',
      notice: 'This is a possible match only, not confirmed eligibility. Eligibility, coverage and hospital participation must be confirmed with the scheme authority or the hospital. Coverage or free treatment is never guaranteed.',
      disclaimer: 'This is a possible match only, not confirmed eligibility. Eligibility, coverage and hospital participation must be confirmed with the scheme authority or the hospital. Coverage or free treatment is never guaranteed.',
      coveredSpecialties: ['Cardiology', 'Nephrology', 'Medical Oncology', 'General Surgery'],
      annualCoverageInr: 1500000,
      isSynthetic: false,
    },
  ];
}

/**
 * 10 Synthetic Patient Profiles across Tamil Nadu districts
 */
const SYNTHETIC_PATIENTS = [
  { name: 'Kavitha R.', email: 'patient.kavitha@carebridge.synthetic', district: 'Salem', age: 48, gender: 'female', phone: '+91 94421 11001' },
  { name: 'Murugan P.', email: 'patient.murugan@carebridge.synthetic', district: 'Salem', age: 62, gender: 'male', phone: '+91 94421 11002' },
  { name: 'Anitha S.', email: 'patient.anitha@carebridge.synthetic', district: 'Erode', age: 34, gender: 'female', phone: '+91 94421 11003' },
  { name: 'Ramasamy K.', email: 'patient.ramasamy@carebridge.synthetic', district: 'Erode', age: 72, gender: 'male', phone: '+91 94421 11004' },
  { name: 'Priya M.', email: 'patient.priya@carebridge.synthetic', district: 'Coimbatore', age: 29, gender: 'female', phone: '+91 94421 11005' },
  { name: 'Chandran T.', email: 'patient.chandran@carebridge.synthetic', district: 'Coimbatore', age: 55, gender: 'male', phone: '+91 94421 11006' },
  { name: 'Deepa V.', email: 'patient.deepa@carebridge.synthetic', district: 'Dindigul', age: 41, gender: 'female', phone: '+91 94421 11007' },
  { name: 'Senthil N.', email: 'patient.senthil@carebridge.synthetic', district: 'Tiruchirappalli', age: 65, gender: 'male', phone: '+91 94421 11008' },
  { name: 'Lakshmi G.', email: 'patient.lakshmi@carebridge.synthetic', district: 'Madurai', age: 51, gender: 'female', phone: '+91 94421 11009' },
  { name: 'Ganesan B.', email: 'patient.ganesan@carebridge.synthetic', district: 'Vellore', age: 38, gender: 'male', phone: '+91 94421 11010' },
];

/**
 * Clinical Record Templates
 */
const RECORD_TEMPLATES = [
  {
    type: 'lab_report',
    title: 'Complete Blood Count (CBC) & Serum Electrolytes',
    sensitivityLevel: 'normal',
    ageMonthsAgo: 1, // Fresh
    content: {
      investigation: 'Complete Blood Count (CBC)',
      parameters: { hemoglobin: '11.8 g/dL', wbc: '7,400 /mcL', platelets: '240,000 /mcL', potassium: '4.1 mmol/L', sodium: '138 mmol/L' },
      interpretation: 'Normal range hematological parameters.',
    },
  },
  {
    type: 'lab_report',
    title: 'Comprehensive Metabolic Panel & HbA1c',
    sensitivityLevel: 'normal',
    ageMonthsAgo: 14, // 14 months old -> triggers warning!
    content: {
      investigation: 'HbA1c & Fasting Blood Glucose',
      parameters: { hba1c: '8.4 % (Elevated)', fastingBloodGlucose: '168 mg/dL', creatinine: '1.0 mg/dL' },
      interpretation: 'Suboptimal glycemic control. Clinical review indicated.',
    },
  },
  {
    type: 'imaging_report',
    title: 'High Resolution Computed Tomography (HRCT) Chest',
    sensitivityLevel: 'normal',
    ageMonthsAgo: 3,
    content: {
      modality: 'HRCT Chest (64-slice)',
      findings: 'Bilateral basal ground glass opacities with subpleural reticulation, consistent with chronic interstitial changes.',
      recommendation: 'Pulmonology follow-up and pulmonary function testing recommended.',
    },
  },
  {
    type: 'prescription',
    title: 'Maintenance Pharmacotherapy - Dual Inhaler & Antihypertensive',
    sensitivityLevel: 'normal',
    ageMonthsAgo: 2,
    content: {
      medications: [
        { name: 'Budesonide + Formoterol Inhaler', dosage: '200/6 mcg', frequency: '2 puffs BID' },
        { name: 'Amlodipine', dosage: '5 mg', frequency: 'Once daily morning' },
        { name: 'Metformin', dosage: '500 mg', frequency: 'Twice daily post-meals' },
      ],
      prescribedDurationDays: 90,
    },
  },
  {
    type: 'discharge_summary',
    title: 'Inpatient Care Summary - Acute Exacerbation of Bronchial Asthma',
    sensitivityLevel: 'normal',
    ageMonthsAgo: 8, // 8 months old -> triggers warning!
    content: {
      admissionDate: '2026-02-10',
      dischargeDate: '2026-02-15',
      primaryDiagnosis: 'Severe Acute Asthma Exacerbation (ICD-10 J45.901)',
      courseInHospital: 'Patient managed with IV corticosteroids, nebulized bronchodilators, and supplemental oxygen. Stabilized and discharged on maintenance inhalers.',
      dischargeCondition: 'Clinically stable, SpO2 98% on room air.',
    },
  },
  {
    type: 'diagnosis',
    title: 'Clinical Diagnosis - Type 2 Diabetes Mellitus with Peripheral Neuropathy',
    sensitivityLevel: 'normal',
    ageMonthsAgo: 11, // 11 months old -> triggers warning!
    content: {
      icd10: 'E11.40',
      description: 'Type 2 diabetes mellitus with diabetic neuropathy, unspecified',
      clinicalNotes: 'Diminished vibratory sensation in bilateral lower extremities. Monofilament test abnormal.',
    },
  },
  {
    type: 'allergy',
    title: 'Severe Drug Allergy - Cephalosporins & Penicillins',
    sensitivityLevel: 'normal',
    ageMonthsAgo: 24, // 24 months old -> triggers warning!
    content: {
      allergen: 'Beta-lactam antibiotics (Amoxicillin, Cefixime)',
      reactionType: 'Anaphylactoid urticaria and bronchospasm',
      severity: 'Critical / Life-threatening',
      contraindicatedMedications: ['Penicillins', 'Cephalosporins'],
    },
  },
  {
    type: 'imaging_report',
    title: '2D Echocardiography & Doppler Study',
    sensitivityLevel: 'normal',
    ageMonthsAgo: 5,
    content: {
      modality: 'Transthoracic Echocardiogram',
      findings: 'Left ventricular ejection fraction (LVEF) 55%. Normal chamber dimensions. Mild grade-I diastolic dysfunction.',
      conclusion: 'Preserved systolic function.',
    },
  },
  // Sensitive record templates (requires explicit consent flag)
  {
    type: 'diagnosis',
    title: 'Psychiatric Evaluation - Major Depressive Disorder in Partial Remission',
    sensitivityLevel: 'sensitive',
    sensitiveCategory: 'mental_health',
    ageMonthsAgo: 4,
    content: {
      specialty: 'Psychiatry & Behavioral Health',
      icd10: 'F32.1',
      assessment: 'Moderate major depressive disorder undergoing outpatient cognitive therapy and SSRI pharmacotherapy.',
      clinicalNotice: 'Protected mental health record. Excluded from general record sharing without explicit consent flag.',
    },
  },
  {
    type: 'lab_report',
    title: 'Confirmatory Retroviral Screening (ELISA HIV 1 & 2)',
    sensitivityLevel: 'sensitive',
    sensitiveCategory: 'hiv',
    ageMonthsAgo: 6,
    content: {
      investigation: 'HIV-1 and HIV-2 Antibody / p24 Antigen Screen',
      result: 'Non-Reactive (Negative)',
      methodology: '4th Generation Chemiluminescence Immunoassay',
      clinicalNotice: 'Protected sensitive diagnostic marker. Requires affirmative statutory consent.',
    },
  },
];

/**
 * Seeds Phase 6 synthetic records, 2 hospitals, 10 patients, and official schemes.
 */
async function seedPhase6(
  hospitals = null,
  seedCredentials = loadSeedCredentials(),
  credentialsPath
) {
  console.log('--- Phase 6 Seed: Consent Record Sharing & Scheme Catalogue ---');

  // 1. Ensure 2 simulated hospitals exist (Hospital A and Hospital B)
  let hospA = await Hospital.findOne({ district: 'Coimbatore', isSynthetic: true });
  let hospB = await Hospital.findOne({ district: 'Salem', isSynthetic: true });

  if (!hospA) {
    hospA = await new Hospital({
      name: 'Synthetic - Kovai Apex Super Specialty Hospital (Hospital A)',
      code: 'HOSP-SIM-A',
      district: 'Coimbatore',
      location: { latitude: 11.0168, longitude: 76.9558 },
      ownership: 'private_corporate',
      verificationStatus: 'verified',
      tier: 'Tier 1',
      specialties: ['Cardiology', 'Pulmonology', 'Neurology', 'Nephrology', 'Medical Oncology'],
      isSynthetic: true,
    }).save();
  }

  if (!hospB) {
    hospB = await new Hospital({
      name: 'Synthetic - Salem Mohan Kumaramangalam Medical College Hospital (Hospital B)',
      code: 'HOSP-SIM-B',
      district: 'Salem',
      location: { latitude: 11.6643, longitude: 78.1460 },
      ownership: 'government',
      verificationStatus: 'verified',
      tier: 'Tier 1',
      specialties: ['Cardiology', 'Pulmonology', 'Emergency Medicine', 'General Surgery'],
      isSynthetic: true,
    }).save();
  }

  console.log(`✓ Simulated Hospital A: ${hospA.name} (${hospA.code})`);
  console.log(`✓ Simulated Hospital B: ${hospB.name} (${hospB.code})`);

  // 2. Seed 10 Synthetic Patients
  const createdPatients = [];

  for (const p of SYNTHETIC_PATIENTS) {
    let patientDoc = await User.findOne({ email: p.email });
    const password = ensureCredential(seedCredentials, {
      name: p.name,
      email: p.email,
      role: 'patient',
      district: p.district,
    });
    if (!patientDoc) {
      patientDoc = new User({
        name: p.name,
        email: p.email,
        role: 'patient',
        district: p.district,
        phone: p.phone,
        isSynthetic: true,
      });
    }
    patientDoc.password = password;
    patientDoc.isSynthetic = true;
    await patientDoc.save();
    writeSeedCredentials(seedCredentials, credentialsPath);
    createdPatients.push(patientDoc);
  }
  console.log(`✓ Seeded ${createdPatients.length} synthetic patient accounts.`);

  // 3. Seed 5-15 clinical records per patient
  await PatientRecord.deleteMany({ isSynthetic: true });
  let totalRecordsCreated = 0;

  for (let i = 0; i < createdPatients.length; i++) {
    const patient = createdPatients[i];
    // Each patient gets 6-10 clinical records
    const numRecords = 7 + (i % 4);

    for (let r = 0; r < numRecords; r++) {
      const template = RECORD_TEMPLATES[r % RECORD_TEMPLATES.length];
      const sourceHospital = (r % 2 === 0) ? hospA : hospB;
      const recordId = uuidv4();

      // Compute past record date based on template ageMonthsAgo
      const recordDate = new Date(Date.now() - template.ageMonthsAgo * 30.4375 * 24 * 60 * 60 * 1000);

      // Save file content in protected storage
      const payload = {
        recordId,
        patientName: patient.name,
        patientId: patient._id.toString(),
        sourceHospital: sourceHospital.name,
        sourceHospitalCode: sourceHospital.code,
        recordType: template.type,
        title: template.title,
        recordDate: recordDate.toISOString(),
        sensitivityLevel: template.sensitivityLevel,
        sensitiveCategory: template.sensitiveCategory || null,
        clinicalData: template.content,
        provenanceStatement: `Generated by ${sourceHospital.name} simulated electronic health system. Research prototype only.`,
      };

      const contentRef = saveRecordContent(recordId, payload);

      const recordDoc = new PatientRecord({
        recordId,
        patientId: patient._id,
        sourceHospitalId: sourceHospital._id,
        type: template.type,
        title: template.title,
        recordDate,
        provenance: {
          submittedBy: `Dr. Simulated Practitioner (${sourceHospital.code})`,
          sourceSystem: `${sourceHospital.code}-EMR-v4`,
          facilityName: sourceHospital.name,
          practitionerName: 'Dr. Simulated Staff MD',
          facilityDistrict: sourceHospital.district,
        },
        contentRef,
        contentMimeType: 'application/json',
        sensitivityLevel: template.sensitivityLevel,
        sensitiveCategory: template.sensitiveCategory || null,
        isSynthetic: true,
      });

      await recordDoc.save();
      totalRecordsCreated++;
    }
  }

  console.log(`✓ Created ${totalRecordsCreated} clinical records across ${createdPatients.length} patients in protected storage.`);

  // 4. Seed Verified Scheme Catalogue
  const officialSchemes = getOfficialSchemeSeedData();
  await Scheme.deleteMany({});
  const insertedSchemes = await Scheme.insertMany(officialSchemes);
  console.log(`✓ Seeded ${insertedSchemes.length} official schemes (CMCHIS, PM-JAY, RAN) with citations & date stamps.`);

  return {
    hospitals: [hospA, hospB],
    patients: createdPatients,
    totalRecords: totalRecordsCreated,
    schemes: insertedSchemes,
  };
}

if (require.main === module) {
  connectDB()
    .then(() => seedPhase6())
    .then(() => {
      console.log('Phase 6 seeding complete.');
      return disconnectDB();
    })
    .catch(err => {
      console.error('Phase 6 seed error:', err);
      process.exitCode = 1;
    });
}

module.exports = {
  seedPhase6,
  getOfficialSchemeSeedData,
  SYNTHETIC_PATIENTS,
  RECORD_TEMPLATES,
};
