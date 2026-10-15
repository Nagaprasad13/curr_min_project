"""
test_service_endpoints.py
--------------------------
Unit and integration tests for FastAPI ML endpoints:
- POST /predict-severity
- POST /assess
- Range validation & error checking
- Insufficient data handling
- Red flag bypass
"""

import os
import sys
import json
import shutil
import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

# Add ml/service to path
service_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'service')
sys.path.insert(0, service_dir)
import app as service_module
from app import (
    MODEL_FILES,
    MODELS_DIR,
    app,
    compute_file_sha256,
    load_all_artifacts,
    require_active_model,
)

def make_active_registry_fixtures():
    with open(os.path.join(MODELS_DIR, 'triage_model_card.json'), encoding='utf-8') as card_file:
        triage_card = json.load(card_file)
    with open(os.path.join(MODELS_DIR, 'screening_summary.json'), encoding='utf-8') as summary_file:
        screening_summary = json.load(summary_file)

    dataset_keys = {
        'diabetes': 'Diabetes',
        'heart': 'Heart Disease',
        'liver': 'Liver Disease',
        'ckd': 'Chronic Kidney Disease',
        'thyroid': 'Thyroid Disorder',
    }
    records = []
    for name, (filename, _) in MODEL_FILES.items():
        result = triage_card if name == 'triage' else screening_summary[dataset_keys[name]]
        threshold = result['operatingThreshold'] if name == 'triage' else result['operating_threshold']
        version = result['version'] if name == 'triage' else '1.0.0'
        records.append({
            'modelId': f'ML-{name.upper()}-TEST',
            'name': name,
            'version': version,
            'status': 'active',
            'artifactPath': f'models/{filename}',
            'artifactSha256': compute_file_sha256(os.path.join(MODELS_DIR, filename)),
            'threshold': threshold,
            'datasetName': 'MIMIC-IV-ED Demo v2.2' if name == 'triage' else result['condition'],
            'datasetSource': 'public benchmark test fixture',
        })
    return records


# The ML service unit tests inject registry documents; backend integration tests use MongoMemoryServer.
REGISTRY_FIXTURES = make_active_registry_fixtures()
load_all_artifacts(REGISTRY_FIXTURES)
client = TestClient(app)


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "healthy"
    assert data["triage_model_loaded"] is True
    assert data["condition_models_count"] >= 5
    assert len(data["active_models"]) == 6


def test_predict_severity_valid():
    payload = {
        "age": 60.0,
        "gender": "M",
        "arrival_transport": "AMBULANCE",
        "temperature": 37.2,
        "heartrate": 115.0,
        "resprate": 26.0,
        "o2sat": 91.0,
        "sbp": 160.0,
        "dbp": 95.0,
        "pain": 7.0
    }
    res = client.post("/predict-severity", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "riskScore" in data
    assert 0.0 <= data["riskScore"] <= 1.0
    assert data["riskCategory"] in ["high_acuity", "lower_acuity"]
    assert len(data["topContributors"]) > 0
    assert data["modelName"] == "triage"
    assert data["modelVersion"] == "1.0.0"
    assert len(data["artifactSha256Prefix"]) == 12
    assert "Decision support only" in data["notice"]


def test_unregistered_model_request_is_refused():
    with pytest.raises(HTTPException) as exc_info:
        require_active_model('unknown_model')
    assert exc_info.value.status_code == 503
    assert 'prediction refused' in exc_info.value.detail
    response = client.post('/predict-severity?modelName=unknown_model', json={})
    assert response.status_code == 503
    assert 'prediction refused' in response.json()['detail']


def test_candidate_model_is_not_loaded_or_served():
    triage = dict(REGISTRY_FIXTURES[0], status='candidate')
    load_all_artifacts([triage])
    with pytest.raises(HTTPException) as exc_info:
        require_active_model('triage')
    assert exc_info.value.status_code == 503
    response = client.post('/predict-severity', json={})
    assert response.status_code == 503
    load_all_artifacts(REGISTRY_FIXTURES)


def test_tampered_artifact_is_rejected(tmp_path):
    models_dir = tmp_path / 'models'
    models_dir.mkdir()
    original = os.path.join(MODELS_DIR, 'triage_model.joblib')
    tampered = models_dir / 'triage_model.joblib'
    shutil.copyfile(original, tampered)
    with tampered.open('ab') as artifact_file:
        artifact_file.write(b'tampered')

    triage = dict(REGISTRY_FIXTURES[0], artifactPath='models/triage_model.joblib')
    with pytest.raises(RuntimeError, match='SHA-256 integrity mismatch'):
        load_all_artifacts([triage], models_root=str(tmp_path))
    assert service_module.triage_model is None
    assert client.post('/predict-severity', json={}).status_code == 503
    load_all_artifacts(REGISTRY_FIXTURES)


def test_predict_severity_out_of_range_error():
    # Negative heart rate should trigger 422 Unprocessable Entity
    invalid_payload = {
        "heartrate": -10.0,
        "o2sat": 110.0  # SpO2 > 100 is invalid
    }
    res = client.post("/predict-severity", json=invalid_payload)
    assert res.status_code == 422
    errors = res.json()["detail"]
    assert any("heartrate" in str(e["loc"]) for e in errors)


def test_assess_emergency_red_flag_bypass():
    # SpO2 = 85 should trigger severe hypoxemia red flag and emergency urgency
    payload = {
        "age": 65.0,
        "gender": "F",
        "o2sat": 85.0,
        "sbp": 120.0,
        "dbp": 80.0,
        "heartrate": 90.0,
        "resprate": 28.0
    }
    res = client.post("/assess", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["urgency"] == "emergency"
    assert len(data["red_flags"]) >= 1
    assert any(rf["rule_id"] == "RF-SPO2-CRITICAL" for rf in data["red_flags"])


def test_assess_renal_condition_routing():
    # High creatinine and urea should flag Chronic Kidney Disease and map to Nephrology + dialysis
    payload = {
        "age": 55.0,
        "gender": "M",
        "sbp": 150.0,
        "dbp": 95.0,
        "heartrate": 75.0,
        "o2sat": 98.0,
        "sc": 4.5,
        "bu": 90.0,
        "hemo": 9.2,
        "bp": 150.0
    }
    res = client.post("/assess", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "Nephrology" in data["specialties"]
    assert "dialysis" in data["required_facilities"]
    assert data["urgency"] in ["urgent", "emergency"]
    assert len(data["model_artifacts"]) == 6
    assert data["modelName"] == "triage"
    assert data["modelVersion"] == "1.0.0"
    assert len(data["artifactSha256Prefix"]) == 12
    assert all(len(model["artifactSha256Prefix"]) == 12 for model in data["model_artifacts"])


def test_assess_insufficient_data():
    # Bare minimum demographics without vitals or labs
    payload = {
        "age": 30.0,
        "gender": "F"
    }
    res = client.post("/assess", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert len(data["missing_tests"]) > 0
    assert "Glucose" in data["missing_tests"] or "hemo" in data["missing_tests"] or "sbp" in data["missing_tests"]


if __name__ == '__main__':
    pytest.main([__file__, "-v"])
