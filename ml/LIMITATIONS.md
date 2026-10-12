# CareBridge ML Limitations, Ethical Boundaries & Dataset Constraints

> **MANDATORY CLINICAL & RESEARCH DISCLAIMER**  
> **Research Prototype Only.** This software is an experimental health-informatics research prototype and **NOT a certified Software as a Medical Device (SaMD)**. All outputs (triage urgency classifications, condition risk probabilities, facility requirements, and specialty recommendations) are intended solely as **non-binding clinical decision support for a licensed medical doctor to review**. Under no circumstances should these outputs be used as autonomous diagnostic criteria, automated triage authorizations, or clinical mandates. Standard medical protocol and clinical judgment supersede all algorithmic outputs.

---

## 1. Clinical & Regulatory Scope Limitations

1. **Non-Diagnostic Nature:**  
   The platform does not diagnose medical diseases. A high predicted probability indicates statistical alignment with a historical training cohort's presentation, not a definitive pathological finding.

2. **Clinician-in-the-Loop Requirement:**  
   The referral engine mandates that a registered medical practitioner review every recommendation, confirm or override the suggested urgency level, and record a clinical justification for deviations. Autonomous patient routing is explicitly prohibited.

3. **Absence of Prospective Clinical Evaluation:**  
   All reported evaluation metrics were derived from retrospective, historical benchmark datasets. The system has **not** been evaluated in prospective clinical trials, randomized referral simulations, or real-world emergency departments. No claims are made regarding:
   - Reductions in referral delays or transfer times.
   - Reductions in healthcare expenditure or logistics costs.
   - Improvements in morbidity, mortality, or patient outcomes.

---

## 2. Dataset-Specific Constraints & Epidemiological Biases

Each public dataset leveraged in this research prototype carries documented limitations that affect the generalizability of the trained models:

```
+-----------------------------------------------------------------------------------------+
| Dataset               | Sample Size | Documented Limitation                             |
+-----------------------------------------------------------------------------------------+
| MIMIC-IV-ED Demo      | N = 206     | Small demo slice; urban US tertiary hospital      |
| Pima Indians Diabetes | N = 768     | Female-only Native American cohort; zero-values   |
| Cleveland Heart       | N = 303     | Angiography referral bias; binary thresholding   |
| ILPD Liver Disease    | N = 583     | Severe male gender imbalance (~75% male)          |
| CKD Dataset           | N = 400     | Late-stage inpatient separability; small sample   |
| Garavan Thyroid       | N = 3,163   | European outpatient cohort; severe class imbalance|
+-----------------------------------------------------------------------------------------+
```

### 2.1 Pima Indians Diabetes Dataset
- **Geographic & Ethnic Homogeneity:** The cohort consists exclusively of female individuals of Pima Indian ancestry residing in Arizona, USA. South Asian and Tamil populations exhibit distinct genetic predispositions, earlier ages of onset, and differing visceral adiposity distributions (the "Asian Indian Phenotype").
- **Biologically Impossible Zeros:** In the raw dataset, missing physiological measurements were coded as zeros (e.g., Blood Pressure $= 0$, BMI $= 0$, Glucose $= 0$, Insulin $= 0$). While CareBridge replaces these zeros with median-imputed values during preprocessing, the underlying missingness mechanism introduces potential imputation noise.

### 2.2 Cleveland Clinic Heart Disease Dataset
- **Verification / Referral Selection Bias:** The cohort comprises exclusively patients who were referred for invasive diagnostic coronary angiography. It does not represent asymptomatic individuals or primary care presentations.
- **Binarization Artifacts:** Coronary artery disease is binarized at $\ge 50\%$ diameter stenosis in one or more major vessels. This discards continuous gradations of ischemic heart disease, microvascular angina, and non-obstructive coronary plaques.
- **Small Sample Size:** With only $N = 303$ total records, statistical power is constrained.

### 2.3 Indian Liver Patient Dataset (ILPD)
- **Severe Gender Imbalance:** The dataset contains 441 males ($75.6\%$) and 142 females ($24.4\%$). While collected in Andhra Pradesh, India, this pronounced male skew can reduce predictive accuracy and calibration reliability for female patients presenting with autoimmune or metabolic liver diseases.
- **Etiological Specificity:** The dataset does not differentiate between alcoholic hepatitis, viral hepatitis (HBV/HCV), non-alcoholic steatohepatitis (NASH), or drug-induced liver injury, treating all liver pathologies as a single positive class.

### 2.4 Chronic Kidney Disease (CKD) Dataset
- **Inpatient Cohort Separability:** The dataset exhibits near-trivial mathematical separability ($\text{AUROC} \approx 1.000$) due to the presence of late-stage, symptomatic renal inpatients characterized by extreme elevations in serum creatinine and blood urea combined with severe anemia.
- **Inability to Detect Early-Stage Nephropathy:** The model cannot be assumed to detect early, asymptomatic kidney damage (CKD Stages 1 and 2, which require microalbuminuria testing not captured in the dataset).

### 2.5 MIMIC-IV-ED Demo v2.2 (Triage Model)
- **Small Demo Sample:** The PhysioNet open-access demo contains only 206 emergency visits across 158 patients. While partitioned with zero patient overlap, the small cohort limits the diversity of acute presentations evaluated.
- **Non-Indian Population & System Bias:** MIMIC data originates from Beth Israel Deaconess Medical Center in Boston, MA, USA. Emergency Department triage protocols (ESI algorithm), baseline vital distributions, and transportation modalities (US EMS ambulance vs. Indian 108 ambulance system) reflect high-income healthcare infrastructure.

### 2.6 Garavan Hypothyroid Dataset
- **Extreme Class Imbalance:** Primary hypothyroidism represents only $4.8\%$ ($N = 151$) of the 3,163 cases. While Platt calibration and threshold tuning were applied to achieve $90.1\%$ recall, the precision ($91.9\%$) reflects an endocrine outpatient referral population rather than an unselected community screening cohort.

---

## 3. Geographic, Demographic & Systemic Mismatch

1. **Non-Validation in Tamil Nadu Populations:**  
   Except for the ILPD (Andhra Pradesh) and CKD datasets, the models were trained on non-Indian populations. Epidemiological prevalence, risk factor thresholds (e.g., lower BMI cutoffs for South Asian metabolic risk: $23$ vs $25\text{ kg/m}^2$), and dietary patterns in Tamil Nadu were not factored into the raw training data.

2. **Missing Laboratory Tests in Rural Primary Care:**  
   In rural Primary Health Centres (PHCs) across Tamil Nadu, diagnostic access to specialized tests (serum creatinine, thyroid panels, echocardiography, CT scans) may be unavailable. The CareBridge service addresses this by outputting `"insufficient_data"` and identifying specific missing tests. However, in the absence of laboratory panels, the system cannot generate disease-specific risk predictions, falling back to vital signs and clinical examination.

3. **Static Cross-Sectional Snapshots:**  
   The models evaluate static, single-point-in-time measurements. They do not incorporate longitudinal vital trajectories, serial ECGs, or hemodynamic trends over time.

---

## 4. Ethical & Clinical Safety Guidelines

- **Clinical Supremacy:** A treating clinician's bedside examination and intuition always take precedence over any algorithmic recommendation.
- **Emergency Bypass:** When acute clinical red flags are detected (e.g., hypertensive emergency, focal neurological deficit, hemodynamic collapse), the system bypasses statistical risk modeling to trigger immediate emergency routing.
- **Audit Logging without PHI:** In compliance with healthcare data protection principles, all decision support queries and clinical overrides are immutably logged in an audit trail with summary metadata only, strictly excluding raw Protected Health Information (PHI).
