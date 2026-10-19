const fs = require('fs');
const os = require('os');
const path = require('path');
const { connectDB, disconnectDB } = require('../config/db');
const Hospital = require('../models/Hospital');
const Practitioner = require('../models/Practitioner');
const User = require('../models/User');
const { generateSyntheticHospitals } = require('../scripts/syntheticDataGenerator');
const { seedPractitioners } = require('../scripts/seedPractitioners');
const { checkDataConsistency } = require('../scripts/checkDataConsistency');
const { seedHospitalAccounts } = require('../scripts/seedHospitalAccounts');

describe('Phase 8.4a synthetic hospital accounts', () => {
  let hospitals;
  let credentialsPath;
  const credentials = {};

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    hospitals = await Hospital.insertMany(generateSyntheticHospitals().slice(0, 2));
    await seedPractitioners(hospitals);
    credentialsPath = path.join(os.tmpdir(), `carebridge-seed-creds-${process.pid}-${Date.now()}.json`);
  });

  afterAll(async () => {
    if (credentialsPath && fs.existsSync(credentialsPath)) fs.unlinkSync(credentialsPath);
    await disconnectDB();
  });

  it('provisions an admin and two linked verified doctors for every hospital with unique credentials', async () => {
    const firstRun = await seedHospitalAccounts(hospitals, credentials, credentialsPath);
    expect(firstRun.createdAdmins).toBe(2);
    expect(firstRun.linkedDoctors).toBe(4);
    expect(await User.countDocuments({ role: 'hospital_admin' })).toBe(2);
    expect(await Practitioner.countDocuments({
      userId: { $ne: null },
      employmentStatus: 'active',
      verificationStatus: 'verified',
    })).toBe(4);

    expect(await User.countDocuments({ role: 'triage_nurse' })).toBe(2);

    const savedCredentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8')).accounts;
    expect(savedCredentials).toHaveLength(8);
    expect(new Set(savedCredentials.map(account => account.password)).size).toBe(8);
    expect(savedCredentials.every(account => account.email.endsWith('@carebridge.invalid'))).toBe(true);

    const secondRun = await seedHospitalAccounts(hospitals, credentials, credentialsPath);
    expect(secondRun.createdAdmins).toBe(0);
    expect(secondRun.linkedDoctors).toBe(0);
    expect(await User.countDocuments({ role: 'hospital_admin' })).toBe(2);

    const consistency = await checkDataConsistency();
    expect(consistency.passed).toBe(true);
  });

  it('fails consistency validation when a linked doctor belongs to another hospital', async () => {
    const practitioner = await Practitioner.findOne({ userId: { $ne: null }, hospitalId: hospitals[0]._id });
    const user = await User.findById(practitioner.userId);
    user.hospitalId = hospitals[1]._id;
    await user.save();

    const consistency = await checkDataConsistency();
    expect(consistency.passed).toBe(false);
    expect(consistency.mismatchedDoctorLinks).toHaveLength(1);

    user.hospitalId = hospitals[0]._id;
    await user.save();
  });

  it('refuses to provision synthetic accounts in production mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(seedHospitalAccounts(hospitals, credentials, credentialsPath))
        .rejects.toThrow('Synthetic hospital accounts must never be seeded in production.');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
