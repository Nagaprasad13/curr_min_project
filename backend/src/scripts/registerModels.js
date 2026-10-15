const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ModelRegistry = require('../models/ModelRegistry');
const { connectDB, disconnectDB } = require('../config/db');

const MODELS_DIR = path.resolve(__dirname, '../../../ml/models');
const ML_DIR = path.resolve(MODELS_DIR, '..');
const SCREENING_RESULTS = path.join(MODELS_DIR, 'screening_summary.json');
const TRIAGE_RESULTS = path.join(MODELS_DIR, 'triage_model_card.json');
const MODEL_DEFINITIONS = [
  {
    name: 'triage',
    filename: 'triage_model.joblib',
    datasetName: 'MIMIC-IV-ED Demo v2.2',
    datasetSource: 'PhysioNet public demo v2.2',
    resultFile: TRIAGE_RESULTS,
    modelCardRef: 'ml/models/triage_model_card.json',
    features: ['age', 'gender', 'arrival_transport', 'temperature', 'heartrate', 'resprate', 'o2sat', 'sbp', 'dbp', 'pain', 'o2sat_missing', 'temperature_missing', 'pain_missing'],
    result: card => ({
      version: card.version,
      rowCount: card.cohort?.labeled_visits,
      trainingDate: card.trainingDate,
      threshold: card.operatingThreshold,
      metrics: card.metrics,
      calibrationMethod: 'Platt sigmoid calibration',
      thresholdPolicy: 'Train-only threshold tuning for at least 90% sensitivity',
    }),
  },
  {
    name: 'diabetes',
    filename: 'diabetes_model.joblib',
    datasetName: 'Pima Indians Diabetes',
    datasetSource: 'UCI Machine Learning Repository, dataset 34',
    key: 'Diabetes',
    features: ['Pregnancies', 'Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI', 'DiabetesPedigreeFunction', 'Age'],
  },
  {
    name: 'heart',
    filename: 'heart_model.joblib',
    datasetName: 'Cleveland Heart Disease',
    datasetSource: 'UCI Machine Learning Repository, dataset 45',
    key: 'Heart Disease',
    features: ['age', 'trestbps', 'chol', 'thalach', 'oldpeak', 'sex', 'cp', 'fbs', 'restecg', 'exang', 'slope', 'ca', 'thal'],
  },
  {
    name: 'liver',
    filename: 'liver_model.joblib',
    datasetName: 'Indian Liver Patient Dataset',
    datasetSource: 'UCI Machine Learning Repository, dataset 225',
    key: 'Liver Disease',
    features: ['age', 'tb', 'db', 'alkphos', 'sgpt', 'sgot', 'tp', 'alb', 'ag_ratio', 'gender'],
  },
  {
    name: 'ckd',
    filename: 'ckd_model.joblib',
    datasetName: 'Chronic Kidney Disease',
    datasetSource: 'UCI Machine Learning Repository, dataset 338',
    key: 'Chronic Kidney Disease',
    features: ['age', 'bp', 'bgr', 'bu', 'sc', 'sod', 'pot', 'hemo', 'sg', 'al', 'su', 'rbc', 'pc', 'pcc', 'ba', 'htn', 'dm', 'cad', 'appet', 'pe', 'ane'],
  },
  {
    name: 'thyroid',
    filename: 'thyroid_model.joblib',
    datasetName: 'Thyroid Hypothyroid',
    datasetSource: 'UCI Machine Learning Repository, dataset 102 (Garavan Institute)',
    key: 'Thyroid Disorder',
    features: ['age', 'TSH', 'T3', 'TT4', 'T4U', 'FTI', 'sex', 'on_antithyroid_medication', 'thyroid_surgery', 'query_hypothyroid', 'query_hyperthyroid', 'pregnant', 'sick', 'tumor', 'lithium', 'goitre'],
  },
];

function computeFileSha256(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Model artifact file not found: ${filePath}`);
  }
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getModelResult(definition, triageCard, screeningSummary) {
  if (definition.name === 'triage') {
    return triageCard ? definition.result(triageCard) : null;
  }
  const source = screeningSummary?.[definition.key];
  if (!source) return null;
  const datasetRowCount = source.sample_size;
  if (!Number.isInteger(datasetRowCount) || datasetRowCount < 1 ||
    !Number.isFinite(source.operating_threshold) || !Number.isFinite(source.auroc)) {
    return null;
  }
  return {
    version: '1.0.0',
    rowCount: datasetRowCount,
    threshold: source.operating_threshold,
    metrics: source,
    calibrationMethod: 'Platt sigmoid calibration',
    thresholdPolicy: '5-fold stratified cross-validation repeated 10 times; recall-first threshold targeting at least 90% sensitivity',
  };
}

async function registerAllModels({
  quiet = false,
  triageCard: providedTriageCard,
  screeningSummary: providedScreeningSummary,
  modelsDir = MODELS_DIR,
  modelDefinitions = MODEL_DEFINITIONS,
} = {}) {
  await ModelRegistry.init();
  const triageCard = providedTriageCard === undefined ? readJson(TRIAGE_RESULTS) : providedTriageCard;
  const screeningSummary = providedScreeningSummary === undefined ? readJson(SCREENING_RESULTS) : providedScreeningSummary;
  const registeredDocs = [];
  const incomplete = [];

  for (const definition of modelDefinitions) {
    const result = getModelResult(definition, triageCard, screeningSummary);
    const artifactPath = path.join(modelsDir, definition.filename);
    if (!result || !result.version || !Number.isInteger(result.rowCount) ||
      result.rowCount < 1 || !Number.isFinite(result.threshold) ||
      result.threshold < 0 || result.threshold > 1 ||
      !Number.isFinite(result.metrics?.auroc) || !fs.existsSync(artifactPath)) {
      incomplete.push(definition.name);
      if (!quiet) console.warn(`Incomplete model ${definition.name}: missing result values or artifact; skipped.`);
      continue;
    }

    const diskTrainingDate = fs.statSync(artifactPath).mtime;
    const trainingDate = result.trainingDate ? new Date(result.trainingDate) : diskTrainingDate;
    if (Number.isNaN(trainingDate.getTime())) {
      incomplete.push(definition.name);
      if (!quiet) console.warn(`Incomplete model ${definition.name}: invalid training date; skipped.`);
      continue;
    }

    const datasetName = definition.datasetName || definition.filename.replace('_model.joblib', '');
    const payload = {
      modelId: `ML-${definition.name.toUpperCase()}-${result.version.replace(/\./g, '-')}`,
      name: definition.name,
      version: result.version,
      status: 'candidate',
      datasetName,
      datasetSource: definition.datasetSource,
      datasetRowCount: result.rowCount,
      trainingDate,
      metrics: result.metrics,
      threshold: result.threshold,
      thresholdPolicy: result.thresholdPolicy,
      featureList: definition.features,
      calibrationMethod: result.calibrationMethod,
      artifactPath: path.relative(ML_DIR, artifactPath).replace(/\\/g, '/'),
      artifactSha256: computeFileSha256(artifactPath),
      modelCardRef: definition.modelCardRef || 'ml/models/screening_summary.json',
      limitations: 'Public retrospective benchmark data; research prototype only, not validated for clinical deployment or Tamil Nadu patient populations.',
    };

    const doc = await ModelRegistry.findOneAndUpdate(
      { name: payload.name, version: payload.version },
      { $setOnInsert: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    registeredDocs.push(doc);
    if (!quiet) {
      console.log(`Registered candidate ${doc.name}@${doc.version} | ${doc.datasetName} (${doc.datasetRowCount}) | SHA-256 ${doc.artifactSha256.slice(0, 12)}`);
    }
  }

  if (!quiet) {
    console.log(`\nRegistered ${registeredDocs.length} model entries; incomplete: ${incomplete.length ? incomplete.join(', ') : 'none'}.`);
    console.table(registeredDocs.map(doc => ({
      model: doc.name,
      version: doc.version,
      status: doc.status,
      dataset: doc.datasetName,
      rows: doc.datasetRowCount,
      hashPrefix: doc.artifactSha256.slice(0, 12),
      headlineMetric: `AUROC ${Number(doc.metrics.auroc).toFixed(3)}`,
    })));
  }
  return { registeredDocs, incomplete };
}

if (require.main === module) {
  connectDB()
    .then(registerAllModels)
    .then(async () => {
      await disconnectDB();
    })
    .catch(async err => {
      console.error('Model registration failed:', err);
      try {
        await disconnectDB();
      } catch (disconnectError) {
        console.error('Failed to disconnect after model registration error:', disconnectError);
      }
      process.exitCode = 1;
    });
}

module.exports = {
  registerAllModels,
  computeFileSha256,
  getModelResult,
};
