const path = require('path');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const User = require('../models/User');
const Hospital = require('../models/Hospital');
const PatientRecord = require('../models/PatientRecord');
const Consent = require('../models/Consent');
const { saveRecordContent } = require('../services/recordStorageService');

const SAMPLE_CLINICAL_TEMPLATES = [
  {
    type: 'lab_report',
    title: 'Complete Blood Count (CBC) with Differential',
    sensitivityLevel: 'normal',
    daysAgo: 5,
    summary: 'Hemoglobin: 12.4 g/dL, WBC: 6,800/mcL, Platelets: 220,000/mcL. Normocytic, normochromic profile.',
    content: {
      investigation: 'Complete Blood Count (CBC)',
      parameters: { hemoglobin: '12.4 g/dL', wbc: '6,800 /mcL', platelets: '220,000 /mcL', rbc: '4.2 M/uL' },
      interpretation: 'Normal hematological profile within physiological reference limits.',
    },
  },
  {
    type: 'lab_report',
    title: 'Comprehensive Metabolic Panel (CMP) & Renal Function',
    sensitivityLevel: 'normal',
    daysAgo: 12,
    summary: 'Serum Creatinine: 0.9 mg/dL, BUN: 14 mg/dL, eGFR: >90 mL/min, Fasting Glucose: 98 mg/dL.',
    content: {
      investigation: 'Comprehensive Metabolic Panel',
      parameters: { creatinine: '0.9 mg/dL', bun: '14 mg/dL', egfr: '>90 mL/min', fastingGlucose: '98 mg/dL', sodium: '140 mEq/L', potassium: '4.2 mEq/L' },
      interpretation: 'Adequate renal filtration and normal electrolyte balance.',
    },
  },
  {
    type: 'prescription',
    title: 'Outpatient Medication Prescription - Acute Bronchitis',
    sensitivityLevel: 'normal',
    daysAgo: 18,
    summary: 'Amoxicillin-Clavulanate 625mg TID x 5 days, Levocetirizine 5mg OD x 7 days, Paracetamol 650mg SOS.',
    content: {
      specialty: 'Pulmonology / Internal Medicine',
      medications: [
        { name: 'Amoxicillin-Clavulanate', dose: '625mg', frequency: 'TID', duration: '5 days' },
        { name: 'Levocetirizine', dose: '5mg', frequency: 'OD', duration: '7 days' },
        { name: 'Paracetamol', dose: '650mg', frequency: 'PRN/SOS', duration: '3 days' },
      ],
      instructions: 'Complete full course of antibiotics. Hydrate adequately. Follow up if fever persists beyond 48 hours.',
    },
  },
  {
    type: 'discharge_summary',
    title: 'Inpatient Discharge Summary - Observation Unit',
    sensitivityLevel: 'normal',
    daysAgo: 35,
    summary: 'Admitted for acute bronchospasm and viral fever. Stabilized with bronchodilators. Discharged in stable condition.',
    content: {
      admissionDate: new Date(Date.now() - 37 * 86400000).toISOString(),
      dischargeDate: new Date(Date.now() - 35 * 86400000).toISOString(),
      principalDiagnosis: 'Acute Asthmatic Exacerbation / Viral Bronchitis',
      dischargeCondition: 'Hemodynamically stable, ambulating, room air SpO2 98%',
      followUpPlan: 'Review in Chest Clinic after 2 weeks with fresh spirometry.',
    },
  },
  {
    type: 'imaging_report',
    title: 'Chest Radiograph (PA & Lateral Views)',
    sensitivityLevel: 'normal',
    daysAgo: 45,
    summary: 'Clear lung fields bilaterally. Normal cardiothoracic ratio. No focal consolidation, pneumothorax, or effusion.',
    content: {
      modality: 'Digital Radiography (X-Ray)',
      region: 'Chest PA & Lateral',
      findings: 'Lungs are clear with no focal consolidation, pleural effusion, or pneumothorax. Cardiothoracic silhouette is normal. Bony thorax intact.',
      impression: 'No acute cardiopulmonary disease.',
    },
  },
  {
    type: 'diagnosis',
    title: 'Clinical Diagnostic Workup - Mild Persistent Asthma',
    sensitivityLevel: 'normal',
    daysAgo: 60,
    summary: 'Spirometry confirmed reversible airflow obstruction (FEV1/FVC 72%, post-bronchodilator +14% improvement).',
    content: {
      icd10: 'J45.30',
      condition: 'Mild persistent asthma without complication',
      clinicalNotes: 'Triggered by seasonal allergens and viral upper respiratory tract infections. Stepped up to low-dose ICS-formoterol maintenance.',
    },
  },
  {
    type: 'allergy',
    title: 'Documented Drug & Environmental Allergy Profile',
    sensitivityLevel: 'normal',
    daysAgo: 90,
    summary: 'Known severe allergy: Sulfa antibiotics (cutaneous rash, urticaria). Non-allergic to penicillins and NSAIDs.',
    content: {
      allergen: 'Sulfonamide Antibiotics',
      reaction: 'Maculopapular cutaneous rash and facial angioedema',
      severity: 'Moderate to Severe',
      clinicalWarning: 'Strict avoidance of cotrimoxazole, sulfasalazine, and related sulfa derivatives.',
    },
  },
];

async function seedPatientRecords() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/carebridge';
  console.log(`Connecting to MongoDB at: ${uri}`);
  await mongoose.connect(uri);

  try {
    // 1. Locate Patients (specifically M. Anandhi or all patients)
    const patients = await User.find({ role: 'patient' });
    if (patients.length === 0) {
      console.log('No patients found in DB. Please run npm run seed first.');
      return;
    }

    // 2. Locate Hospitals for provenance
    const hospitals = await Hospital.find({}).limit(5);
    const defaultHosp = hospitals[0] || {
      _id: new mongoose.Types.ObjectId(),
      name: 'Salem Government Mohan Kumaramangalam Medical College Hospital',
      district: 'Salem',
      code: 'HOSP-SALEM-GMKMCH',
    };

    console.log(`\nFound ${patients.length} patient(s) in system.`);

    for (const patient of patients) {
      console.log(`\nProcessing patient: ${patient.name} (${patient.email}) - ID: ${patient._id}`);

      // Remove existing synthetic records for clean state
      const deletedOld = await PatientRecord.deleteMany({ patientId: patient._id });
      console.log(`  Cleared ${deletedOld.deletedCount} old records.`);

      let createdCount = 0;
      for (let i = 0; i < SAMPLE_CLINICAL_TEMPLATES.length; i++) {
        const tmpl = SAMPLE_CLINICAL_TEMPLATES[i];
        const recordId = uuidv4();
        const recordDate = new Date(Date.now() - tmpl.daysAgo * 86400000);
        const sourceHosp = hospitals[i % hospitals.length] || defaultHosp;

        const payload = {
          recordId,
          patientId: patient._id.toString(),
          patientName: patient.name,
          sourceHospital: sourceHosp.name,
          sourceHospitalCode: sourceHosp.code || 'HOSP-CARE',
          recordType: tmpl.type,
          title: tmpl.title,
          recordDate: recordDate.toISOString(),
          sensitivityLevel: tmpl.sensitivityLevel,
          summary: tmpl.summary,
          clinicalData: tmpl.content,
          provenanceStatement: `Authenticated by ${sourceHosp.name} EMR telemetry. Research Prototype.`,
        };

        const contentRef = saveRecordContent(recordId, payload);

        const recordDoc = new PatientRecord({
          recordId,
          patientId: patient._id,
          sourceHospitalId: sourceHosp._id,
          type: tmpl.type,
          title: tmpl.title,
          recordDate,
          provenance: {
            submittedBy: `Dr. Attending Physician (${sourceHosp.code || 'CARE'})`,
            sourceSystem: 'Hospital-HIS-Simulated',
            facilityName: sourceHosp.name,
            practitionerName: 'Dr. S. Sundaram, MD',
            facilityDistrict: sourceHosp.district || patient.district || 'Salem',
          },
          contentRef,
          contentMimeType: 'application/json',
          sensitivityLevel: tmpl.sensitivityLevel,
          isSynthetic: true,
        });

        await recordDoc.save();
        createdCount++;
      }
      console.log(`  ✓ Successfully saved ${createdCount} clinical records to protected storage & MongoDB.`);

      // 3. Reset any pending / expired consents to valid future date (30-day window)
      const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const consentUpdate = await Consent.updateMany(
        { patientId: patient._id, status: { $in: ['requested', 'expired'] } },
        {
          $set: {
            status: 'requested',
            expiresAt: futureExpiry,
          },
        }
      );
      console.log(`  ✓ Updated ${consentUpdate.modifiedCount} consent requests to fresh 30-day expiry window.`);
    }

    console.log('\n============================================================');
    console.log('PATIENT RECORDS & CONSENT READY FOR TESTING:');
    console.log('Login credentials:');
    console.log('  Role:     Patient');
    console.log('  Email:    patient@carebridge.invalid');
    console.log('  Portal:   http://localhost:3000/patient/consents');
    console.log('Features active:');
    console.log('  1. "My Health Records" tab displays 7 clinical records');
    console.log('  2. "Sharing Consents" tab has active Grant buttons without expiry errors');
    console.log('  3. Granted consents feature "📁 Records" button to view shared files');
    console.log('  4. Doctor portal has "📋 Sent Requests" tab to track consent status');
    console.log('============================================================\n');
  } catch (err) {
    console.error('Seed patient records error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

seedPatientRecords();

