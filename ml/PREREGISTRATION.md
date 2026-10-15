# ML Module Preregistration: CareBridge Triage & Condition Screening (Phase 5)

**Preregistration Date:** 2026-10-12  
**Status:** LOCKED BEFORE TRAINING (Deviations must be recorded in the designated section below)  
**Notice:** Research Prototype Only — Decision support for clinician review, NOT a clinical diagnostic product.

---

## 1. Research Objectives & Clinical Scope
The CareBridge ML module produces clinical decision support for a patient's structured intake data:
1. **Triage Severity Suggestion:** Predicts high acuity vs. lower acuity from initial triage vitals and demographics to assist emergency referral routing.
2. **Condition Screening Risk Probabilities:** Predicts screening risk for 5 chronic/acute conditions (CKD, Diabetes, Heart Disease, Liver Disease, Thyroid Disorder) using dedicated, standardized models trained on public clinical datasets.
3. **Rule-Based Screening Modules (No ML):** Anemia (WHO age/sex/pregnancy hemoglobin cutoffs) and Hypertension (AHA/ACC blood pressure stages).
4. **Explainability & Urgency Fusion:** Computes top 3–5 plain-text contributing features per prediction and fuses triage + condition risks + red-flag rules into a suggested urgency (`routine`, `urgent`, `emergency`) for clinician confirmation or override.

---

## 2. Model Targets, Features & Datasets

### A. Triage Severity Model
- **Primary Task:** Binary classification of triage acuity: High Acuity ($Y=1$, defined as ESI/KTAS levels 1–2: Resuscitation/Emergent) vs. Lower Acuity ($Y=0$, ESI/KTAS levels 3–5: Urgent/Less Urgent/Non-urgent).
- **Secondary Task (for deterioration risk validation):** ICU admission or critical outcome when available in hospital tracking.
- **Allowed Features (Triage Available Only):**
  - Demographics: Age, Sex.
  - Arrival Mode: Ambulance vs. Walk-in / Other.
  - Vital Signs: Heart rate (PR), Respiratory rate (RR), Systolic BP (SBP), Diastolic BP (DBP), Oxygen Saturation ($SpO_2$), Body Temperature (Temp in Celsius/Fahrenheit), Pain score (0–10 numeric).
  - Chief Complaint: Categorical cluster if available.
- **Strict Leakage Controls & Forbidden Columns:**
  - Excluded: Diagnoses, ICD codes, laboratory results, medications given in ED, hospital disposition, inpatient length of stay, discharge status, or downstream treatment orders.
  - Automated test guard must fail pipeline execution if any post-triage variable enters the feature matrix.

### B. Condition Screening Models
1. **Diabetes (Pima Indians Diabetes Dataset):**
   - **Target:** `Outcome` (0 = non-diabetic, 1 = diabetic).
   - **Features:** Pregnancies, Glucose, BloodPressure, SkinThickness, Insulin, BMI, DiabetesPedigreeFunction, Age.
   - **Handling:** Biologically impossible zero values for Glucose, BloodPressure, SkinThickness, Insulin, and BMI are converted to `NaN` and imputed.
   - **Minimum Required:** Glucose, BMI, Age, BloodPressure.
2. **Heart Disease (UCI Cleveland Dataset):**
   - **Target:** Presence of heart disease ($Y=1$ if angiographic disease status $\ge 1$, $Y=0$ if 0).
   - **Features:** Age, Sex, Chest Pain Type (cp), Resting BP (trestbps), Cholesterol (chol), Fasting Blood Sugar (fbs), Resting ECG (restecg), Max HR (thalach), Exercise Induced Angina (exang), ST depression (oldpeak), Slope, Major vessels (ca), Thalassemia (thal).
   - **Minimum Required:** Age, Sex, Resting BP, Cholesterol, Chest Pain Type.
3. **Liver Disease (Indian Liver Patient Dataset - ILPD):**
   - **Target:** Liver patient indicator (Binarized: 1 = Liver disease, 0 = Non-liver patient).
   - **Features:** Age, Gender, Total Bilirubin, Direct Bilirubin, Alkaline Phosphatase, Alamine Aminotransferase (ALT/SGPT), Aspartate Aminotransferase (AST/SGOT), Total Proteins, Albumin, Albumin/Globulin Ratio.
   - **Minimum Required:** Age, Sex, Total Bilirubin, ALT/SGPT, AST/SGOT, Albumin.
4. **Chronic Kidney Disease (UCI CKD Dataset):**
   - **Target:** `classification` (ckd vs. notckd).
   - **Features:** Age, Blood Pressure, Specific Gravity, Albumin, Sugar, RBC, Pus Cell, Serum Creatinine, Blood Urea, Sodium, Potassium, Hemoglobin, Packed Cell Volume, WBC count, RBC count, Hypertension, Diabetes Mellitus, CAD, Appetite, Pedal Edema, Anemia.
   - **Investigation Rule:** Given near-perfect separability on ~400 rows, performance above 0.98 AUROC will be documented as an artifact of small sample separability rather than clinical generalization.
   - **Minimum Required:** Age, Blood Pressure, Serum Creatinine, Blood Urea, Hemoglobin.
5. **Thyroid Disorder (UCI Thyroid Dataset - hypothyroid variant):**
   - **Target:** Hypothyroid diagnosis (hypothyroid vs. negative).
   - **Features:** Age, Sex, On Thyroxine, Query on Thyroxine, On Antithyroid Meds, Sick, Pregnant, Thyroid Surgery, I131 Treatment, Query Hypothyroid, Query Hyperthyroid, Lithium, Goitre, Tumor, Hypopituitary, Psych, TSH, T3, TT4, T4U, FTI.
   - **Leakage Guard:** Exclude replacement medication columns if used as target indicators; verify TSH/TT4 laboratory availability.
   - **Minimum Required:** Age, Sex, TSH, TT4 / FTI.

---

## 3. Split & Cross-Validation Design

1. **Patient-Level Separation:**
   - Splits must be grouped by unique Patient ID (`subject_id` / patient identifier) where longitudinal records exist. Never split multiple visits of the same patient across train and test folds.
2. **Triage Model:**
   - Temporal split (train on earlier chronology, hold-out final 20% test partition) combined with 5-fold grouped cross-validation on the training set. Held-out test set remains completely untouched until final evaluation. Fixed seed (`42`).
3. **Screening Models (Small Datasets, $N < 1,000$):**
   - Repeated Stratified K-Fold cross-validation (5 folds $\times$ 10 repeats = 50 folds) with nested cross-validation for hyperparameter tuning.
   - All transformations (imputation, scaling, one-hot encoding, SMOTE resampling) must be fit strictly inside training folds only. Validation/test folds remain untouched and un-resampled.

---

## 4. Models & Baselines

### Triage Severity Model:
- **Baseline 1:** Majority class predictor.
- **Baseline 2:** Rule-based approximate NEWS2 vital sign score (National Early Warning Score 2, explicitly labeled approximate and unvalidated).
- **Baseline 3:** L2-regularized Logistic Regression.
- **Candidate 1:** Random Forest Classifier.
- **Candidate 2:** HistGradientBoostingClassifier / Gradient Boosting.
- **Calibration:** Platt scaling (logistic sigmoid) and Isotonic regression fitted strictly on validation folds and evaluated against uncalibrated probabilities.

### Screening Models:
- **Baseline 1:** Majority class predictor.
- **Baseline 2:** L2-regularized Logistic Regression with standard scaling.
- **Candidate 1:** Random Forest Classifier (balanced class weights).
- **Candidate 2:** HistGradientBoostingClassifier.

---

## 5. Metrics & Primary Optimization Policy

### Primary Metric:
- **High-Recall / Sensitivity at Operating Threshold:**
  - In a clinical screening and triage referral context, false negatives (missed high-acuity or severe chronic condition cases) carry higher risk than false positives.
  - The decision threshold $\tau$ will be tuned on validation folds to achieve a target sensitivity of **90% to 95%** for high-acuity/positive cases.
  - Specificity, PPV, and the number of extra alerts per 100 patients at this threshold will be reported.

### Secondary Metrics:
- Discrimination: Area Under ROC Curve (AUROC), Area Under Precision-Recall Curve (AUPRC).
- Error & Calibration: Brier score, Expected Calibration Error (ECE), reliability curves.
- Clinical Counts: Absolute count and percentage rate of missed positive cases.
- Uncertainty: Mean values and non-parametric 95% bootstrap confidence intervals (1,000 iterations) on the held-out test or out-of-fold predictions.
- Paired statistical tests (DeLong / paired bootstrap difference) against baselines.

### Subgroup & Robustness Evaluations:
- Stratified sensitivity and Brier score across:
  - Age bands (<18, 18–45, 46–65, >65)
  - Sex (Male, Female)
  - Arrival mode (Ambulance, Walk-in)
- Vital sign missingness robustness: Model performance when $SpO_2$ or Temperature is masked as missing.

---

## 6. Pre-specified Acceptance Criteria

1. **Leakage & Integrity:** Zero post-triage or diagnostic columns in triage feature set (verified by automated assertion test).
2. **Patient Splitting:** Zero patient ID overlap between train and test folds.
3. **Calibration:** Calibrated model Brier score strictly lower than or equal to uncalibrated candidate.
4. **Triage Discrimination:** Candidate gradient boosting / random forest model must achieve AUROC significantly superior to the approximate NEWS2 rule baseline on held-out test data.
5. **Handling of Missing Inputs:** Missing required features must trigger an explicit `"insufficient data"` response with missing field names rather than returning an ungrounded risk score.
6. **Reproducibility:** Fixed random seeds ensure deterministic metrics and pipeline outputs.

---

## 7. Preregistration Deviations & Changes Log
*(Any post-training adjustments or data alterations must be logged below with full rationale)*

- **Post-Training Audit (2026-10-14):**
  1. *Triage Severity Sensitivity:* On the held-out test split (41 visits from 14 subjects, 25 true high-acuity cases), operating threshold 0.510 yielded 84.0% sensitivity (21/25 cases identified). The approximate NEWS2 baseline achieved 0.672 AUROC on its continuous score; its class metrics are not reported because no classification cutoff was preregistered. All 5 condition screening models attained at least 90.0% sensitivity on out-of-fold cross-validation.
  2. *Data Preprocessing (CKD ARFF Parsing):* Three rows in `chronic_kidney_disease.arff` with irregular trailing commas were normalized to standard 25-feature length during loading rather than dropping rows, preserving the full $N = 400$ dataset.
  3. *Baseline Reproduction:* The fixed-seed rerun corrected held-out logistic-regression metrics to 0.810 AUROC / 0.760 sensitivity / 0.688 specificity, and random-forest metrics to 0.705 / 0.680 / 0.563. Classifier baseline metrics use a fixed 0.50 probability cutoff.
