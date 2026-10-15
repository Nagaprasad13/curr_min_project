const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const AuditLog = require('../models/AuditLog');
const ModelRegistry = require('../models/ModelRegistry');
const Referral = require('../models/Referral');
const { signToken } = require('../config/jwt');
const { registerAllModels } = require('../scripts/registerModels');

const SCREENING_SUMMARY_PATH = path.resolve(__dirname, '../../../ml/models/screening_summary.json');
const TRIAGE_CARD_PATH = path.resolve(__dirname, '../../../ml/models/triage_model_card.json');
const RESULTS_PATH = path.resolve(__dirname, '../../../ml/RESULTS.md');
const resultText = fs.readFileSync(RESULTS_PATH, 'utf8');
const summary = JSON.parse(fs.readFileSync(SCREENING_SUMMARY_PATH, 'utf8'));
const triageCard = JSON.parse(fs.readFileSync(TRIAGE_CARD_PATH, 'utf8'));

describe('Phase 8.3: ML model registry and lifecycle', () => {
  let reviewerToken;
  let adminToken;
  let doctorToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    await ModelRegistry.init();

    const hospital = await Hospital.create({
      name: 'Synthetic Registry Hospital',
      code: 'HOSP-REGISTRY-001',
      district: 'Salem',
      location: { latitude: 11.6643, longitude: 78.146 },
      verificationStatus: 'verified',
      isSynthetic: true,
    });
    const reviewer = await User.create({
      name: 'Registry Reviewer',
      email: 'reviewer.registry@carebridge.test',
      password: 'ReviewerPass123!',
      role: 'platform_reviewer',
      isSynthetic: true,
    });
    const admin = await User.create({
      name: 'Registry Admin',
      email: 'admin.registry@carebridge.test',
      password: 'AdminPass123!',
      role: 'hospital_admin',
      hospitalId: hospital._id,
      isSynthetic: true,
    });
    const doctor = await User.create({
      name: 'Registry Doctor',
      email: 'doctor.registry@carebridge.test',
      password: 'DoctorPass123!',
      role: 'doctor',
      hospitalId: hospital._id,
      isSynthetic: true,
    });

    reviewerToken = signToken({ id: reviewer._id, role: reviewer.role });
    adminToken = signToken({ id: admin._id, role: admin.role });
    doctorToken = signToken({ id: doctor._id, role: doctor.role });
  }, 180000);

  beforeEach(async () => {
    await ModelRegistry.deleteMany({});
    await AuditLog.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDB();
  }, 180000);

  async function createRegisteredModels() {
    const result = await registerAllModels({ quiet: true });
    expect(result.incomplete).toEqual([]);
    expect(result.registeredDocs).toHaveLength(6);
    return result.registeredDocs;
  }

  it('registers six real artifacts idempotently without overwriting lifecycle state', async () => {
    const firstRun = await registerAllModels({ quiet: true });
    expect(firstRun.incomplete).toEqual([]);
    expect(firstRun.registeredDocs).toHaveLength(6);

    await ModelRegistry.updateOne(
      { name: 'triage', version: triageCard.version },
      { $set: { status: 'active' } }
    );
    const secondRun = await registerAllModels({ quiet: true });

    expect(secondRun.incomplete).toEqual([]);
    expect(await ModelRegistry.countDocuments()).toBe(6);
    expect(await ModelRegistry.countDocuments({ status: 'candidate' })).toBe(5);
    expect(await ModelRegistry.countDocuments({ name: 'triage', status: 'active' })).toBe(1);
  });

  it('reports models with missing result rows as incomplete and registers none for them', async () => {
    const definition = {
      name: 'diabetes',
      filename: 'diabetes_model.joblib',
      key: 'Diabetes',
      datasetName: 'Pima Indians Diabetes',
      datasetSource: 'test fixture source',
    };
    const result = await registerAllModels({
      quiet: true,
      triageCard: null,
      screeningSummary: {},
      modelDefinitions: [definition],
    });

    expect(result.registeredDocs).toHaveLength(0);
    expect(result.incomplete).toEqual(['diabetes']);
    expect(await ModelRegistry.countDocuments()).toBe(0);
  });

  it('keeps registry metrics identical to the metrics files and headline values in RESULTS.md', async () => {
    const docs = await createRegisteredModels();
    const docByName = new Map(docs.map(doc => [doc.name, doc]));
    const screeningRows = [
      ['diabetes', 'Diabetes', 'Diabetes'],
      ['heart', 'Heart Disease', 'Heart Disease'],
      ['liver', 'Liver Disease', 'Liver Disease'],
      ['ckd', 'Chronic Kidney Disease', 'Kidney Disease (CKD)'],
      ['thyroid', 'Thyroid Disorder', 'Thyroid (Hypothyroid)'],
    ];

    for (const [name, sourceKey, markdownLabel] of screeningRows) {
      const sourceMetrics = summary[sourceKey];
      const model = docByName.get(name);
      expect(model.metrics).toEqual(sourceMetrics);
      const row = resultText.split(/\r?\n/).find(line => line.startsWith(`| **${markdownLabel}**`));
      expect(row).toBeDefined();
      const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
      expect(Number(cells[2].replace(/,/g, ''))).toBe(sourceMetrics.sample_size);
      expect(parseFloat(cells[4])).toBeCloseTo(sourceMetrics.operating_threshold, 2);
      expect(Math.abs(parseFloat(cells[5].replace(/\*/g, '')) / 100 - sourceMetrics.recall)).toBeLessThan(0.0006);
      expect(parseFloat(cells[7].replace(/\*/g, ''))).toBeCloseTo(sourceMetrics.auroc, 3);
      expect(parseFloat(cells[9])).toBeCloseTo(sourceMetrics.brier_score, 4);
    }

    const triage = docByName.get('triage');
    expect(triage.metrics).toEqual(triageCard.metrics);
    expect(triage.metrics.auroc).toBeCloseTo(0.702, 3);
    expect(triage.metrics.sensitivity).toBeCloseTo(0.840, 3);
  });

  it('enforces one active version per model in MongoDB indexes', async () => {
    const [first] = await createRegisteredModels();
    await ModelRegistry.updateOne({ _id: first._id }, { $set: { status: 'active' } });
    const duplicate = first.toObject();
    delete duplicate._id;
    duplicate.modelId = 'ML-TRIAGE-SECOND-ACTIVE';
    duplicate.version = '99.0.0';
    duplicate.status = 'active';

    await expect(ModelRegistry.create(duplicate)).rejects.toMatchObject({ code: 11000 });
  });

  it('limits doctor registry views and exposes full metrics to reviewers', async () => {
    const [model] = await createRegisteredModels();
    const doctorResponse = await request(app)
      .get('/api/models')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    const doctorModel = doctorResponse.body.models.find(item => item.modelId === model.modelId);
    expect(doctorModel).toMatchObject({
      name: 'triage',
      version: triageCard.version,
      datasetName: 'MIMIC-IV-ED Demo v2.2',
      limitations: expect.any(String),
    });
    expect(doctorModel).not.toHaveProperty('metrics');
    expect(doctorModel).not.toHaveProperty('artifactSha256');

    const reviewerResponse = await request(app)
      .get(`/api/models/${model.modelId}`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .expect(200);
    expect(reviewerResponse.body.model.metrics).toEqual(triageCard.metrics);
    expect(reviewerResponse.body.model.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires reviewer/admin authority and a reason, then promotes and audits the model', async () => {
    const [model] = await createRegisteredModels();
    await request(app)
      .patch(`/api/models/${model.modelId}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'active', justification: 'reviewed' })
      .expect(403);
    await request(app)
      .patch(`/api/models/${model.modelId}/status`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ status: 'active' })
      .expect(400);

    const promoted = await request(app)
      .patch(`/api/models/${model.modelId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active', justification: 'Approved after manual research review.' })
      .expect(200);
    expect(promoted.body.model.status).toBe('active');

    const audit = await AuditLog.findOne({ action: 'UPDATE_MODEL_STATUS', resourceId: model._id.toString() });
    expect(audit).toBeTruthy();
    expect(audit.justification).toBe('Approved after manual research review.');
    expect(audit.meta).toMatchObject({ modelId: model.modelId, newStatus: 'active' });
  });

  it('does not replace ML registry/integrity rejections with a rule-based prediction', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '{"detail":"Model triage has no active version; prediction refused."}',
    });
    try {
      const response = await request(app)
        .post('/api/referrals/predict-severity')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ heartrate: 90 })
        .expect(503);
      expect(response.body).not.toHaveProperty('riskScore');
      expect(response.body.message).toContain('prediction refused');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('persists model version and artifact metadata with an assessment', async () => {
    const record = await Referral.create({
      referralId: 'REF-REGISTRY-TEST',
      patientName: 'Synthetic Registry Patient',
      requirements: {
        requiredSpecialty: 'General Medicine',
        patientCoordinates: { latitude: 11.66, longitude: 78.14 },
      },
      mlAssessment: {
        assessedAt: new Date(),
        modelVersion: '1.0.0',
        modelVersions: { triage: '1.0.0', ckd: '1.0.0' },
        modelArtifacts: [{
          modelName: 'triage',
          modelVersion: '1.0.0',
          artifactSha256Prefix: '0123456789ab',
        }],
      },
    });
    const saved = await Referral.findById(record._id).lean();
    expect(saved.mlAssessment.modelVersion).toBe('1.0.0');
    expect(saved.mlAssessment.modelVersions).toEqual({ triage: '1.0.0', ckd: '1.0.0' });
    expect(saved.mlAssessment.modelArtifacts[0].artifactSha256Prefix).toBe('0123456789ab');
  });

  it('retires the previous active version on promotion of a newer version', async () => {
    const [first] = await createRegisteredModels();
    await ModelRegistry.updateOne({ _id: first._id }, { $set: { status: 'active' } });
    const secondData = first.toObject();
    delete secondData._id;
    secondData.modelId = 'ML-TRIAGE-2026-2-0-0';
    secondData.version = '2.0.0';
    secondData.status = 'candidate';
    const second = await ModelRegistry.create(secondData);

    await request(app)
      .patch(`/api/models/${second.modelId}/status`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ status: 'active', justification: 'Promote validated v2.' })
      .expect(200);

    expect(await ModelRegistry.countDocuments({ name: 'triage', status: 'active' })).toBe(1);
    expect((await ModelRegistry.findById(first._id)).status).toBe('retired');
    const audit = await AuditLog.findOne({ resourceId: second._id.toString() });
    expect(audit.meta.retiredModelId).toBe(first.modelId);
  });
});
