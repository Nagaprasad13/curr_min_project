# CareBridge Phase 8.0 Comprehensive Audit Report

> **Auditor Notice:** Health Informatics Research Prototype Evaluation.  
> **Date of Audit:** 2026-10-13  
> **Environment:** Node.js v22.19.0 | MongoDB Atlas Cluster (`hospital_referral`) / In-Memory Fallback | Python 3.11  
> **Scope:** Phases 1–7 Codebase, Authentication, Persistence, Clinical Data Models, ML Model Pipelines, UI/UX, and Accessibility.
> **Historical snapshot:** This report predates Phase 8.4a account provisioning. Its seed counts and demo-login details are not current; the seed workflow now creates per-hospital accounts with unique local credentials.

---

## 1. Authentication & Session Security Audit

### 1.1 Is there a real login?
* **Backend State ([backend/src/routes/authRoutes.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/routes/authRoutes.js#L19-L74)):**
  * A credential verification endpoint `POST /api/auth/login` exists. It queries `User.findOne({ email })`, compares password hashes with `bcrypt.compare()`, and signs a stateless JWT.
  * An in-memory rate-limiter ([backend/src/middleware/rateLimiter.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/middleware/rateLimiter.js#L73-L115)) tracks failed login attempts and returns `429 Too Many Requests` after 5 failures for 15 minutes.
  * **Critical Gaps:**
    1. Lockout state is stored **strictly in-memory** (`Map()`). Server restarts or multi-instance deployments instantly reset lockouts.
    2. Authentication is strictly single-token: a single Bearer token sent in headers.
    3. **No refresh tokens**, **no token rotation**, and **no server-side token revocation/session invalidation** on logout exist.
    4. Tokens are stored client-side in React memory/state rather than `httpOnly`, `Secure`, `SameSite` cookies, leaving them vulnerable to XSS token theft.
    5. No CSRF token mechanism exists.

### 1.2 Is the "Simulated User" switcher client-side only?
* **Current behavior:** Demo selection is a role picker in the login page and calls the server-side `POST /api/auth/demo-login` endpoint. It is available only when demo mode is explicitly enabled in a non-production environment.
* Seeded account passwords are unique and stored locally in the git-ignored `backend/seed-credentials.json`; no seeded password is embedded in the frontend bundle or repository documentation.

### 1.3 Which endpoints trust client-supplied role or user ID?
1. **`POST /api/auth/register` ([backend/src/routes/authRoutes.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/routes/authRoutes.js#L80-L109)):**
   * **Trusts client `role`:** `const { name, email, password, role, hospitalId, district } = req.body;`
   * An unauthenticated caller can register themselves directly as a `platform_reviewer` or `hospital_admin` by supplying `{ "role": "platform_reviewer" }`.
2. **`POST /api/referrals` ([backend/src/routes/referralRoutes.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/routes/referralRoutes.js#L180-L186)):**
   * **Trusts client-supplied `patientId`:** Accepts unverified `patientId` from `req.body.patientId` without validating patient relationship or identity.
3. **`POST /api/records/break-glass` ([backend/src/routes/recordRoutes.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/routes/recordRoutes.js#L310-L330)):**
   * **Trusts client-supplied `patientId`:** Doctors supply raw `patientId` in body without prior relationship validation.
4. **`PUT /api/hospitals/:id/capacity` ([backend/src/routes/capacityRoutes.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/routes/capacityRoutes.js#L20-L25)):**
   * **Trusts client-supplied `reportedBy`:** `reportedBy` string is taken directly from `req.body` rather than being stamped from `req.user.name`.
5. **`GET /api/patients/:patientId/records` ([backend/src/routes/recordRoutes.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/routes/recordRoutes.js#L30-L136)):**
   * Enforces patient ownership (`req.user._id === patientId`) for patients, but allows doctors to query any arbitrary `:patientId` parameter subjected only to consent checks.

---

## 2. Data Completeness per Collection Audit

The live MongoDB database was directly queried via Node.js script ([backend/src/scripts/auditDb.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/scripts/auditDb.js)).

| Collection Name | Document Count | Status | Schema Sample Keys | Missing / Incomplete Fields & Observations |
| :--- | :---: | :---: | :--- | :--- |
| **`hospitals`** | **40** | Populated | `_id, name, code, registrationNumber, licenseNumber, district, state, location, address, ownership, has24x7Emergency, verificationStatus, verifiedAt, verifiedBy, rejectionReason, tier, proposedTier, tierStatus, tierRationale, tierDetails, departments, specialties, specialists, equipment, bedCounts, schemeParticipation, evidenceDocuments, verificationHistory, contact, isSynthetic, consistencyWarnings, adminUserId` | `specialists` is an embedded array of static counts, not derived from practitioner documents. |
| **`hospitalcapacities`**| **48** | Populated | `_id, hospitalId, timestamp, stalenessThresholdMinutes, beds, services, reportedBy, isSynthetic, reportedAt, specialistsOnCall` | `specialistsOnCall` array populated with synthetic names in only a subset of telemetry records. |
| **`users`** | **15** | Populated at the historical audit date | `_id, name, email, password, role, hospitalId, phone, district, isSynthetic` | Historical pre-8.4a role breakdown: **11 patients, 2 hospital admins, 1 platform reviewer, and 1 doctor**. |
| **`referrals`** | **11** | Populated | `_id, referralId, patientId, patientName, referringDoctorId, referringHospitalId, patientSummary, requirements, mlAssessment, engineVersion, rankedRecommendations, status, recordsConsentStatus, clinicalDisclaimerAcknowledged, decisionSupportDisclaimer, isSynthetic, candidates, excludedHospitals` | Status breakdown: 10 `submitted`, 1 `draft`. No historical `accepted`, `declined`, or `transferred` referrals in the seed set. |
| **`consents`** | **7** | Populated | `_id, consentId, patientId, requestingHospitalId, toHospitalId, requestingDoctorId, referralId, purpose, recordTypes, scope, dateRange, status, includeSensitiveRecords, expiresAt, decisionHistory, consentTextVersion, breakGlass, digitalSignature, isSynthetic` | Status breakdown: 4 `granted`, 3 `revoked`. No `requested` (pending) or `expired` consent documents in initial state. |
| **`patientrecords`** | **83** | Populated | `_id, recordId, patientId, sourceHospitalId, type, title, recordDate, provenance, contentRef, contentMimeType, sensitivityLevel, sensitiveCategory, isSynthetic` | Files stored on local disk under `storage/records/`. Metadata points correctly. |
| **`schemes`** | **3** | Populated | `_id, schemeId, schemeCode, name, authority, shortDescription, eligibilityCriteria, requiredDocuments, coveredTreatmentNotes, participatingHospitalInfo, officialApplicationUrl, officialUrl, helplineInfo, sourceUrls, lastVerifiedDate, status, rulesVersion, notice, disclaimer, summary, coveredSpecialties, annualCoverageInr, isSynthetic` | Official definitions for CMCHIS, PM-JAY, and RAN. Complete. |
| **`auditlogs`** | **42** | Populated | `_id, logId, actorId, actorRole, action, resourceType, resourceId, patientId, hospitalId, accessGranted, justification, ipAddress, userAgent, meta, timestamp` | Append-only security audit log active. |
| **`conditionSpecialtyMap`** | **0** | **EMPTY (FLAGGED)** | None (0 documents in collection) | **EMPTY IN ACTIVE ATLAS CLUSTER.** The collection was declared in [backend/src/models/ConditionSpecialtyMap.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/models/ConditionSpecialtyMap.js) and seeded only in memory during tests, leaving the persistent MongoDB collection empty. |

---

## 3. Doctors, Staff and Specialist Data Audit

### 3.1 Does any doctor/specialist data exist per hospital?
* **NO.** There is **no collection for individual doctors or healthcare practitioners** in the system (`practitioners` does not exist).
* At the historical audit date, the `users` collection held only one doctor account across the 40 hospitals. Phase 8.4a replaces this seed setup with practitioner-linked accounts for every hospital. Current seed credentials are in the git-ignored local credentials file, not in this report.

### 3.2 Are specialist counts in hospitals derived from real records or hard-coded numbers?
* **HARD-CODED.** Specialist numbers are generated via pseudo-random arithmetic inside [backend/src/scripts/syntheticDataGenerator.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/scripts/syntheticDataGenerator.js#L189-L265):
  ```javascript
  // syntheticDataGenerator.js Lines 189-193 (Tier 1)
  specialists = specialties.map(s => ({
    specialty: s,
    count: Math.floor(rand() * 4) + 2, // Hardcoded 2 to 5 specialists
    onCall24x7: true,
  }));

  // syntheticDataGenerator.js Lines 228-232 (Tier 2)
  specialists = specialties.map(s => ({
    specialty: s,
    count: Math.floor(rand() * 2) + 1, // Hardcoded 1 to 2 specialists
    onCall24x7: s === 'Emergency Medicine' || s === 'General Surgery',
  }));

  // syntheticDataGenerator.js Lines 260-264 (Tier 3)
  specialists = specialties.map(s => ({
    specialty: s,
    count: 1,                          // Hardcoded 1 specialist
    onCall24x7: false,
  }));
  ```
* These numbers are directly written into `Hospital.specialists` subdocuments. They are **not** linked to any medical practitioner records, license numbers, roster schedules, or verified credentials.

---

## 4. Machine Learning Model Registry, Persistence & Integrity Audit

### 4.1 Where are trained models, scalers, and thresholds stored?
* **On disk only.** Models are stored as binary `.joblib` files in the directory [ml/models/](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/models/):
  * `triage_model.joblib` (303 KB)
  * `diabetes_model.joblib` (631 KB)
  * `heart_model.joblib` (568 KB)
  * `liver_model.joblib` (592 KB)
  * `ckd_model.joblib` (658 KB)
  * `thyroid_model.joblib` (744 KB)
* Metadata and operating thresholds are stored in static JSON files on disk:
  * `triage_model_card.json` (2 KB)
  * `screening_summary.json` (4.6 KB)
* **Nothing is stored in MongoDB.** There is **no `modelRegistry` collection** in the database.

### 4.2 Is there any model version, metrics, dataset lineage or file hash recorded?
* **Partially on disk, NOT in database.**
  * Dataset lineage and metrics are documented in [ml/models/triage_model_card.json](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/models/triage_model_card.json) and [ml/models/screening_summary.json](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/models/screening_summary.json).
  * **Zero cryptographic hashes (SHA-256) are recorded** for any of the 6 `.joblib` model artifacts.
  * No model registry tracking model promotion states (`candidate`, `active`, `retired`) exists.

### 4.3 Does the ML service verify it loads the right version?
* **NO.** In [ml/service/app.py](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/ml/service/app.py#L63-L97):
  ```python
  @app.on_event("startup")
  def load_all_artifacts():
      t_path = os.path.join(MODELS_DIR, 'triage_model.joblib')
      if os.path.exists(t_path):
          triage_model = joblib.load(t_path)
  ```
  * The service blindly loads whatever file exists at that path with `joblib.load()`.
  * It performs **no hash verification**, **no schema validation**, **no version check against a registry**, and **no integrity guard against tampering or corrupted artifacts**.

---

## 5. Prior Phase Deliverable Completeness Audit

| Phase Deliverable Item | Target File / Artifact | Exists? | Audit Findings |
| :--- | :--- | :---: | :--- |
| **Staleness Benchmark Outputs** | `backend/src/evaluation/results/staleness_raw.csv` | **YES** | 354 KB raw benchmark data across 0%–50% staleness. |
| **Staleness Summary Metrics** | `backend/src/evaluation/results/staleness_summary.json` | **YES** | 150 KB aggregated metrics across 5 staleness levels. |
| **Staleness SVG / PNG Plots** | `docs/plots/fig1_false_available_vs_staleness.png` to `fig5` | **YES** | All 5 publication-ready figures exist in PNG and SVG. |
| **Referral Baseline Comparisons** | `backend/src/evaluation/RESULTS.md` | **YES** | Baseline comparisons against Nearest Verified, Random, and Stale-Ignorant policies. |
| **Preregistration Document** | `ml/PREREGISTRATION.md` & `backend/src/evaluation/PREREGISTRATION.md` | **YES** | Preregistered hypothesis and protocols documented. |
| **ML Evaluation Results** | `ml/RESULTS.md` | **YES** | Complete metrics with 95% CIs for triage and screening models. |
| **ML Limitations Document** | `ml/LIMITATIONS.md` | **YES** | Explicit non-clinical prototype boundaries. |
| **Screening Models on Disk** | `ml/models/*.joblib` (5 models) | **YES** | All 5 models (CKD, Diabetes, Heart, Liver, Thyroid) present. |
| **Model Registry in MongoDB** | Database collection `modelRegistry` | **ABSENT** | **Missing deliverable.** Models not registered in MongoDB. |
| **Artifact SHA-256 Hashes** | Hashes in registry or verification manifest | **ABSENT** | **Missing deliverable.** No integrity hashes exist. |
| **Condition-Specialty Map in DB**| Database collection `conditionSpecialtyMap` | **ABSENT** | **Missing deliverable.** 0 documents in MongoDB Atlas cluster. |

---

## 6. UI, Ergonomics & Accessibility (WCAG) Audit

### 6.1 Contrast Failures & White-on-White Text
* **White-on-White Contrast Blunder:**
  * In [frontend/src/components/DoctorPortal.jsx](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/frontend/src/components/DoctorPortal.jsx#L450):
    `<div style={{ background: '#f8fafc', padding: 12, borderRadius: 8 }}>`
    Elements inside this container (such as `<div style={{ display: 'flex' }}><span>Model Suggested Urgency:</span>...</div>`) do not define their own text color and inherit `var(--text-main): #f1f5f9` (a near-white font) from `body`. This produces **white text on a white `#f8fafc` background**, with a contrast ratio of **1.05:1** (failing WCAG AA 4.5:1 catastrophically).
* **Low Contrast Dim Text:**
  * In [frontend/src/index.css](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/frontend/src/index.css#L10), `--text-dim: #64748b` on `--bg-primary: #0b1120` produces a contrast ratio of **3.58:1**, failing WCAG AA (minimum 4.5:1 for body copy).

### 6.2 Unlabeled Inputs & Accessibility Violations
* In `DoctorPortal.jsx`, `HospitalAdminPortal.jsx`, and `PatientPortal.jsx`, numerous inputs are rendered as bare `<input>` or `<select>` tags without associated `<label htmlFor="...">` bindings.
* Statuses across tables and cards frequently rely on **color alone** (e.g. green circle vs red circle) without accompanying screen-reader text or discernible text icons.

### 6.3 Misleading Text Implying Real State Authority
* Several UI strings falsely claim official government verification on purely synthetic data:
  1. `HospitalAdminPortal.jsx` Line 221: **`"CONFIRMED BY TNHSP"`**
  2. `ReviewerPortal.jsx` Line 150: **`"Signed off by TNHSP Reviewer"`**
  3. `App.jsx` Line 24: **`"Dr. K. Swaminathan (TNHSP Platform Reviewer)"`**
  4. `strings.js` Line 39: **`"Unconfirmed Tier (Pending Formal TNHSP Review)"`**
* *Required remediation:* Must replace all with: `"Simulated verification (synthetic data)"`.

### 6.4 Missing Mobile Layout & Responsive Design
* **Zero `@media` queries:** A search across `frontend/src/` reveals **0 media queries** in any CSS file.
* The desktop top header, 4-column cards, referral candidate comparison tables, and intake forms overflow horizontally on viewports narrower than 1024px and break completely on mobile viewports (360px – 480px).

### 6.5 Empty States
* If collections contain zero items (e.g. patient with 0 records or no pending referrals), components show unstyled blank areas or break with `undefined` property reads.

---

## 7. Audit Summary Table

| Category | Item Inspected | Current State | Defect Severity | Phase 8 Action Required |
| :--- | :--- | :--- | :---: | :--- |
| **Authentication** | Real Login View | Hardcoded `DEMO_PERSONAS` dropdown auto-login in `App.jsx` | **High** | Build real login, register, logout, and password recovery UI views. |
| **Authentication** | Token Architecture | Single JWT passed in `Authorization` header, stored in React state | **High** | Dual token (access + refresh) in `httpOnly`, `Secure`, `SameSite` cookies with rotation and revocation. |
| **Authentication** | Brute-force Lockout | In-memory `Map()` only | **Medium** | Persist lockout and rate-limiting state in MongoDB. |
| **Authorization** | Role Spoofing in Register | `POST /api/auth/register` accepts client-provided `role` | **High** | Patients self-register; doctors/admins require admin invite; reviewers are seeded only. |
| **Data Completeness** | `conditionSpecialtyMap` | 0 documents in MongoDB Atlas cluster | **High** | Run persistent seed for `conditionSpecialtyMap`. |
| **Doctors & Staff** | Practitioner Data | No `practitioners` collection; 1 doctor in `users` | **Critical** | Create `practitioners` collection; seed 3–12 doctors per hospital; derive specialist counts dynamically. |
| **Hospital Tiers** | Specialist Counts | Hardcoded numbers in `Hospital.specialists` | **High** | Derive specialist counts from verified active `practitioners` and re-evaluate Phase 3 referral metrics. |
| **ML Systems** | Model Registry | No `modelRegistry` collection in MongoDB | **High** | Create `modelRegistry` collection; record metadata, metrics, thresholds, and artifact SHA-256. |
| **ML Systems** | Integrity Verification | No startup SHA-256 check; blind `joblib.load()` | **High** | Enforce SHA-256 verification on active model at startup; refuse to serve on mismatch. |
| **UI & UX** | Contrast Failures | White text on `#f8fafc` background; `--text-dim` failing WCAG AA | **High** | Create unified design system with light/dark themes meeting WCAG AA contrast (4.5:1). |
| **UI & UX** | Responsive Layout | Zero `@media` queries; layout broken < 1024px | **High** | Implement responsive CSS down to 360px with collapsible sidebar. |
| **Governance** | Misleading Authority Text| "CONFIRMED BY TNHSP" on synthetic data | **High** | Replace all instances with "Simulated verification (synthetic data)". |
| **Deployment** | Secret Management | Static fallback secrets in source code | **Medium** | Fail-fast config validation at startup; complete Docker & docker-compose configurations. |
