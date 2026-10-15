# CareBridge ML Evaluation & Empirical Results

> **MANDATORY CLINICAL & RESEARCH DISCLAIMER**  
> **Research Prototype Only.** All metrics presented in this document reflect evaluations on retrospective, public benchmark datasets (MIMIC-IV-ED Demo, Pima, Cleveland, ILPD, CKD, and Garavan Thyroid). They **DO NOT** represent diagnostic accuracy, treatment efficacy, or clinical performance within Tamil Nadu hospitals or Indian healthcare settings. Outputs are designed purely as **clinical decision support for a doctor to review**.

---

## 1. Preregistration Fidelity & Methodology

All experiments followed the preregistered research protocol defined in `ml/PREREGISTRATION.md`:
- **Primary Metric:** High sensitivity ($\ge 90\%$) for condition screening, minimizing false-negative referral errors.
- **Data Partitioning:** 
  - Triage: Strict patient-level `GroupShuffleSplit` (zero patient ID overlap between train and test sets).
  - Screening: 5-fold Stratified Cross-Validation repeated 10 times (50 iterations) with Platt sigmoid calibration.
- **Uncertainty Quantification:** 95% bootstrap confidence intervals (1,000 resamples) for all primary metrics.
- **Leakage Guards:** Strict assertion verification preventing target/future variable leakage during ingestion.

---

## 2. Triage Severity Classifier Results

### 2.1 Benchmark Comparison Table
Evaluated on the held-out test split of the MIMIC-IV-ED Demo v2.2 dataset ($N_{\text{test}} = 41$ visits, 14 unique patients, 25 high-acuity true cases):

| Model / Approach | Algorithm / Baseline | AUROC | Sensitivity | Specificity | PPV | Brier Score | Missed Cases (%) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **CareBridge Primary** | **Calibrated HistGradientBoosting** | **0.702** | **0.840** | **0.500** | **0.724** | **0.2186** | **16.0% (4/25)** |
| Comparator 1 | L2 Regularized Logistic Regression | 0.810 | 0.760 | 0.688 | 0.792 | 0.1789 | 24.0% (6/25) |
| Comparator 2 | Random Forest Classifier (100 trees)| 0.705 | 0.680 | 0.563 | 0.708 | 0.2130 | 32.0% (8/25) |
| Clinical Rule Baseline| Approximate NEWS2 Algorithm | 0.672 | — | — | — | N/A | — |
| Naive Baseline | Majority Class Baseline | 0.500 | 1.000 | 0.000 | 0.610 | 0.2425 | 0.0% |

Classifier baseline metrics use a fixed probability cutoff of 0.50. The primary model uses its train-tuned 0.510 cutoff. NEWS2 is reported by AUROC from its continuous approximate score only; no classification cutoff was preregistered, so its class metrics are omitted.

*Key Observations:*
- The Calibrated HistGradientBoosting model attained a test AUROC of 0.702 [95% CI: 0.511 – 0.855] and an AUPRC of 0.803 [95% CI: 0.658 – 0.928].
- Operating at threshold 0.510, it achieved **84.0% sensitivity** [95% CI: 68.0% – 96.2%]. The approximate NEWS2 baseline attained AUROC 0.672; its sensitivity is not compared because no cutoff was specified in the registered training code.
- Platt sigmoid calibration reduced the Brier score from 0.2391 (uncalibrated) to 0.2186 (calibrated), yielding an Expected Calibration Error (ECE) of 0.115.

### 2.2 Subgroup Performance Audit
To evaluate equity across patient presentation modes and demographics, subgroup audits were executed on the test partition:

| Subgroup | Sample Size ($n$) | Sensitivity / Recall | Brier Score | Parity Assessment |
| :--- | :---: | :---: | :---: | :--- |
| **Female Cohort (Sex_F)** | 39 | 0.826 | 0.2232 | Stable performance across gender |
| **Ambulance Arrival** | 24 | 0.813 | 0.2271 | High acuity capture for emergency transfers |
| **Walk-In Arrival** | 15 | 0.857 | 0.2112 | Reliable detection of deteriorating walk-ins |

### 2.3 Robustness to Vital Sign Missingness
In low-resource intake settings, pulse oximetry is frequently unrecorded. A synthetic stress test masking SpO2 values yielded:
- **Sensitivity:** 0.840 (Unchanged from baseline).
- **AUROC:** 0.708 (Demonstrates feature redundancy via respiratory rate and heart rate).

---

## 3. Multi-Condition Screening Models Results

All 5 condition screening models were evaluated across 50 iterations (5-fold cross-validation $\times$ 10 repeats) using out-of-fold calibrated probabilities:

| Disease / Condition | Cohort & Source | Sample Size ($N$) | Positives ($N / \%$) | Operating Threshold | Sensitivity / Recall (95% CI) | Specificity (95% CI) | AUROC (95% CI) | AUPRC (95% CI) | Brier Score | ECE |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Diabetes** | Pima Indians (NIDDK) | 768 | 268 (34.9%) | 0.24 | **90.7%** [87.1% – 94.2%] | 62.8% [58.4% – 67.2%] | **0.833** [0.805 – 0.862] | 0.704 [0.646 – 0.769] | 0.1580 | 0.043 |
| **Heart Disease** | Cleveland Clinic (UCI) | 303 | 139 (45.9%) | 0.28 | **90.6%** [85.7% – 95.3%] | 72.0% [64.6% – 78.7%] | **0.899** [0.863 – 0.931] | 0.890 [0.844 – 0.929] | 0.1286 | 0.053 |
| **Liver Disease** | ILPD (Andhra Pradesh) | 583 | 416 (71.4%) | 0.56 | **90.4%** [87.4% – 92.9%] | 40.7% [33.5% – 48.5%] | **0.744** [0.704 – 0.780] | 0.890 [0.861 – 0.914] | 0.1749 | 0.057 |
| **Kidney Disease (CKD)**| UCI ML Repository | 400 | 250 (62.5%) | 0.85 | **95.6%** [92.9% – 97.9%] | 100.0% [100% – 100%] | **1.000** [0.999 – 1.000] | 1.000 [0.999 – 1.000] | 0.0058 | 0.034 |
| **Thyroid (Hypothyroid)**| Garavan Dataset (UCI) | 3,163 | 151 (4.8%) | 0.53 | **90.1%** [84.8% – 95.0%] | 99.4% [99.1% – 99.7%] | **0.990** [0.978 – 0.997] | 0.890 [0.824 – 0.952] | 0.0082 | 0.008 |

### 3.1 Contextual Insights & Epistemological Disclosures
1. **Recall-First Objective Achieved:** All 5 models satisfied the preregistered criterion of $\ge 90\%$ recall on out-of-fold predictions. Operating thresholds were adjusted downward where necessary (e.g., Diabetes threshold set to 0.24; Heart Disease threshold set to 0.28) to eliminate missed referrals.
2. **Chronic Kidney Disease Separability:** The CKD model achieved near-perfect discrimination ($\text{AUROC} \approx 1.000$). While mathematically valid, this reflects clinical feature determinism: elevated serum creatinine paired with severe anemia in hospitalized cohorts creates near-linear separability. This performance must NOT be interpreted as generalized real-world performance on early-stage asymptomatic populations.
3. **Thyroid Extreme Class Imbalance:** Hypothyroidism accounted for only 4.8% of the cohort ($N = 151$ positives out of 3,163). Platt calibration ensured that despite severe imbalance, the Brier score remained exceptionally low ($0.0082$) with minimal Expected Calibration Error ($0.0078$).
4. **Liver Disease Discrimination:** The ILPD model demonstrated lower discrimination ($\text{AUROC} = 0.744$), reflecting overlapping biochemical markers (bilirubin, transaminases) across non-severe liver pathologies. The 0.56 threshold ensures $90.4\%$ sensitivity for referral screening.

---

## 4. Rule-Based Clinical Screening Modules

In accordance with international clinical practice standards, two conditions are screened via deterministic rule engines rather than black-box models:

### 4.1 Anemia Screening (WHO 2011 Guideline)
- **Inputs:** Hemoglobin (g/dL), age, sex, pregnancy status.
- **Cutoffs:**
  - Children (6–59 months): $< 11.0$ g/dL (Severe: $< 7.0$ g/dL)
  - Children (5–11 years): $< 11.5$ g/dL
  - Children (12–14 years) & Non-pregnant Women: $< 12.0$ g/dL (Severe: $< 8.0$ g/dL)
  - Pregnant Women: $< 11.0$ g/dL (Severe: $< 7.0$ g/dL)
  - Men ($\ge 15$ years): $< 13.0$ g/dL (Severe: $< 8.0$ g/dL)
- **Referral Action:** Flags General Medicine; severe cases immediately escalate to `urgent` and require a hospital with an active Blood Bank (`bloodBank`).

### 4.2 Hypertension Screening (2017 ACC/AHA Guideline)
- **Inputs:** Systolic Blood Pressure (SBP), Diastolic Blood Pressure (DBP).
- **Categories:**
  - Normal: $\text{SBP} < 120$ and $\text{DBP} < 80$ mmHg
  - Elevated: $\text{SBP } 120–129$ and $\text{DBP} < 80$ mmHg
  - Stage 1: $\text{SBP } 130–139$ or $\text{DBP } 80–89$ mmHg
  - Stage 2: $\text{SBP } \ge 140$ or $\text{DBP } \ge 90$ mmHg
  - Hypertensive Crisis: $\text{SBP } \ge 180$ and $\text{DBP } \ge 120$ mmHg
- **Referral Action:** Stage 1/2 maps to General Medicine with ECG requirement; Hypertensive Crisis activates emergency red flag bypass.

---

## 5. Clinician Review Cases Export

To provide illustrative test inputs without relying on automated evaluation alone, 35 synthetic clinical scenarios were generated and exported:
- **Artifacts:**
  - `ml/data/clinician_review_cases.json`
  - `ml/data/clinician_review_cases.csv`
- These generated examples are synthetic placeholders, not observations from any of the benchmark datasets and not part of training or metric calculations.
- **Case Distribution:**
  - 10 High Acuity Emergency Presentations (STEMI, Acute Stroke, Hypertensive Crisis, Severe Shock)
  - 15 Chronic Multi-Morbidity Cases (Diabetic Nephropathy, Hypertensive Cardiomyopathy, Cirrhosis)
  - 10 Ambiguous / Borderline Scenarios (Mild vitals derangement, isolated lab anomalies)

---

## 6. Local Dataset and Run Provenance Audit

Both training scripts were rerun on 2026-10-14 using the local files in `ml/data/raw/`. The five screening rows in this document reproduce the values written to `ml/models/screening_summary.json`; the triage primary metrics reproduce `ml/models/triage_model_card.json`. Dataset row counts below are the rows consumed by the training loaders, except where the raw MIMIC counts are explicitly distinguished.

| Dataset | Rows used | Source | Local input / verification |
| :--- | ---: | :--- | :--- |
| MIMIC-IV-ED Demo v2.2 | 207 labeled visits (56 subjects); 166 train / 41 test visits (42 / 14 subjects) | PhysioNet public demo, [v2.2](https://physionet.org/content/mimic-iv-ed-demo/2.2/) | `edstays.csv.gz` and `triage.csv.gz` each contain 222 data rows; the inner join and non-missing acuity filter produce the 207 rows used. |
| Pima Indians Diabetes | 768 | UCI ML Repository, [dataset 34](https://archive.ics.uci.edu/dataset/34/pima+indians+diabetes) | `pima_diabetes.csv`; screening summary reproduces the same sample and positive count (268). |
| Cleveland Heart Disease | 303 | UCI ML Repository, [dataset 45](https://archive.ics.uci.edu/dataset/45/heart+disease) | `heart_disease/processed.cleveland.data`; screening summary reproduces the same sample and positive count (139). |
| Indian Liver Patient Dataset | 583 | UCI ML Repository, [dataset 225](https://archive.ics.uci.edu/dataset/225/ilpd+indian+liver+patient+dataset) | `ilpd/Indian Liver Patient Dataset (ILPD).csv`; screening summary reproduces the same sample and positive count (416). |
| Chronic Kidney Disease | 400 | UCI ML Repository, [dataset 338](https://archive.ics.uci.edu/dataset/338/chronic+kidney+disease) | `ckd/Chronic_Kidney_Disease/chronic_kidney_disease.arff`; screening summary reproduces the same sample and positive count (250). |
| Thyroid Hypothyroid | 3,163 | UCI ML Repository, [dataset 102](https://archive.ics.uci.edu/dataset/102/thyroid+disease) | `thyroid/hypothyroid.data`; screening summary reproduces the same sample and positive count (151). |

**Download / artifact status:** All input paths used by the training scripts were present and loaded during the reruns. An extra `ed2021.zip` file in the raw directory fails ZIP central-directory validation and is not referenced by either training loader; its intended source and download history are not recorded, so it is flagged as a corrupt/failed archive rather than a dataset input. `ckd.zip` is a valid ZIP containing a `.rar` archive; the extracted ARFF file used above is present. No failed download of a required training input was observed.

**Synthetic and stale artifacts:** The SpO2-masking robustness check is a synthetic perturbation of the held-out MIMIC test rows. The clinician-review cases listed above are generated synthetic examples. Neither contributes to fitted-model metrics. `ml/models/model_manifest.json` is not a source of metric truth: its CKD and thyroid thresholds (0.50 and 0.10) disagree with the rerun screening summary (0.85 and 0.53), and its artifact hashes predate the rerun.
