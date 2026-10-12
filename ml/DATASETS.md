# CareBridge ML Datasets Documentation (/ml/DATASETS.md)

**Notice:** This research prototype uses publicly available benchmark datasets for pipeline development and decision support prototyping. None of the models constitute clinical diagnostic tools, nor are they calibrated for production healthcare deployment in Tamil Nadu, India.

---

## 1. Summary of Public Datasets

| Dataset | Primary Source | License | Sample Size | Class Balance | Target Variable | Population | Limitations & Caveats |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MIMIC-IV-ED Demo / Triage Benchmark** | PhysioNet (v2.2) | Open Data Commons ODbL v1.0 | 222 visits (100 patients) demo / ED triage benchmark | ESI 1: 18, ESI 2: 97, ESI 3: 90, ESI 4: 2 (High Acuity 1–2: 55.6%) | Acuity $\le 2$ (High vs. Lower Acuity) | Emergency department admissions at Beth Israel Deaconess Medical Center, Boston, MA, USA | US urban academic tertiary ED population; nurses' subjective triage judgement encodes human bias; demo cohort too small for definitive epidemiological conclusions. Full MIMIC-IV-ED requires credentialed PhysioNet DUA. |
| **Pima Indians Diabetes** | UCI ML Repository / NIDDK | Public Domain / CC BY 4.0 | 768 rows, 9 attributes | Negative (0): 500 (65.1%)<br>Positive (1): 268 (34.9%) | `Outcome` (0 vs. 1) | Females $\ge 21$ years of Pima Indian heritage near Phoenix, Arizona, USA | Biologically impossible zero values (glucose, insulin, skinfold, BP, BMI) encode missing data; homogeneous indigenous North American cohort with genetic predisposition; non-generalizable to Indian populations. |
| **Heart Disease (Cleveland)** | UCI ML Repository (Detrano et al., 1989) | Creative Commons Attribution 4.0 International | 303 rows, 14 attributes | 0: 164 (54.1%)<br>1–4: 139 (45.9%) | Angiographic disease presence (`num` > 0) | Cardiology referral patients at Cleveland Clinic Foundation, Ohio, USA | Small sample ($N=303$); target binarized from multi-vessel stenosis degree (0 vs 1–4); historical retrospective cohort from late 1980s with clinical practice shifts. |
| **Indian Liver Patient Dataset (ILPD)** | UCI ML Repository (Ramana et al., 2012) | Creative Commons Attribution 4.0 International | 583 rows, 11 attributes | Liver patient (1): 416 (71.3%)<br>Non-liver (2): 167 (28.7%) | `selector` (1 = Patient, 2 = Control) | Inpatients/outpatients from Andhra Pradesh / Northeast of Andhra Pradesh, India | Substantial sex imbalance (441 males vs. 142 females; 75.6% male); collected from a localized geographic region in India, not representative of general pan-Indian or Tamil Nadu primary care screening. |
| **Chronic Kidney Disease (CKD)** | UCI ML Repository (Soundarapandian et al., 2015) | Creative Commons Attribution 4.0 International | 400 rows, 25 attributes | CKD: 250 (62.5%)<br>Not-CKD: 150 (37.5%) | `classification` (ckd vs. notckd) | Apollo Hospitals, Tamil Nadu, India | Very small sample ($N=400$); extreme separability due to strong biochemical indicators (serum creatinine, blood urea, albuminuria); exceptionally high AUROC ($\approx 0.99-1.00$) reflects near-perfect trivial separability on this sample, NOT generalizable diagnostic prowess. |
| **Thyroid Disease (Hypothyroid)** | UCI ML Repository (Quinlan et al., 1987) | Creative Commons Attribution 4.0 International | 3,163 rows, 26 attributes | Negative: 3,012 (95.2%)<br>Hypothyroid: 151 (4.8%) | `hypothyroid` vs. `negative` | Garvan Institute of Medical Research, Sydney, Australia | Severe class imbalance (~4.8% positive); contains treatment-related and potentially leaky columns (`on_thyroxine`, `query_on_thyroxine`, `thyroid_surgery`) which reflect existing interventions rather than screening risk. |

---

## 2. Detailed Dataset Profiles & Preprocessing Policies

### 2.1 Triage Severity Dataset (MIMIC-IV-ED Demo v2.2)
- **Source:** PhysioNet open demo (`https://physionet.org/content/mimic-iv-ed-demo/2.2/`).
- **Target Selection:** Binarized acuity label:
  $$\text{Target} = \begin{cases} 1 & \text{if } \text{Acuity} \in \{1, 2\} \text{ (Immediate / Emergent)} \\ 0 & \text{if } \text{Acuity} \in \{3, 4, 5\} \text{ (Urgent / Semi-urgent / Non-urgent)} \end{cases}$$
- **Limitations & Bias:** Triage scores reflect the assigning triage nurse's immediate impression under ED bed pressure. US demographic and referral patterns differ sharply from rural/semi-urban district hospital arrivals in Tamil Nadu.
- **Access Conditions:** The demo dataset is open under ODbL v1.0. Full MIMIC-IV-ED requires individual CITI ethics credentialing and signed PhysioNet Data Use Agreements; hence this prototype evaluates pipeline integrity using the open demo and benchmark vital protocols.

### 2.2 Pima Indians Diabetes
- **Source URL:** `https://archive.ics.uci.edu/dataset/34/pima+indians+diabetes`
- **Missing Data Treatment:** Zero entries in `Glucose`, `BloodPressure`, `SkinThickness`, `Insulin`, and `BMI` are physiologically impossible in living individuals and represent missingness. These entries are explicitly converted to `np.nan` before fitting imputers inside training folds.
- **Population:** Native American women of Pima heritage living in Arizona. High incidence of type 2 diabetes due to unique thrifty-gene and lifestyle interactions; results cannot be extrapolated to Indian populations.

### 2.3 UCI Cleveland Heart Disease
- **Source URL:** `https://archive.ics.uci.edu/dataset/45/heart+disease`
- **Target Definition:** Original column `num` ranges from 0 (no diameter narrowing $>50\%$) to 4 (severe multi-vessel stenosis). Binarized to $Y = \mathbb{I}(\text{num} > 0)$.
- **Limitations:** Small sample ($N=303$). Missing values present in `ca` (4 rows) and `thal` (2 rows) imputed within cross-validation folds.

### 2.4 Indian Liver Patient Dataset (ILPD)
- **Source URL:** `https://archive.ics.uci.edu/dataset/225/ilpd+indian+liver+patient+dataset`
- **Sex Imbalance:** 441 males (75.6%) vs. 142 females (24.4%). Model evaluation includes stratified subgroup audits to detect sensitivity disparities across sexes.
- **Target Recoding:** Original labels are 1 (Liver patient) and 2 (Non-liver patient). Recoded to 1 = Positive, 0 = Negative.

### 2.5 Chronic Kidney Disease (UCI CKD)
- **Source URL:** `https://archive.ics.uci.edu/dataset/338/chronic+kidney+disease`
- **Separability Warning:** Serum creatinine ($\ge 1.2$ mg/dL) and albuminuria are direct diagnostic markers for renal dysfunction. The dataset is near-perfectly linearly separable. High AUROC ($\ge 0.98$) is expected and reported as a dataset property rather than a breakthrough.

### 2.6 Thyroid Disease (hypothyroid.data)
- **Source URL:** `https://archive.ics.uci.edu/dataset/102/thyroid+disease`
- **Feature Exclusions:** Treatment columns `on_thyroxine` and `query_on_thyroxine` are removed or flagged because thyroxine administration indicates the patient is already diagnosed and undergoing hormonal therapy.

---

## 3. Data Privacy and Security Guardrails
1. **Local Storage:** All raw datasets reside strictly in `/ml/data/raw/` and are listed in `.gitignore`.
2. **No Data Leakage / External Calls:** No raw patient rows are printed to logs, exposed to frontend clients, or transmitted to third-party APIs.
3. **Synthetic Exclusivity:** Pipeline end-to-end integration tests use explicitly labeled synthetic test fixtures (`isSynthetic: true`). Synthetic records are quarantined from all training and validation metrics.
