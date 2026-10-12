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
import pytest
from fastapi.testclient import TestClient

# Add ml/service to path
service_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'service')
sys.path.insert(0, service_dir)
from app import app, load_all_artifacts

# Ensure artifacts are loaded for tests
load_all_artifacts()
client = TestClient(app)


def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["triage_model_loaded"] is True
    assert data["condition_models_count"] >= 5


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
    assert res.status_code == 200
    data = res.json()
    assert "riskScore" in data
    assert 0.0 <= data["riskScore"] <= 1.0
    assert data["riskCategory"] in ["high_acuity", "lower_acuity"]
    assert len(data["topContributors"]) > 0
    assert "Decision support only" in data["notice"]


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
    assert res.status_code == 200
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
    assert res.status_code == 200
    data = res.json()
    assert "Nephrology" in data["specialties"]
    assert "dialysis" in data["required_facilities"]
    assert data["urgency"] in ["urgent", "emergency"]


def test_assess_insufficient_data():
    # Bare minimum demographics without vitals or labs
    payload = {
        "age": 30.0,
        "gender": "F"
    }
    res = client.post("/assess", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["missing_tests"]) > 0
    assert "Glucose" in data["missing_tests"] or "hemo" in data["missing_tests"] or "sbp" in data["missing_tests"]


if __name__ == '__main__':
    pytest.main([__file__, "-v"])
