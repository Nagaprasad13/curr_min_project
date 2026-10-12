"""
decision_layer.py
-----------------
Decision fusion, rule-based red flag checking, condition aggregation,
and urgency reconciliation for CareBridge clinical decision support.
"""

import os
import json
from typing import Dict, Any, List, Optional

URGENCY_RANK = {
    'routine': 1,
    'urgent': 2,
    'emergency': 3
}

MANDATORY_DISCLAIMER = (
    "Decision support only. A clinician must review. Models were trained on non-Tamil Nadu "
    "public data and have not been validated for Tamil Nadu. Suspected emergencies follow "
    "standard emergency protocols regardless of any score."
)


def load_config(filename: str) -> Dict[str, Any]:
    """Loads configuration JSON from ml/config directory."""
    path = os.path.join(os.path.dirname(__file__), 'config', filename)
    with open(path, 'r') as f:
        return json.load(f)


def evaluate_red_flags(patient: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Evaluates rule-based clinical red flags that bypass ML and demand immediate emergency care.
    """
    config = load_config('red_flags.json')
    triggered = []

    sbp = patient.get('sbp')
    dbp = patient.get('dbp')
    spo2 = patient.get('o2sat')
    hr = patient.get('heartrate')
    chest_pain = patient.get('chest_pain', False) or (patient.get('cp') in [1, 2, 3, '1', '2', '3'])
    stroke_signs = patient.get('stroke_signs', False) or patient.get('facial_droop', False) or patient.get('acute_weakness', False)
    altered_consciousness = patient.get('altered_consciousness', False) or (str(patient.get('avpu', '')).lower() in ['voice', 'pain', 'unresponsive', 'v', 'p', 'u'])

    # 1. Critical SpO2 < 90%
    if spo2 is not None:
        try:
            if float(spo2) < 90.0:
                triggered.append({
                    "rule_id": "RF-SPO2-CRITICAL",
                    "name": "Severe Hypoxemia",
                    "reason": f"SpO2 observed at {spo2}% (< 90%)",
                    "urgency": "emergency",
                    "source": "WHO Clinical Management / BTS Guidelines"
                })
        except (ValueError, TypeError):
            pass

    # 2. Chest pain with hemodynamic or respiratory instability
    if chest_pain:
        unstable = False
        reasons = []
        if sbp is not None and (float(sbp) < 90.0 or float(sbp) > 180.0):
            unstable = True
            reasons.append(f"abnormal SBP {sbp} mmHg")
        if hr is not None and float(hr) > 120.0:
            unstable = True
            reasons.append(f"tachycardia HR {hr} bpm")
        if spo2 is not None and float(spo2) < 92.0:
            unstable = True
            reasons.append(f"hypoxia SpO2 {spo2}%")

        if unstable:
            triggered.append({
                "rule_id": "RF-CHEST-PAIN-VITAL-ABNORMAL",
                "name": "Chest Pain with Instability",
                "reason": f"Chest pain presenting alongside: {', '.join(reasons)}",
                "urgency": "emergency",
                "source": "AHA/ACC Suspected ACS Emergency Triage Protocol"
            })

    # 3. Acute stroke signs
    if stroke_signs:
        triggered.append({
            "rule_id": "RF-STROKE-SIGNS",
            "name": "Acute Neurological Deficit (FAST / Stroke Signs)",
            "reason": "Presence of acute focal neurological deficits or facial droop.",
            "urgency": "emergency",
            "source": "AHA/ASA Acute Ischemic Stroke Guidelines"
        })

    # 4. Hypertensive Crisis (SBP > 180 or DBP > 120)
    if (sbp is not None and float(sbp) > 180.0) or (dbp is not None and float(dbp) > 120.0):
        triggered.append({
            "rule_id": "RF-HYPERTENSIVE-EMERGENCY",
            "name": "Hypertensive Crisis",
            "reason": f"Severely elevated BP (SBP {sbp} / DBP {dbp} mmHg)",
            "urgency": "emergency",
            "source": "2017 ACC/AHA High Blood Pressure Guidelines"
        })

    # 5. Profound Hypotension (SBP < 80)
    if sbp is not None and float(sbp) < 80.0:
        triggered.append({
            "rule_id": "RF-PROFOUND-HYPOTENSION",
            "name": "Shock / Profound Hypotension",
            "reason": f"Critical hypotension with SBP {sbp} mmHg (< 80 mmHg)",
            "urgency": "emergency",
            "source": "Surviving Sepsis Campaign Shock Protocols"
        })

    # 6. Altered Consciousness
    if altered_consciousness:
        triggered.append({
            "rule_id": "RF-ALTERED-CONSCIOUSNESS",
            "name": "Altered Mental Status",
            "reason": "Reported altered consciousness or decreased responsiveness (AVPU).",
            "urgency": "emergency",
            "source": "ATLS / GCS Emergency Thresholds"
        })

    return triggered


def reconcile_urgency(
    red_flags: List[Dict[str, Any]],
    triage_suggestion: Optional[str] = None,
    condition_urgencies: Optional[List[str]] = None
) -> str:
    """
    Computes final fused urgency as the MAXIMUM of:
    1. Any triggered red flag (guarantees 'emergency')
    2. Triage model suggestion ('routine', 'urgent', or 'emergency')
    3. Condition escalation rules
    """
    highest_rank = 1
    current_urgency = 'routine'

    # Check red flags
    if red_flags:
        for rf in red_flags:
            u = rf.get('urgency', 'emergency')
            if URGENCY_RANK.get(u, 1) > highest_rank:
                highest_rank = URGENCY_RANK[u]
                current_urgency = u

    # Check triage model
    if triage_suggestion:
        t_rank = URGENCY_RANK.get(triage_suggestion.lower(), 1)
        if t_rank > highest_rank:
            highest_rank = t_rank
            current_urgency = triage_suggestion.lower()

    # Check condition urgencies
    if condition_urgencies:
        for cu in condition_urgencies:
            c_rank = URGENCY_RANK.get(cu.lower(), 1)
            if c_rank > highest_rank:
                highest_rank = c_rank
                current_urgency = cu.lower()

    return current_urgency
