"""
rule_based_screening.py
-----------------------
Deterministic, rule-based screening modules for Anemia and Hypertension.
Strictly rule-based (NO ML). Every threshold is cited to authoritative clinical guidelines.
"""

from typing import Dict, Any, Optional


def screen_anemia(hemoglobin: Optional[float], age: Optional[float] = 30.0, sex: Optional[str] = 'F', is_pregnant: bool = False) -> Dict[str, Any]:
    """
    Screens for anemia based on hemoglobin levels using WHO clinical guidelines.

    Citation:
    World Health Organization (WHO). Haemoglobin concentrations for the diagnosis of
    anaemia and assessment of severity. Vitamin and Mineral Nutrition Information System.
    Geneva, World Health Organization, 2011 (WHO/NMH/NHD/MNM/11.1).

    Thresholds:
    - Children 6-59 months: Hb < 11.0 g/dL
    - Children 5-11 years: Hb < 11.5 g/dL
    - Children 12-14 years: Hb < 12.0 g/dL
    - Non-pregnant adult females (>= 15y): Hb < 12.0 g/dL
    - Pregnant females: Hb < 11.0 g/dL
    - Adult males (>= 15y): Hb < 13.0 g/dL
    Severity grading (for non-pregnant adult females):
    - Mild: 11.0 - 11.9 g/dL
    - Moderate: 8.0 - 10.9 g/dL
    - Severe: < 8.0 g/dL
    """
    if hemoglobin is None:
        return {
            "status": "insufficient_data",
            "condition": "Anemia",
            "icd10": "D64.9",
            "missing_tests": ["hemoglobin"],
            "message": "Hemoglobin laboratory value is required to assess anemia."
        }

    hb = float(hemoglobin)
    sex_norm = str(sex).strip().upper() if sex else 'F'
    age_val = float(age) if age is not None else 30.0

    # Determine cutoff based on WHO criteria
    if is_pregnant:
        cutoff = 11.0
        mild_lower, mod_lower = 10.0, 7.0
        group = "Pregnant women"
    elif age_val < 5.0:
        cutoff = 11.0
        mild_lower, mod_lower = 10.0, 7.0
        group = "Children 6-59 months"
    elif age_val < 12.0:
        cutoff = 11.5
        mild_lower, mod_lower = 11.0, 8.0
        group = "Children 5-11 years"
    elif age_val < 15.0:
        cutoff = 12.0
        mild_lower, mod_lower = 11.0, 8.0
        group = "Children 12-14 years"
    elif sex_norm in ['M', 'MALE']:
        cutoff = 13.0
        mild_lower, mod_lower = 11.0, 8.0
        group = "Adult Men (>= 15y)"
    else:
        cutoff = 12.0
        mild_lower, mod_lower = 11.0, 8.0
        group = "Non-pregnant Adult Women (>= 15y)"

    is_anemic = hb < cutoff

    if not is_anemic:
        severity = "normal"
        flag = False
        urgency = "routine"
    elif hb < mod_lower:
        severity = "severe"
        flag = True
        urgency = "urgent" if hb >= 6.5 else "emergency"  # Critically low Hb < 6.5 g/dL triggers emergency referral
    elif hb < mild_lower:
        severity = "moderate"
        flag = True
        urgency = "urgent"
    else:
        severity = "mild"
        flag = True
        urgency = "routine"

    return {
        "status": "evaluated",
        "condition": "Anemia",
        "icd10": "D64.9",
        "flagged": flag,
        "hemoglobin_observed": hb,
        "threshold_used": cutoff,
        "severity": severity,
        "demographic_group": group,
        "urgency_suggestion": urgency,
        "citation": "WHO Haemoglobin concentrations for the diagnosis of anaemia (2011)"
    }


def screen_hypertension(sbp: Optional[float], dbp: Optional[float]) -> Dict[str, Any]:
    """
    Screens for hypertension based on resting blood pressure using 2017 ACC/AHA guidelines.

    Citation:
    Whelton PK et al. 2017 ACC/AHA/AAPA/ABC/ACPM/AGS/APhA/ASH/ASPC/NMA/PCNA Guideline
    for the Prevention, Detection, Evaluation, and Management of High Blood Pressure
    in Adults. J Am Coll Cardiol. 2018;71(19):e127-e248.

    Categories:
    - Normal: SBP < 120 and DBP < 80 mmHg
    - Elevated: SBP 120-129 and DBP < 80 mmHg
    - Stage 1 Hypertension: SBP 130-139 or DBP 80-89 mmHg
    - Stage 2 Hypertension: SBP >= 140 or DBP >= 90 mmHg
    - Hypertensive Crisis: SBP > 180 and/or DBP > 120 mmHg (Emergency escalation)
    """
    missing = []
    if sbp is None:
        missing.append("sbp")
    if dbp is None:
        missing.append("dbp")

    if missing:
        return {
            "status": "insufficient_data",
            "condition": "Hypertension",
            "icd10": "I10",
            "missing_tests": missing,
            "message": "Both systolic and diastolic blood pressure values are required."
        }

    s = float(sbp)
    d = float(dbp)

    if s > 180.0 or d > 120.0:
        stage = "Hypertensive Crisis"
        flag = True
        urgency = "emergency"
    elif s >= 140.0 or d >= 90.0:
        stage = "Stage 2 Hypertension"
        flag = True
        urgency = "urgent"
    elif s >= 130.0 or (d >= 80.0 and d <= 89.0):
        stage = "Stage 1 Hypertension"
        flag = True
        urgency = "routine"
    elif 120.0 <= s <= 129.0 and d < 80.0:
        stage = "Elevated Blood Pressure"
        flag = False
        urgency = "routine"
    else:
        stage = "Normal Blood Pressure"
        flag = False
        urgency = "routine"

    return {
        "status": "evaluated",
        "condition": "Hypertension",
        "icd10": "I10",
        "flagged": flag,
        "sbp_observed": s,
        "dbp_observed": d,
        "stage": stage,
        "urgency_suggestion": urgency,
        "citation": "2017 ACC/AHA High Blood Pressure Clinical Practice Guideline"
    }
