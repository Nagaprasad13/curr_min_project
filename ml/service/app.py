"""
app.py
------
FastAPI microservice for CareBridge Clinical Decision Support:
- POST /predict-severity: Triage urgency and acuity prediction.
- POST /assess: Multi-condition screening, red flag rules, and urgency fusion.

Strict Notice:
Research prototype only. Outputs provide clinical decision support for doctor
review, NOT diagnoses. Models trained on public non-Tamil Nadu datasets and not
validated for Tamil Nadu patient populations. Standard emergency care protocols
supersede all scores.
"""

import os
import sys
os.environ["LOKY_MAX_CPU_COUNT"] = "4"
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import json
import hashlib
import joblib
import pandas as pd
from pymongo import MongoClient
from typing import List, Optional, Any
from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

# Import local ML modules
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from rule_based_screening import screen_anemia, screen_hypertension
from decision_layer import evaluate_red_flags, reconcile_urgency, MANDATORY_DISCLAIMER

app = FastAPI(
    title="CareBridge ML Triage & Condition Screening Service",
    version="1.0.0",
    description="Clinical Decision Support Microservice for Tamil Nadu Referral System (Research Prototype)",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models')
ML_ROOT = os.path.dirname(MODELS_DIR)
CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config')
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
MODEL_FILES = {
    'triage': ('triage_model.joblib', None),
    'diabetes': ('diabetes_model.joblib', 'diabetes'),
    'heart': ('heart_model.joblib', 'heart_disease'),
    'liver': ('liver_model.joblib', 'liver_disease'),
    'ckd': ('ckd_model.joblib', 'ckd'),
    'thyroid': ('thyroid_model.joblib', 'thyroid'),
}

# Load only active, registry-verified models at startup.
triage_model = None
condition_models = {}
triage_card = {}
screening_summary = {}
condition_specialty_map = []
verified_model_hashes = {}
active_model_records = {}


def compute_file_sha256(filepath: str) -> str:
    """Computes SHA-256 cryptographic hash of a binary file on disk."""
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest().lower()


def fetch_active_registry_models():
    mongo_uri = os.environ.get('MONGODB_URI', 'mongodb://127.0.0.1:27017/carebridge')
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    try:
        database = client.get_default_database(default='carebridge')
        database.command('ping')
        return list(database.modelregistries.find({'status': 'active'}))
    except Exception as exc:
        raise RuntimeError(f"FATAL: Cannot read active model registry from MongoDB: {exc}") from exc
    finally:
        client.close()


def load_all_artifacts(registry_entries=None, models_root=ML_ROOT):
    global triage_model, condition_models, triage_card, screening_summary
    global condition_specialty_map, verified_model_hashes, active_model_records

    triage_model = None
    condition_models = {}
    triage_card = {}
    screening_summary = {}
    condition_specialty_map = []
    verified_model_hashes = {}
    active_model_records = {}

    records = fetch_active_registry_models() if registry_entries is None else list(registry_entries)
    for record in records:
        name = record.get('name')
        if record.get('status') != 'active':
            continue
        if name not in MODEL_FILES:
            raise RuntimeError(f"FATAL: Unsupported model name in active registry: {name!r}")
        if not record.get('version'):
            raise RuntimeError(f"FATAL: Active {name} model has no version.")
        if name in active_model_records:
            raise RuntimeError(f"FATAL: Multiple active versions found for model {name}.")
        threshold = record.get('threshold')
        if not isinstance(threshold, (int, float)) or not 0 <= threshold <= 1:
            raise RuntimeError(f"FATAL: Active {name} model has an invalid threshold.")

        artifact_path = record.get('artifactPath')
        if not artifact_path:
            raise RuntimeError(f"FATAL: Active {name} model has no artifact path.")
        resolved_path = os.path.realpath(os.path.join(models_root, artifact_path))
        if os.path.commonpath([os.path.realpath(models_root), resolved_path]) != os.path.realpath(models_root):
            raise RuntimeError(f"FATAL: Unsafe artifact path for active model {name}.")
        if not os.path.isfile(resolved_path):
            raise RuntimeError(f"FATAL: Active {name} artifact is missing at {resolved_path}.")

        actual_hash = compute_file_sha256(resolved_path)
        expected_hash = str(record.get('artifactSha256', '')).lower()
        if len(expected_hash) != 64 or actual_hash != expected_hash:
            raise RuntimeError(
                f"FATAL: SHA-256 integrity mismatch for active model {name}@{record.get('version')}. "
                f"Expected {expected_hash or '<missing>'}; actual {actual_hash}. Model will not be served."
            )

        model = joblib.load(resolved_path)
        active_model_records[name] = record
        verified_model_hashes[name] = actual_hash
        if name == 'triage':
            triage_model = model
        else:
            model_key = MODEL_FILES[name][1]
            if not hasattr(model, 'predict_risk'):
                raise RuntimeError(f"FATAL: Active {name} artifact has no screening predict_risk method.")
            model.operating_threshold = threshold
            condition_models[model_key] = model

    triage_card_path = os.path.join(models_root, 'models', 'triage_model_card.json')
    if os.path.exists(triage_card_path):
        with open(triage_card_path, 'r', encoding='utf-8') as f:
            triage_card = json.load(f)
    screening_summary_path = os.path.join(models_root, 'models', 'screening_summary.json')
    if os.path.exists(screening_summary_path):
        with open(screening_summary_path, 'r', encoding='utf-8') as f:
            screening_summary = json.load(f)
    map_path = os.path.join(models_root, 'data', 'condition_specialty_map.json')
    if os.path.exists(map_path):
        with open(map_path, 'r', encoding='utf-8') as f:
            condition_specialty_map = json.load(f)


def require_active_model(name: str) -> dict:
    record = active_model_records.get(name)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Model {name!r} is unregistered or has no active version; prediction refused.",
        )
    return record


def model_response_metadata(name: str) -> dict:
    record = require_active_model(name)
    return {
        'modelName': name,
        'modelVersion': record['version'],
        'artifactSha256Prefix': record['artifactSha256'][:12],
    }



# =============================================================================
# PYDANTIC SCHEMAS WITH RIGID PHYSIOLOGICAL BOUND VALIDATION
# =============================================================================
class TriageSeverityRequest(BaseModel):
    age: Optional[float] = Field(None, ge=0.0, le=125.0, description="Patient age in years (0 - 125)")
    gender: Optional[str] = Field("UNKNOWN", description="Gender: M, F, or OTHER")
    arrival_transport: Optional[str] = Field("WALK IN", description="Arrival mode: WALK IN, AMBULANCE, OTHER")
    temperature: Optional[float] = Field(None, ge=25.0, le=115.0, description="Body temperature in Celsius (25-45) or Fahrenheit (77-115)")
    heartrate: Optional[float] = Field(None, ge=20.0, le=260.0, description="Heart rate in beats/min (20 - 260)")
    resprate: Optional[float] = Field(None, ge=4.0, le=70.0, description="Respiratory rate in breaths/min (4 - 70)")
    o2sat: Optional[float] = Field(None, ge=50.0, le=100.0, description="Oxygen saturation SpO2 % (50 - 100)")
    sbp: Optional[float] = Field(None, ge=40.0, le=300.0, description="Systolic blood pressure mmHg (40 - 300)")
    dbp: Optional[float] = Field(None, ge=20.0, le=200.0, description="Diastolic blood pressure mmHg (20 - 200)")
    pain: Optional[float] = Field(None, ge=0.0, le=10.0, description="Numeric pain score (0 - 10)")

    @field_validator('gender')
    def validate_gender(cls, v):
        if v and str(v).upper() in ['M', 'MALE']:
            return 'M'
        if v and str(v).upper() in ['F', 'FEMALE']:
            return 'F'
        return 'UNKNOWN'


class TriageSeverityResponse(BaseModel):
    riskScore: float
    riskCategory: str
    thresholdUsed: float
    topContributors: List[str]
    missingInputs: List[str]
    modelName: str
    modelVersion: str
    artifactSha256Prefix: str
    dataSource: str
    notice: str


class FullPatientAssessmentRequest(BaseModel):
    # Demographics & Intake
    age: Optional[float] = Field(52.0, ge=0.0, le=125.0)
    gender: Optional[str] = Field("UNKNOWN")
    arrival_transport: Optional[str] = Field("WALK IN")
    is_pregnant: Optional[bool] = Field(False)

    # Vitals
    temperature: Optional[float] = Field(None, ge=25.0, le=115.0)
    heartrate: Optional[float] = Field(None, ge=20.0, le=260.0)
    resprate: Optional[float] = Field(None, ge=4.0, le=70.0)
    o2sat: Optional[float] = Field(None, ge=50.0, le=100.0)
    sbp: Optional[float] = Field(None, ge=40.0, le=300.0)
    dbp: Optional[float] = Field(None, ge=20.0, le=200.0)
    pain: Optional[float] = Field(None, ge=0.0, le=10.0)

    # Symptoms / Emergency flags
    chest_pain: Optional[bool] = Field(False)
    stroke_signs: Optional[bool] = Field(False)
    altered_consciousness: Optional[bool] = Field(False)
    avpu: Optional[str] = Field("Alert")

    # Diabetes fields
    Glucose: Optional[float] = Field(None, ge=20.0, le=1000.0)
    BMI: Optional[float] = Field(None, ge=10.0, le=80.0)
    Insulin: Optional[float] = Field(None, ge=0.0, le=1000.0)
    SkinThickness: Optional[float] = Field(None, ge=0.0, le=100.0)
    DiabetesPedigreeFunction: Optional[float] = Field(None, ge=0.0, le=3.0)
    Pregnancies: Optional[float] = Field(None, ge=0.0, le=20.0)

    # Cardiac fields
    cp: Optional[Any] = Field(None, description="Chest pain type 1, 2, 3, or 4")
    trestbps: Optional[float] = Field(None, ge=40.0, le=300.0)
    chol: Optional[float] = Field(None, ge=50.0, le=700.0)
    fbs: Optional[Any] = Field(None)
    restecg: Optional[Any] = Field(None)
    thalach: Optional[float] = Field(None, ge=40.0, le=250.0)
    exang: Optional[Any] = Field(None)
    oldpeak: Optional[float] = Field(None, ge=0.0, le=10.0)
    slope: Optional[Any] = Field(None)
    ca: Optional[Any] = Field(None)
    thal: Optional[Any] = Field(None)

    # Liver fields
    tb: Optional[float] = Field(None, ge=0.1, le=50.0, description="Total bilirubin mg/dL")
    db: Optional[float] = Field(None, ge=0.0, le=30.0, description="Direct bilirubin mg/dL")
    alkphos: Optional[float] = Field(None, ge=10.0, le=2500.0)
    sgpt: Optional[float] = Field(None, ge=1.0, le=2500.0, description="ALT/SGPT U/L")
    sgot: Optional[float] = Field(None, ge=1.0, le=2500.0, description="AST/SGOT U/L")
    tp: Optional[float] = Field(None, ge=1.0, le=15.0, description="Total protein g/dL")
    alb: Optional[float] = Field(None, ge=0.5, le=8.0, description="Albumin g/dL")
    ag_ratio: Optional[float] = Field(None, ge=0.1, le=5.0)

    # Renal fields
    sc: Optional[float] = Field(None, ge=0.1, le=25.0, description="Serum creatinine mg/dL")
    bu: Optional[float] = Field(None, ge=1.0, le=350.0, description="Blood urea mg/dL")
    bgr: Optional[float] = Field(None, ge=20.0, le=600.0, description="Blood glucose random")
    sod: Optional[float] = Field(None, ge=80.0, le=180.0)
    pot: Optional[float] = Field(None, ge=1.0, le=12.0)
    hemo: Optional[float] = Field(None, ge=1.0, le=25.0, description="Hemoglobin g/dL")
    bp: Optional[float] = Field(None, ge=40.0, le=300.0)

    # Thyroid fields
    TSH: Optional[float] = Field(None, ge=0.001, le=250.0, description="TSH mIU/L")
    T3: Optional[float] = Field(None, ge=0.0, le=15.0)
    TT4: Optional[float] = Field(None, ge=1.0, le=500.0, description="Total T4 nmol/L")
    T4U: Optional[float] = Field(None, ge=0.1, le=3.0)
    FTI: Optional[float] = Field(None, ge=1.0, le=500.0)


# =============================================================================
# ENDPOINT 1: PREDICT SEVERITY (TRIAGE ONLY)
# =============================================================================
@app.post("/predict-severity", response_model=TriageSeverityResponse)
def predict_severity(payload: TriageSeverityRequest, model_name: str = Query('triage', alias='modelName')):
    record = require_active_model(model_name)
    if model_name != 'triage':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The predict-severity endpoint does not support model {model_name!r}.",
        )
    if triage_model is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Active triage artifact was not loaded.")

    patient_dict = payload.model_dump()
    missing_inputs = [k for k, v in patient_dict.items() if v is None and k in ['o2sat', 'sbp', 'heartrate', 'resprate']]

    # Clean temperature (convert F to C if > 45)
    temp = patient_dict.get('temperature')
    if temp is not None and temp > 45.0:
        temp = (temp - 32.0) * 5.0 / 9.0

    # Build input DataFrame
    row = {
        'age': patient_dict.get('age') or 52.0,
        'gender': patient_dict.get('gender') or 'UNKNOWN',
        'arrival_transport': patient_dict.get('arrival_transport') or 'WALK IN',
        'temperature': temp,
        'heartrate': patient_dict.get('heartrate'),
        'resprate': patient_dict.get('resprate'),
        'o2sat': patient_dict.get('o2sat'),
        'sbp': patient_dict.get('sbp'),
        'dbp': patient_dict.get('dbp'),
        'pain': patient_dict.get('pain'),
        'o2sat_missing': 1 if patient_dict.get('o2sat') is None else 0,
        'temperature_missing': 1 if temp is None else 0,
        'pain_missing': 1 if patient_dict.get('pain') is None else 0
    }

    input_df = pd.DataFrame([row])
    prob = float(triage_model.predict_proba(input_df)[0, 1])

    threshold = record['threshold']
    is_high_acuity = prob >= threshold
    category = "high_acuity" if is_high_acuity else "lower_acuity"

    # Explain top contributors
    contributors = []
    if row['o2sat'] is not None and row['o2sat'] < 94:
        contributors.append(f"Subnormal oxygen saturation SpO2 ({row['o2sat']}%)")
    if row['heartrate'] is not None and (row['heartrate'] > 105 or row['heartrate'] < 50):
        contributors.append(f"Abnormal heart rate ({row['heartrate']} bpm)")
    if row['sbp'] is not None and (row['sbp'] > 150 or row['sbp'] < 95):
        contributors.append(f"Abnormal systolic blood pressure ({row['sbp']} mmHg)")
    if row['resprate'] is not None and (row['resprate'] > 22 or row['resprate'] < 10):
        contributors.append(f"Tachypneic/bradypneic respiratory rate ({row['resprate']} breaths/min)")
    if row['arrival_transport'] == 'AMBULANCE':
        contributors.append("Emergency ambulance arrival mode")

    if not contributors:
        contributors.append("Baseline vital parameters within non-critical range")

    return TriageSeverityResponse(
        riskScore=round(prob, 4),
        riskCategory=category,
        thresholdUsed=round(threshold, 3),
        topContributors=contributors[:4],
        missingInputs=missing_inputs,
        modelName=model_name,
        modelVersion=record['version'],
        artifactSha256Prefix=record['artifactSha256'][:12],
        dataSource=record['datasetName'],
        notice=MANDATORY_DISCLAIMER
    )


# =============================================================================
# ENDPOINT 2: FULL CLINICAL ASSESSMENT
# =============================================================================
@app.post("/assess")
def assess_patient(payload: FullPatientAssessmentRequest):
    expected_models = list(MODEL_FILES)
    missing_active = [name for name in expected_models if name not in active_model_records]
    if missing_active:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Assessment refused; no active registered version for: {', '.join(missing_active)}.",
        )

    p_dict = payload.model_dump()
    # Normalize sync fields
    if p_dict.get('trestbps') is None and p_dict.get('sbp') is not None:
        p_dict['trestbps'] = p_dict['sbp']
    if p_dict.get('bp') is None and p_dict.get('sbp') is not None:
        p_dict['bp'] = p_dict['sbp']

    # 1. Rule-based emergency red flags
    red_flags = evaluate_red_flags(p_dict)

    # 2. Triage model prediction
    triage_urgency = "routine"
    triage_contributors = []
    triage_res = predict_severity(TriageSeverityRequest(**p_dict), model_name='triage')
    if triage_res.riskCategory == "high_acuity":
        triage_urgency = "urgent"
    triage_contributors = triage_res.topContributors

    # 3. Screening models execution
    risks = []
    missing_tests = []
    flagged_specialties = []
    required_facilities = set()
    condition_urgencies = []
    explanations = []

    # ML Condition Models
    for cond_key, model_obj in condition_models.items():
        res = model_obj.predict_risk(p_dict)
        if res.get('status') == 'insufficient_data':
            missing_tests.extend(res.get('missing_tests', []))
        elif res.get('status') == 'evaluated':
            risks.append({
                "condition": res['condition'],
                "icd10": res['icd10'],
                "specialty": res['specialty'],
                "risk_score": res['risk_score'],
                "threshold": res['operating_threshold'],
                "flagged": res['flagged'],
                "top_contributors": res['top_contributors'],
                **model_response_metadata({
                    'diabetes': 'diabetes',
                    'heart_disease': 'heart',
                    'liver_disease': 'liver',
                    'ckd': 'ckd',
                    'thyroid': 'thyroid',
                }[cond_key]),
            })
            if res['flagged']:
                flagged_specialties.append(res['specialty'])
                condition_urgencies.append("urgent")
                explanations.extend(res['top_contributors'])
                # Lookup required facilities from knowledge base
                for entry in condition_specialty_map:
                    if entry['primary_specialty'].lower() == res['specialty'].lower():
                        for fac in entry.get('required_facilities', []):
                            required_facilities.add(fac)

    # 4. Rule-based models (Anemia & Hypertension)
    # Anemia
    anemia_res = screen_anemia(
        hemoglobin=p_dict.get('hemo'),
        age=p_dict.get('age'),
        sex=p_dict.get('gender'),
        is_pregnant=p_dict.get('is_pregnant', False)
    )
    if anemia_res.get('status') == 'insufficient_data':
        missing_tests.extend(anemia_res.get('missing_tests', []))
    elif anemia_res.get('flagged'):
        risks.append({
            "condition": "Anemia",
            "icd10": "D64.9",
            "specialty": "General Medicine",
            "risk_score": 1.0,
            "threshold": anemia_res['threshold_used'],
            "flagged": True,
            "severity": anemia_res['severity'],
            "top_contributors": [f"Hemoglobin {anemia_res['hemoglobin_observed']} g/dL ({anemia_res['severity']})"]
        })
        flagged_specialties.append("General Medicine")
        condition_urgencies.append(anemia_res['urgency_suggestion'])
        required_facilities.add("lab")
        if anemia_res['severity'] == 'severe':
            required_facilities.add("bloodBank")
        explanations.append(f"Anemia ({anemia_res['severity']})")

    # Hypertension
    htn_res = screen_hypertension(sbp=p_dict.get('sbp'), dbp=p_dict.get('dbp'))
    if htn_res.get('status') == 'insufficient_data':
        missing_tests.extend(htn_res.get('missing_tests', []))
    elif htn_res.get('flagged'):
        risks.append({
            "condition": "Hypertension",
            "icd10": "I10",
            "specialty": "General Medicine",
            "risk_score": 1.0,
            "threshold": 130.0,
            "flagged": True,
            "stage": htn_res['stage'],
            "top_contributors": [f"BP {htn_res['sbp_observed']}/{htn_res['dbp_observed']} mmHg ({htn_res['stage']})"]
        })
        flagged_specialties.append("General Medicine")
        condition_urgencies.append(htn_res['urgency_suggestion'])
        required_facilities.add("ecg")
        explanations.append(f"Hypertension ({htn_res['stage']})")

    # 5. Fallback if no specialties flagged
    if not flagged_specialties:
        flagged_specialties = ["General Medicine"]
        required_facilities.add("lab")

    # 6. Reconcile final urgency
    final_urgency = reconcile_urgency(
        red_flags=red_flags,
        triage_suggestion=triage_urgency,
        condition_urgencies=condition_urgencies
    )

    # Dedup and rank specialties
    unique_specialties = list(dict.fromkeys(flagged_specialties))

    return {
        "status": "success",
        "urgency": final_urgency,
        **model_response_metadata('triage'),
        "triage_urgency_suggestion": triage_urgency,
        "specialties": unique_specialties[:3],
        "required_facilities": sorted(list(required_facilities)),
        "red_flags": red_flags,
        "condition_risks": risks,
        "missing_tests": list(dict.fromkeys(missing_tests)),
        "explanations": list(dict.fromkeys(explanations + triage_contributors))[:5],
        "model_versions": {
            "triage": active_model_records['triage']['version'],
            "screening_pipeline": "1.0.0",
            "red_flags_config": "1.0.0"
        },
        "model_artifacts": [
            model_response_metadata(name) for name in expected_models
        ],
        "disclaimer": MANDATORY_DISCLAIMER
    }


# =============================================================================
# DOCUMENTED EXAMPLES ENDPOINT
# =============================================================================
@app.get("/examples")
def get_example_cases():
    """Returns 3 diverse clinical example requests and expected responses."""
    examples_path = os.path.join(os.path.dirname(__file__), 'examples.json')
    if os.path.exists(examples_path):
        with open(examples_path, 'r') as f:
            return json.load(f)
    return {"message": "Examples documentation file."}


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "CareBridge ML Decision Support",
        "triage_model_loaded": triage_model is not None,
        "condition_models_count": len(condition_models),
        "integrity_verified": True,
        "active_models": sorted(active_model_records),
    }
