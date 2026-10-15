const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const {
  DEMO_DATABASE_NAME,
  assertDemoEnvironment,
  collectDemoReport,
  getEvaluationSnapshot,
  markDemoDatabase,
  runDemoCheck,
  seedDemoData,
  validateDemoReport,
} = require('../scripts/demoData');
const runGuidedDemo = require('../scripts/demoScenario');
const { generateSyntheticHospitals } = require('../scripts/syntheticDataGenerator');
const PatientRecord = require('../models/PatientRecord');
const { storageDir } = require('../services/recordStorageService');

describe('Phase 8.5 deterministic demo fixtures', () => {
  let credentialsPath;
  let baselineRecordFiles;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    if (!mongoose.connection.host.includes('127.0.0.1') && !mongoose.connection.host.includes('localhost')) {
      throw new Error(`Tests must use MongoMemoryServer, connected to ${mongoose.connection.host}.`);
    }
    await mongoose.connection.dropDatabase();
    await markDemoDatabase();
    credentialsPath = path.join(os.tmpdir(), `carebridge-demo-test-${process.pid}.json`);
    baselineRecordFiles = new Set(fs.readdirSync(storageDir));
  }, 300000);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      const refs = await PatientRecord.find({ isSynthetic: true }).distinct('contentRef');
      for (const ref of refs) {
        const filename = path.basename(ref);
        if (filename && !baselineRecordFiles.has(filename)) {
          const target = path.join(storageDir, filename);
          if (fs.existsSync(target)) fs.unlinkSync(target);
        }
      }
    }
    if (credentialsPath && fs.existsSync(credentialsPath)) fs.unlinkSync(credentialsPath);
    await disconnectDB();
  }, 300000);

  test('rejects production and non-demo database targets before connecting', () => {
    expect(() => assertDemoEnvironment({
      NODE_ENV: 'production',
      CAREBRIDGE_DEMO_DATABASE: 'true',
      DEMO_DATABASE_NAME,
      MONGODB_URI: `mongodb://127.0.0.1:27017/${DEMO_DATABASE_NAME}`,
    })).toThrow(/disabled/);

    expect(() => assertDemoEnvironment({
      NODE_ENV: 'development',
      CAREBRIDGE_DEMO_DATABASE: 'true',
      DEMO_DATABASE_NAME,
      MONGODB_URI: 'mongodb://127.0.0.1:27017/carebridge',
    })).toThrow(/must target/);

    expect(() => assertDemoEnvironment({
      NODE_ENV: 'development',
      CAREBRIDGE_DEMO_DATABASE: 'true',
      DEMO_DATABASE_NAME,
      MONGODB_URI: `mongodb+srv://example.mongodb.net/${DEMO_DATABASE_NAME}`,
    })).toThrow(/local MongoDB host/);
  });

  test('seeds deterministic, complete fixtures once without changing evaluation outputs', async () => {
    const projectHospital = hospital => ({
      code: hospital.code,
      name: hospital.name,
      tier: hospital.tier,
      specialties: hospital.specialties,
      location: hospital.location,
    });
    expect(generateSyntheticHospitals().map(projectHospital))
      .toEqual(generateSyntheticHospitals().map(projectHospital));

    const evaluationBefore = getEvaluationSnapshot();
    const firstSeed = await seedDemoData({ credentialsPath });
    expect(firstSeed.skipped).toBe(false);
    const guidedDemo = await runGuidedDemo({ disconnect: false, throwOnError: true });
    expect(guidedDemo).toMatchObject({
      completed: true,
      steps: 7,
      assessmentFixtureId: 'DEMO-REF-2026-0001',
      insufficientDataFixtureId: 'DEMO-REF-2026-0002',
    });
    const firstReport = await runDemoCheck();
    expect(validateDemoReport(firstReport)).toEqual([]);
    const completedEvaluation = getEvaluationSnapshot();
    expect(completedEvaluation).toEqual(evaluationBefore);

    const secondSeed = await seedDemoData({ credentialsPath });
    expect(secondSeed.skipped).toBe(true);
    const secondReport = await collectDemoReport();
    expect(secondReport).toEqual(firstReport);
    expect(getEvaluationSnapshot()).toEqual(evaluationBefore);
  }, 120000);
});
