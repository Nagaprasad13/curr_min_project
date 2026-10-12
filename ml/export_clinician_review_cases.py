"""
export_clinician_review_cases.py
--------------------------------
Generates and exports 35 structured clinical cases for a clinician to review
specialty agreement (top-1 and top-2 specialty suggestions) and required facility recommendations.
"""

import os
import json
import csv

def generate_clinician_audit_cases():
    cases = [
        # Cardiac Cases
        {"case_id": "REV-001", "age": 62, "sex": "M", "sbp": 154, "dbp": 92, "heartrate": 88, "o2sat": 96, "chest_pain": True, "symptoms": "Substernal pressure on walking 100m", "primary_suspected": "Cardiology", "secondary_suspected": "General Medicine", "required_facilities": ["ecg", "echo", "cardiacCathLab"], "urgency": "urgent"},
        {"case_id": "REV-002", "age": 48, "sex": "F", "sbp": 86, "dbp": 54, "heartrate": 128, "o2sat": 89, "chest_pain": True, "symptoms": "Crushing chest pain radiating to left arm with diaphoresis", "primary_suspected": "Cardiology", "secondary_suspected": "Emergency Medicine", "required_facilities": ["ecg", "cardiacCathLab", "ventilators"], "urgency": "emergency"},
        {"case_id": "REV-003", "age": 70, "sex": "M", "sbp": 130, "dbp": 80, "heartrate": 115, "o2sat": 95, "symptoms": "Irregular heart palpitations and dizziness for 3 days", "primary_suspected": "Cardiology", "secondary_suspected": "General Medicine", "required_facilities": ["ecg", "echo"], "urgency": "urgent"},
        
        # Renal / CKD Cases
        {"case_id": "REV-004", "age": 55, "sex": "M", "sc": 4.2, "bu": 88, "hemo": 9.1, "bp": 160, "symptoms": "Bilateral pitting pedal edema, persistent nausea and oliguria", "primary_suspected": "Nephrology", "secondary_suspected": "General Medicine", "required_facilities": ["dialysis", "lab"], "urgency": "urgent"},
        {"case_id": "REV-005", "age": 34, "sex": "F", "sc": 1.6, "bu": 42, "hemo": 11.2, "bp": 130, "symptoms": "Persistent microalbuminuria noted on routine diabetic checkup", "primary_suspected": "Nephrology", "secondary_suspected": "Endocrinology", "required_facilities": ["lab"], "urgency": "routine"},
        {"case_id": "REV-006", "age": 68, "sex": "M", "sc": 7.8, "bu": 140, "pot": 6.8, "symptoms": "Anuria for 24 hours with confusion and metabolic acidosis", "primary_suspected": "Nephrology", "secondary_suspected": "Emergency Medicine", "required_facilities": ["dialysis", "icu"], "urgency": "emergency"},
        
        # Endocrine / Diabetes Cases
        {"case_id": "REV-007", "age": 45, "sex": "F", "Glucose": 280, "BMI": 32.4, "HbA1c": 10.2, "symptoms": "Polyuria, polydipsia, non-healing foot ulcer for 2 weeks", "primary_suspected": "Endocrinology", "secondary_suspected": "General Surgery", "required_facilities": ["lab", "endocrinologyLab"], "urgency": "urgent"},
        {"case_id": "REV-008", "age": 22, "sex": "F", "Glucose": 440, "sbp": 95, "dbp": 60, "heartrate": 125, "symptoms": "Kussmaul breathing, fruity breath odor, persistent vomiting, altered sensorium", "primary_suspected": "Endocrinology", "secondary_suspected": "Emergency Medicine", "required_facilities": ["icu", "lab"], "urgency": "emergency"},
        {"case_id": "REV-009", "age": 58, "sex": "M", "Glucose": 165, "BMI": 27.1, "symptoms": "Mild fatigue, fasting plasma glucose 165 mg/dL", "primary_suspected": "Endocrinology", "secondary_suspected": "General Medicine", "required_facilities": ["lab"], "urgency": "routine"},

        # Liver / GI Cases
        {"case_id": "REV-010", "age": 52, "sex": "M", "tb": 4.5, "sgpt": 98, "sgot": 115, "alb": 2.4, "symptoms": "Deep scleral icterus, abdominal distension with fluid thrill, clay-colored stools", "primary_suspected": "Gastroenterology", "secondary_suspected": "General Medicine", "required_facilities": ["ultrasound", "lab"], "urgency": "urgent"},
        {"case_id": "REV-011", "age": 46, "sex": "M", "sbp": 82, "dbp": 50, "heartrate": 130, "symptoms": "Massive hematemesis and melena, history of alcoholic liver disease", "primary_suspected": "Gastroenterology", "secondary_suspected": "General Surgery", "required_facilities": ["bloodBank", "icu", "operationTheatres"], "urgency": "emergency"},
        {"case_id": "REV-012", "age": 39, "sex": "F", "tb": 1.4, "sgpt": 52, "sgot": 48, "symptoms": "Mild right upper quadrant ache, ultrasound showing fatty liver grade 1", "primary_suspected": "Gastroenterology", "secondary_suspected": "General Medicine", "required_facilities": ["ultrasound"], "urgency": "routine"},

        # Neurological / Stroke Cases
        {"case_id": "REV-013", "age": 66, "sex": "M", "stroke_signs": True, "symptoms": "Sudden onset right-sided hemiparesis and expressive aphasia (onset 75 mins ago)", "primary_suspected": "Neurology", "secondary_suspected": "Neurosurgery", "required_facilities": ["ctScan", "mri", "strokeUnit"], "urgency": "emergency"},
        {"case_id": "REV-014", "age": 59, "sex": "F", "sbp": 210, "dbp": 118, "symptoms": "Sudden thunderclap headache, neck stiffness, photophobia", "primary_suspected": "Neurology", "secondary_suspected": "Neurosurgery", "required_facilities": ["ctScan", "mri", "icu"], "urgency": "emergency"},
        {"case_id": "REV-015", "age": 72, "sex": "M", "symptoms": "Gradual resting hand tremor, cogwheel rigidity, gait instability over 6 months", "primary_suspected": "Neurology", "secondary_suspected": "General Medicine", "required_facilities": ["mri"], "urgency": "routine"},

        # Thyroid Disorders
        {"case_id": "REV-016", "age": 38, "sex": "F", "TSH": 18.5, "TT4": 42.0, "symptoms": "Severe lethargy, cold intolerance, constipation, significant weight gain", "primary_suspected": "Endocrinology", "secondary_suspected": "General Medicine", "required_facilities": ["lab", "endocrinologyLab"], "urgency": "routine"},
        {"case_id": "REV-017", "age": 31, "sex": "F", "TSH": 0.02, "TT4": 180.0, "heartrate": 135, "temperature": 39.4, "symptoms": "Extreme agitation, hyperpyrexia, high-output heart failure (suspected thyroid storm)", "primary_suspected": "Endocrinology", "secondary_suspected": "Emergency Medicine", "required_facilities": ["icu", "lab"], "urgency": "emergency"},

        # Anemia & Hematology Cases
        {"case_id": "REV-018", "age": 28, "sex": "F", "hemo": 5.4, "sbp": 92, "heartrate": 112, "is_pregnant": True, "symptoms": "Third-trimester pregnancy, profound pallor, syncope on standing", "primary_suspected": "Obstetrics & Gynecology", "secondary_suspected": "General Medicine", "required_facilities": ["bloodBank", "lab"], "urgency": "emergency"},
        {"case_id": "REV-019", "age": 42, "sex": "F", "hemo": 9.2, "symptoms": "Easy fatigability, koilonychia, exertional dyspnea", "primary_suspected": "General Medicine", "secondary_suspected": "Hematology", "required_facilities": ["lab"], "urgency": "routine"},

        # Hypertension Cases
        {"case_id": "REV-020", "age": 54, "sex": "M", "sbp": 204, "dbp": 128, "symptoms": "Blurry vision, severe occipital throbbing headache, bilateral retinal hemorrhages", "primary_suspected": "General Medicine", "secondary_suspected": "Cardiology", "required_facilities": ["ecg", "lab"], "urgency": "emergency"},
        {"case_id": "REV-021", "age": 49, "sex": "M", "sbp": 146, "dbp": 94, "symptoms": "Asymptomatic elevated blood pressure detected during dental clearance", "primary_suspected": "General Medicine", "secondary_suspected": "Cardiology", "required_facilities": ["ecg"], "urgency": "routine"},

        # Additional multi-morbidity and symptom cluster review cases
        {"case_id": "REV-022", "age": 64, "sex": "M", "Glucose": 220, "sc": 2.4, "sbp": 165, "symptoms": "Type 2 diabetes with progressive nephropathy and peripheral neuropathy", "primary_suspected": "Nephrology", "secondary_suspected": "Endocrinology", "required_facilities": ["lab", "dialysis"], "urgency": "urgent"},
        {"case_id": "REV-023", "age": 57, "sex": "F", "chest_pain": True, "Glucose": 210, "sbp": 140, "symptoms": "Diabetic atypical angina, central chest burning, negative troponin", "primary_suspected": "Cardiology", "secondary_suspected": "Endocrinology", "required_facilities": ["ecg", "echo"], "urgency": "urgent"},
        {"case_id": "REV-024", "age": 76, "sex": "M", "resprate": 32, "o2sat": 87, "symptoms": "Acute exacerbation of COPD with purulent sputum, accessory muscle use", "primary_suspected": "Pulmonology", "secondary_suspected": "Emergency Medicine", "required_facilities": ["ventilators", "xray"], "urgency": "emergency"},
        {"case_id": "REV-025", "age": 35, "sex": "M", "symptoms": "Acute right iliac fossa pain with rebound tenderness, high fever 38.8C", "primary_suspected": "General Surgery", "secondary_suspected": "Emergency Medicine", "required_facilities": ["operationTheatres", "ultrasound"], "urgency": "urgent"},
        {"case_id": "REV-026", "age": 19, "sex": "F", "symptoms": "High fever, petechial rash, platelet count 28,000 /uL", "primary_suspected": "General Medicine", "secondary_suspected": "Hematology", "required_facilities": ["bloodBank", "lab"], "urgency": "emergency"},
        {"case_id": "REV-027", "age": 61, "sex": "F", "symptoms": "Progressive dysphagia to solids then liquids, 12 kg weight loss in 3 months", "primary_suspected": "Gastroenterology", "secondary_suspected": "Oncology", "required_facilities": ["operationTheatres", "lab"], "urgency": "urgent"},
        {"case_id": "REV-028", "age": 82, "sex": "M", "symptoms": "Fall from standing height with inability to bear weight on left hip, limb shortened and externally rotated", "primary_suspected": "Orthopedics", "secondary_suspected": "General Surgery", "required_facilities": ["xray", "operationTheatres"], "urgency": "urgent"},
        {"case_id": "REV-029", "age": 44, "sex": "M", "symptoms": "Gross painless hematuria with passing of worm-like clots", "primary_suspected": "Nephrology", "secondary_suspected": "General Surgery", "required_facilities": ["ultrasound", "ctScan"], "urgency": "urgent"},
        {"case_id": "REV-030", "age": 53, "sex": "F", "symptoms": "Bilateral symmetrical polyarthritis of MCP and PIP joints with morning stiffness > 1 hour", "primary_suspected": "General Medicine", "secondary_suspected": "Orthopedics", "required_facilities": ["xray", "lab"], "urgency": "routine"},
        {"case_id": "REV-031", "age": 65, "sex": "M", "symptoms": "Severe left lower quadrant pain, constipation, leukocytosis (suspected diverticulitis)", "primary_suspected": "General Surgery", "secondary_suspected": "Gastroenterology", "required_facilities": ["ctScan", "lab"], "urgency": "urgent"},
        {"case_id": "REV-032", "age": 29, "sex": "F", "symptoms": "Acute onset wheeze and facial swelling 15 minutes after taking amoxicillin", "primary_suspected": "Emergency Medicine", "secondary_suspected": "General Medicine", "required_facilities": ["ventilators"], "urgency": "emergency"},
        {"case_id": "REV-033", "age": 73, "sex": "M", "symptoms": "Progressive cognitive decline, disinhibition, urinary incontinence, magnetic gait", "primary_suspected": "Neurology", "secondary_suspected": "General Medicine", "required_facilities": ["mri"], "urgency": "routine"},
        {"case_id": "REV-034", "age": 41, "sex": "F", "symptoms": "Thyroid nodule 3cm firm non-tender in right lobe detected on ultrasound", "primary_suspected": "Endocrinology", "secondary_suspected": "General Surgery", "required_facilities": ["ultrasound", "lab"], "urgency": "routine"},
        {"case_id": "REV-035", "age": 58, "sex": "M", "symptoms": "Intermittent claudication at 50 meters, absent dorsalis pedis pulses", "primary_suspected": "Cardiology", "secondary_suspected": "General Surgery", "required_facilities": ["echo", "ultrasound"], "urgency": "routine"}
    ]

    out_dir = os.path.join(os.path.dirname(__file__), 'data')
    os.makedirs(out_dir, exist_ok=True)

    # 1. Export JSON
    json_path = os.path.join(out_dir, 'clinician_review_cases.json')
    with open(json_path, 'w') as f:
        json.dump(cases, f, indent=2)

    # 2. Export CSV for clinical spreadsheet review
    csv_path = os.path.join(out_dir, 'clinician_review_cases.csv')
    fieldnames = ["case_id", "age", "sex", "symptoms", "primary_suspected", "secondary_suspected", "required_facilities", "urgency", "doctor_top1_agrees", "doctor_top2_agrees", "doctor_urgency_confirmed", "doctor_comments"]
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for c in cases:
            writer.writerow({
                "case_id": c["case_id"],
                "age": c.get("age", ""),
                "sex": c.get("sex", ""),
                "symptoms": c.get("symptoms", ""),
                "primary_suspected": c.get("primary_suspected", ""),
                "secondary_suspected": c.get("secondary_suspected", ""),
                "required_facilities": "; ".join(c.get("required_facilities", [])),
                "urgency": c.get("urgency", ""),
                "doctor_top1_agrees": "",
                "doctor_top2_agrees": "",
                "doctor_urgency_confirmed": "",
                "doctor_comments": ""
            })

    print(f"[OK] Exported {len(cases)} review cases to {json_path} and {csv_path}")


if __name__ == '__main__':
    generate_clinician_audit_cases()
