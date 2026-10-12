# CareBridge ML Model Cards

> **MANDATORY CLINICAL & RESEARCH DISCLAIMER**  
> **Research Prototype Only.** The models described in this card are intended strictly for **clinical decision support to assist medical doctors during referral routing**. They **DO NOT** provide automated clinical diagnoses, treatment determinations, or hospital triage admission authorizations. All automated suggestions must be evaluated and confirmed by a licensed clinician.

---

## 1. Triage Severity Classifier Model Card

### 1.1 Model Details
- **Model Name:** CareBridge Triage Severity Classifier
- **Version:** 1.0.0
- **Model Type:** Supervised Binary Acuity Classifier (Platt Sigmoid Calibrated Histogram Gradient Boosting)
- **Base Algorithm:** `HistGradientBoostingClassifier` (scikit-learn 1.6+)
- **Calibration Method:** `CalibratedClassifierCV` (method='sigmoid', cv=5)
- **Developer:** CareBridge Research Team
- **Release Date:** October 2026
- **License:** Open Access Academic Research Prototype

### 1.2 Intended Use
- **Primary Intended Use:** Recommending a referral urgency suggestion (`emergency` vs. `urgent` / `routine`) based on vital signs recorded at initial patient presentation.
- **Intended Users:** Registered medical officers, primary health center (PHC) doctors, and emergency intake triage staff.
- **Out-of-Scope Use Cases:**
  - Automated hospital admission or discharge decisions without doctor oversight.
  - In-hospital intensive care unit (ICU) transfer or deterioration prediction.
  - Direct patient self-triage or consumer diagnostic applications.
  - Deployment in clinical production environments without prospective validation in local clinical cohorts.

### 1.3 Factors & Input Features
- **Demographics:** Age (years), Gender (M / F / Unknown).
- **Transport Mode:** Arrival transport mode (`AMBULANCE`, `WALK IN`, `OTHER`).
- **Vital Signs:** 
  - Body Temperature (°C)
  - Heart Rate (bpm)
  - Respiratory Rate (breaths/min)
  - Oxygen Saturation $\text{SpO}_2$ (%)
  - Systolic Blood Pressure (mmHg)
  - Diastolic Blood Pressure (mmHg)
  - Numeric Pain Score (0–10)
- **Missingness Indicators:** Explicit indicator features for $\text{SpO}_2$ unrecorded, temperature unrecorded, and pain unrecorded.

### 1.4 Training & Evaluation Data
- **Dataset:** MIMIC-IV-ED Demo v2.2 (PhysioNet open access benchmark).
- **Population:** Adult and pediatric emergency department encounters at Beth Israel Deaconess Medical Center, Boston, MA, USA.
- **Target Label:** High Acuity (Emergency Severity Index 1 or 2) vs. Lower Acuity (ESI 3, 4, or 5).
- **Partitioning:** Patient-level `GroupShuffleSplit` (80% train, 20% test; zero patient ID overlap between splits).

### 1.5 Performance Metrics (Held-Out Test Set, $N = 41$ visits, 25 high acuity)
- **AUROC:** 0.702 [95% CI: 0.511 – 0.855]
- **AUPRC:** 0.803 [95% CI: 0.658 – 0.928]
- **Operating Threshold:** 0.510
- **Sensitivity / Recall:** 0.840 [95% CI: 0.680 – 0.962] (21 of 25 true emergent cases identified)
- **Specificity:** 0.500 [95% CI: 0.250 – 0.750]
- **Positive Predictive Value (PPV):** 0.724 (21 of 29 alerts confirmed true emergent)
- **Brier Score (Calibrated):** 0.2186 (vs. 0.2391 uncalibrated)
- **Expected Calibration Error (ECE):** 0.1152

### 1.6 Subgroup Parity & Robustness
- **Female Cohort ($n=39$):** Sensitivity 0.826, Brier score 0.2232.
- **Ambulance Arrivals ($n=24$):** Sensitivity 0.813, Brier score 0.2271.
- **Walk-In Arrivals ($n=15$):** Sensitivity 0.857, Brier score 0.2112.
- **Missing $\text{SpO}_2$ Stress Test:** Sensitivity remained stable at 0.840.

---

## 2. Multi-Condition Screening Models Model Cards

### 2.1 Common Architecture & Design Principles
- **Design Pattern:** Modular, single-disease calibrated screening models with independent feature encoders.
- **Objective:** High sensitivity ($\ge 90\%$) for identifying suspected pathology, minimizing false-negative referral errors.
- **Calibration:** Out-of-fold Platt sigmoid calibration via 5-fold Stratified Cross-Validation repeated 10 times (50 iterations).
- **Explainability:** Feature contribution reporting highlighting the specific laboratory or clinical deviations triggering the alert.

---

### 2.2 Model 1: Diabetes Mellitus Screener
- **Condition:** Type 2 Diabetes Mellitus (ICD-10: `E11`)
- **Dataset:** Pima Indians Diabetes Database (National Institute of Diabetes and Digestive and Kidney Diseases, NIDDK).
- **Target Population:** Female Pima Indian heritage, age $\ge 21$.
- **Features Used:** Glucose, BMI, Age, Pregnancies, Blood Pressure, Insulin, Skin Thickness, Diabetes Pedigree Function.
- **Input Cleaning:** Biologically impossible zero values in glucose, blood pressure, skinfold thickness, insulin, and BMI converted to NaN and median-imputed.
- **Sample Size:** $N = 768$ (268 positive, 34.9% positive rate).
- **Operating Threshold:** 0.24 (Recall-tuned).
- **Cross-Validation Metrics:**
  - **Sensitivity / Recall:** 90.3% [95% CI: 86.8% – 94.0%]
  - **Specificity:** 62.8% [95% CI: 58.4% – 67.2%]
  - **AUROC:** 0.833 [95% CI: 0.806 – 0.862]
  - **AUPRC:** 0.702 [95% CI: 0.645 – 0.768]
  - **Brier Score:** 0.1580 [95% CI: 0.145 – 0.170]
  - **ECE:** 0.0425
- **Referral Action:** Flags `Endocrinology`; requires clinical chemistry laboratory (`lab`).

---

### 2.3 Model 2: Coronary Heart Disease Screener
- **Condition:** Coronary Artery / Heart Disease (ICD-10: `I25.1`)
- **Dataset:** Cleveland Clinic Heart Disease Dataset (UCI Machine Learning Repository).
- **Target Population:** Patients undergoing diagnostic coronary angiography.
- **Features Used:** Age, Sex, Chest Pain Type (`cp`), Resting Blood Pressure (`trestbps`), Serum Cholesterol (`chol`), Fasting Blood Sugar (`fbs`), Resting ECG (`restecg`), Maximum Heart Rate (`thalach`), Exercise Induced Angina (`exang`), ST Depression (`oldpeak`), ST Slope (`slope`), Fluoroscopy Vessels (`ca`), Thallium Scan (`thal`).
- **Sample Size:** $N = 303$ (139 positive, 45.9% positive rate).
- **Operating Threshold:** 0.28 (Recall-tuned).
- **Cross-Validation Metrics:**
  - **Sensitivity / Recall:** 90.6% [95% CI: 85.7% – 95.3%]
  - **Specificity:** 72.0% [95% CI: 64.6% – 78.7%]
  - **AUROC:** 0.899 [95% CI: 0.863 – 0.931]
  - **AUPRC:** 0.890 [95% CI: 0.844 – 0.929]
  - **Brier Score:** 0.1286 [95% CI: 0.109 – 0.149]
  - **ECE:** 0.0528
- **Referral Action:** Flags `Cardiology`; requires `ecg`, `echo`, and `cathLab`.

---

### 2.4 Model 3: Liver Disease Screener
- **Condition:** Chronic/Acute Hepatic Disease (ICD-10: `K76.9`)
- **Dataset:** Indian Liver Patient Dataset (ILPD, Andhra Pradesh, India).
- **Target Population:** Hospitalized Indian patients presenting with liver-related symptoms.
- **Features Used:** Total Bilirubin, Direct Bilirubin, Alkaline Phosphatase, SGPT (ALT), SGOT (AST), Total Proteins, Albumin, Albumin/Globulin Ratio, Age, Gender.
- **Sample Size:** $N = 583$ (416 positive, 71.4% positive rate).
- **Operating Threshold:** 0.56 (Recall-tuned).
- **Cross-Validation Metrics:**
  - **Sensitivity / Recall:** 90.4% [95% CI: 87.4% – 92.9%]
  - **Specificity:** 40.7% [95% CI: 33.5% – 48.5%]
  - **AUROC:** 0.744 [95% CI: 0.704 – 0.780]
  - **AUPRC:** 0.890 [95% CI: 0.861 – 0.914]
  - **Brier Score:** 0.1749 [95% CI: 0.163 – 0.189]
  - **ECE:** 0.0570
- **Referral Action:** Flags `Gastroenterology`; requires `lab` and `ultrasound`.

---

### 2.5 Model 4: Chronic Kidney Disease Screener
- **Condition:** Chronic Kidney Disease (ICD-10: `N18.9`)
- **Dataset:** Chronic Kidney Disease Dataset (Apollo Hospitals, Tamil Nadu / UCI).
- **Target Population:** Inpatients presenting for nephrology evaluation.
- **Features Used:** Serum Creatinine, Blood Urea, Blood Glucose Random, Hemoglobin, Blood Pressure, Serum Sodium, Potassium, Age.
- **Sample Size:** $N = 400$ (250 positive, 62.5% positive rate).
- **Operating Threshold:** 0.85 (High specificity with 95.6% sensitivity).
- **Cross-Validation Metrics:**
  - **Sensitivity / Recall:** 95.6% [95% CI: 92.9% – 97.9%]
  - **Specificity:** 100.0% [95% CI: 100% – 100%]
  - **AUROC:** 1.000 [95% CI: 0.999 – 1.000]
  - **AUPRC:** 1.000
  - **Brier Score:** 0.0058 [95% CI: 0.003 – 0.009]
  - **ECE:** 0.0343
- **Referral Action:** Flags `Nephrology`; requires `dialysisUnit` and `lab`.
- **Epistemological Warning:** High statistical separability is due to severe chronic illness profiles in late-stage hospital cohorts. Not representative of early-stage outpatient screening.

---

### 2.6 Model 5: Thyroid Disorder Screener
- **Condition:** Primary Hypothyroidism (ICD-10: `E03.9`)
- **Dataset:** Garavan Hypothyroid Dataset (UCI Machine Learning Repository).
- **Target Population:** Routine endocrine outpatient blood test referrals.
- **Features Used:** TSH (Thyroid Stimulating Hormone), T3, Total T4, T4 Uptake, Free Thyroxine Index (FTI), Age, Sex.
- **Sample Size:** $N = 3,163$ (151 positive, 4.8% prevalence).
- **Operating Threshold:** 0.53.
- **Cross-Validation Metrics:**
  - **Sensitivity / Recall:** 90.1% [95% CI: 84.8% – 95.0%]
  - **Specificity:** 99.4% [95% CI: 99.1% – 99.7%]
  - **AUROC:** 0.990 [95% CI: 0.978 – 0.997]
  - **AUPRC:** 0.890 [95% CI: 0.824 – 0.952]
  - **Brier Score:** 0.0082 [95% CI: 0.006 – 0.011]
  - **ECE:** 0.0078
- **Referral Action:** Flags `Endocrinology`; requires clinical chemistry laboratory (`lab`).
