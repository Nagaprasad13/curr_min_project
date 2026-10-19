const request = require('supertest');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const Scheme = require('../models/Scheme');
const ConditionSpecialtyMap = require('../models/ConditionSpecialtyMap');
const TriageRecord = require('../models/TriageRecord');
const { signToken } = require('../config/jwt');

describe('CareBridge Automated Authorisation Matrix (Phase 7 & 8.4c Quality Gate)', () => {
  let testHospitalId;
  let foreignHospitalId;
  let testSchemeId;
  let testSpecialtyMapId;
  let testTriageRecordId;

  const tokens = {
    public: null,
    patient: null,
    triage_nurse: null,
    doctor: null,
    hospital_admin: null,
    platform_reviewer: null,
  };

  const matrixResults = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();

    await User.deleteMany({});
    await Hospital.deleteMany({});
    await Scheme.deleteMany({});
    await ConditionSpecialtyMap.deleteMany({});
    await TriageRecord.deleteMany({});

    // Create test hospital
    const hospital = await Hospital.create({
      name: 'Matrix Test Hospital',
      code: 'HOSP-TEST-001',
      registrationNumber: 'CEA-TN-2026-9999',
      district: 'Salem',
      tier: 'Tier 2',
      verificationStatus: 'verified',
      location: { latitude: 11.6643, longitude: 78.146 },
      bedCounts: { general: 50, emergency: 10, icu: 10 },
      isSynthetic: true,
    });
    testHospitalId = hospital._id.toString();

    const foreignHospital = await Hospital.create({
      name: 'Foreign Matrix Hospital',
      code: 'HOSP-TEST-002',
      registrationNumber: 'CEA-TN-2026-9998',
      district: 'Erode',
      tier: 'Tier 2',
      verificationStatus: 'verified',
      location: { latitude: 11.341, longitude: 77.7172 },
      bedCounts: { general: 50, emergency: 10, icu: 10 },
      isSynthetic: true,
    });
    foreignHospitalId = foreignHospital._id.toString();

    // Create test scheme
    const scheme = await Scheme.create({
      schemeId: 'TEST-SCHEME-001',
      name: 'Test Assurance Scheme',
      shortDescription: 'Synthetic scheme for matrix testing',
      authority: 'Tamil Nadu Health Systems Project (TNHSP)',
      officialPortalUrl: 'https://cmchistn.com',
      officialApplicationUrl: 'https://cmchistn.com/apply',
      lastVerifiedDate: new Date(),
      status: 'verified',
      criteria: {
        confirmedFacts: [{ criterion: 'State resident' }],
        toVerifyItems: [],
      },
    });
    testSchemeId = scheme._id.toString();

    // Create test condition mapping
    const condMap = await ConditionSpecialtyMap.create({
      condition_id: 'TEST-COND-001',
      name: 'Test Condition',
      icd10_code: 'Z00.0',
      primary_specialty: 'General Medicine',
      status: 'PENDING CLINICIAN REVIEW',
    });
    testSpecialtyMapId = condMap._id.toString();

    // Create role test users and generate tokens
    const roles = ['patient', 'triage_nurse', 'doctor', 'hospital_admin', 'platform_reviewer'];
    let nurseUser;
    for (const role of roles) {
      const isHospitalRole = ['hospital_admin', 'doctor', 'triage_nurse'].includes(role);
      const user = await User.create({
        name: `Matrix ${role}`,
        email: `matrix_${role}@carebridge.test`,
        password: 'Password123!',
        role,
        hospitalId: isHospitalRole ? hospital._id : undefined,
        district: 'Salem',
        qualification: role === 'triage_nurse' ? 'B.Sc Nursing' : undefined,
        registrationNumber: role === 'triage_nurse' ? 'SYN-NUR-0001' : undefined,
        status: 'active',
        isSynthetic: true,
      });

      if (role === 'triage_nurse') {
        nurseUser = user;
      }

      tokens[role] = signToken({
        id: user._id,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
      });
    }

    // Create a triage record for testing triage endpoints
    const triageRec = await TriageRecord.create({
      triageId: 'TRG-2026-TEST01',
      patientId: new mongoose.Types.ObjectId(),
      hospitalId: hospital._id,
      recordedBy: nurseUser._id,
      chiefComplaint: { category: 'General', text: 'Matrix intake test' },
      vitals: {
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 72,
        respiratoryRate: 16,
        spo2: 98,
        temperature: 36.8,
      },
      status: 'submitted',
      isSynthetic: true,
    });
    testTriageRecordId = triageRec._id.toString();
  });

  afterAll(async () => {
    // Generate and export docs/AUTH_MATRIX.md
    const docsDir = path.join(__dirname, '..', '..', '..', 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    let markdown = '# CareBridge Role-Based Access Control (RBAC) Authorisation Matrix\n\n';
    markdown += '> **Generated Automatically by**: `backend/src/tests/authMatrix.test.js`\n';
    markdown += '> **Date Generated**: ' + new Date().toISOString() + '\n';
    markdown += '> **Standard**: Zero Client Trust; strict server-side role gating on all endpoints.\n\n';
    markdown += '| Endpoint | Method | Public | Patient | Triage Nurse | Doctor | Hospital Admin | Platform Reviewer | Result |\n';
    markdown += '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n';

    for (const row of matrixResults) {
      markdown += `| \`${row.endpoint}\` | **${row.method}** | ${row.public} | ${row.patient} | ${row.triage_nurse} | ${row.doctor} | ${row.hospital_admin} | ${row.platform_reviewer} | ${row.status} |\n`;
    }

    markdown += '\n### Legend\n';
    markdown += '- `ALLOW (2xx/3xx/400/404)`: Authorized role (request passed authentication & authorization gates; may return 400 for empty body payload).\n';
    markdown += '- `DENY (401/403)`: Unauthorized role (properly rejected by JWT or RBAC middleware).\n';

    fs.writeFileSync(path.join(docsDir, 'AUTH_MATRIX.md'), markdown, 'utf-8');
    console.log(`✓ Exported docs/AUTH_MATRIX.md successfully (${matrixResults.length} endpoints tested across 6 roles).`);

    await disconnectDB();
  });

  const endpointsToTest = [
    {
      name: 'System Health Check',
      endpoint: '/api/health',
      method: 'GET',
      expected: { public: true, patient: true, triage_nurse: true, doctor: true, hospital_admin: true, platform_reviewer: true },
    },
    {
      name: 'Current User Profile',
      endpoint: '/api/auth/me',
      method: 'GET',
      expected: { public: false, patient: true, triage_nurse: true, doctor: true, hospital_admin: true, platform_reviewer: true },
    },
    {
      name: 'Cross-hospital profile access',
      endpoint: () => `/api/hospitals/${foreignHospitalId}`,
      method: 'GET',
      expected: { public: true, patient: true, triage_nurse: false, doctor: false, hospital_admin: false, platform_reviewer: true },
    },
    {
      name: 'Cross-hospital practitioner roster access',
      endpoint: () => `/api/hospitals/${foreignHospitalId}/practitioners`,
      method: 'GET',
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: false, platform_reviewer: true },
    },
    {
      name: 'Cross-hospital capacity read',
      endpoint: () => `/api/hospitals/${foreignHospitalId}/capacity/latest`,
      method: 'GET',
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: false, platform_reviewer: true },
    },
    {
      name: 'Cross-hospital capacity write',
      endpoint: () => `/api/hospitals/${foreignHospitalId}/capacity`,
      method: 'PUT',
      body: { reportedBy: 'Matrix test' },
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'Cross-hospital profile update',
      endpoint: () => `/api/hospitals/${foreignHospitalId}`,
      method: 'PUT',
      body: { address: 'Attempted cross-hospital edit' },
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'Register Hospital',
      endpoint: '/api/hospitals',
      method: 'POST',
      body: { name: 'New Hosp' },
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: true, platform_reviewer: false },
    },
    {
      name: 'Update Hospital Capacity',
      endpoint: () => `/api/hospitals/${testHospitalId}/capacity`,
      method: 'PUT',
      body: { reportedBy: 'Admin' },
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: true, platform_reviewer: false },
    },
    {
      name: 'Assess Patient Triage & Screening',
      endpoint: '/api/referrals/assess',
      method: 'POST',
      body: { age: 50 },
      expected: { public: false, patient: false, triage_nurse: false, doctor: true, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'Recommend Hospitals (Referral Engine)',
      endpoint: '/api/referrals/recommend',
      method: 'POST',
      body: { requiredSpecialty: 'Cardiology' },
      expected: { public: false, patient: false, triage_nurse: false, doctor: true, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'Request Records Consent',
      endpoint: '/api/consents/request',
      method: 'POST',
      body: { patientId: '000000000000000000000000' },
      expected: { public: false, patient: false, triage_nurse: false, doctor: true, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'Patient Access History',
      endpoint: '/api/consents/access-history',
      method: 'GET',
      expected: { public: false, patient: true, triage_nurse: false, doctor: false, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'List Schemes',
      endpoint: '/api/schemes',
      method: 'GET',
      expected: { public: false, patient: true, triage_nurse: true, doctor: true, hospital_admin: true, platform_reviewer: true },
    },
    {
      name: 'Verify Scheme (Auditor Only)',
      endpoint: () => `/api/schemes/${testSchemeId}/verify`,
      method: 'POST',
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: false, platform_reviewer: true },
    },
    {
      name: 'Condition Specialty Map List',
      endpoint: '/api/specialty-map',
      method: 'GET',
      expected: { public: false, patient: false, triage_nurse: false, doctor: true, hospital_admin: true, platform_reviewer: true },
    },
    {
      name: 'Sign-off Condition Specialty Map',
      endpoint: () => `/api/specialty-map/${testSpecialtyMapId}`,
      method: 'PATCH',
      body: { status: 'REVIEWED_ACCEPTED' },
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: false, platform_reviewer: true },
    },
    {
      name: 'Verify Hospital (Reviewer Only)',
      endpoint: () => `/api/hospitals/${testHospitalId}/verify`,
      method: 'POST',
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: false, platform_reviewer: true },
    },
    {
      name: 'Create Triage Record',
      endpoint: '/api/triage/records',
      method: 'POST',
      body: { chiefComplaint: { category: 'General', text: 'Intake' } },
      expected: { public: false, patient: false, triage_nurse: true, doctor: true, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'List Hospital Triage Records',
      endpoint: '/api/triage/records',
      method: 'GET',
      expected: { public: false, patient: false, triage_nurse: true, doctor: true, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'Confirm Triage Urgency (Doctor Only)',
      endpoint: () => `/api/triage/records/${testTriageRecordId}/confirm-urgency`,
      method: 'POST',
      body: { confirmedUrgency: 'Urgent', justification: 'Doctor evaluation' },
      expected: { public: false, patient: false, triage_nurse: false, doctor: true, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'Intake Patient Summaries',
      endpoint: '/api/triage/patients',
      method: 'GET',
      expected: { public: false, patient: false, triage_nurse: true, doctor: true, hospital_admin: false, platform_reviewer: false },
    },
    {
      name: 'Hospital Admin Nurse Roster',
      endpoint: () => `/api/hospitals/${testHospitalId}/nurses`,
      method: 'GET',
      expected: { public: false, patient: false, triage_nurse: false, doctor: false, hospital_admin: true, platform_reviewer: false },
    },
  ];

  for (const item of endpointsToTest) {
    test(`RBAC Matrix: ${item.method} ${item.name}`, async () => {
      const url = typeof item.endpoint === 'function' ? item.endpoint() : item.endpoint;
      const row = {
        endpoint: url,
        method: item.method,
        status: 'PASSED',
      };

      for (const role of ['public', 'patient', 'triage_nurse', 'doctor', 'hospital_admin', 'platform_reviewer']) {
        let reqInstance;
        if (item.method === 'GET') {
          reqInstance = request(app).get(url);
        } else if (item.method === 'POST') {
          reqInstance = request(app).post(url).send(item.body || {});
        } else if (item.method === 'PUT') {
          reqInstance = request(app).put(url).send(item.body || {});
        } else if (item.method === 'PATCH') {
          reqInstance = request(app).patch(url).send(item.body || {});
        }

        if (tokens[role]) {
          reqInstance.set('Authorization', `Bearer ${tokens[role]}`);
        }

        const res = await reqInstance;
        const expectedAllow = item.expected[role];

        // An unauthorized request must return 401 (no token) or 403 (wrong role)
        if (!expectedAllow) {
          expect([401, 403]).toContain(res.status);
          row[role] = '`DENY` (' + res.status + ')';
        } else {
          // Authorized request should reach the controller handler (not 401 or 403)
          expect([401, 403]).not.toContain(res.status);
          row[role] = '`ALLOW` (' + res.status + ')';
        }
      }

      matrixResults.push(row);
    });
  }
});
