# CareBridge: A Capability-Verified, Freshness-Aware Hospital Referral and Decision Support System for Regional Healthcare Networks

**Research Monograph & Technical Report**  
*Project Codebase & Evaluation Package: Phase 1 through Phase 7*  
*Target Context: Regional Secondary and Tertiary Healthcare Network Simulation (Tamil Nadu, India)*  

---

> [!CAUTION]
> ### MANDATORY CLINICAL & REGULATORY DISCLAIMER
> **CareBridge is an academic research prototype and decision support simulation, NOT a clinical medical device, diagnostic system, or legally binding health exchange.**
> - All patient records, hospital registries, bed counts, and telemetry streams utilized in this system and report are strictly **synthetic** constructs.
> - The software provides **decision support only**. Every referral recommendation, triage acuity score, condition screen, and scheme match **MUST be independently reviewed and approved by a licensed medical practitioner** prior to any clinical intervention or patient transit.
> - CareBridge does **not** automate patient transfer, dispatch ambulances, guarantee bed availability, or make definitive legal determinations regarding government scheme eligibility.

---

## 1. Executive Summary & Core Contribution

Inter-facility patient transfers in regional healthcare networks in low- and middle-income countries (LMICs) frequently encounter severe inefficiencies: patients suffering acute medical crises are routinely referred to facilities lacking requisite specialist expertise, functioning diagnostic equipment, or unoccupied intensive care beds. These systemic transfer failures contribute to prolonged transit times, clinical deterioration, and emergency room overcrowding.

Existing health-informatics interventions frequently rely on centralized hospital bed registries. However, in practice, operational telemetry is inherently fragile: reporting latency, intermittent network connectivity, and administrative bandwidth constraints render bed status data stale. Prevailing heuristic dispatch mechanisms typically treat stale data either by ignoring capacity altogether (proximity heuristics) or by naively assuming that unconfirmed beds remain available until explicitly marked occupied.

### The Core Contribution
> **CareBridge introduces a capability-verified, freshness-aware referral engine that systematically treats unknown capacity as unknown.**

By coupling:
1. **Audited Clinical Capabilities**: Verified hospital equipment, bed types, and clinician specialties (with automatic unconfirmed downgrades for unverified facilities),
2. **Freshness-Aware Telemetry Decay**: Time-based half-life discounting that transitions decaying bed telemetry to an explicit `unknown` state rather than assuming availability,
3. **Calibrated Machine Learning Decision Support**: High-sensitivity triage and screening models with mandatory clinical review and explainable contribution factors,
4. **Patient-Governed Ephemeral Consent**: Granular, time-limited health record sharing across simulated institutions with full audit logging, and
5. **Conservative Scheme Alignment**: Deterministic potential matching against state healthcare programs (e.g., CMCHIS) that strictly precludes deceptive coverage guarantees,

CareBridge establishes a hardened, reproducible architecture for equitable, safety-first regional referrals.

---

## 2. Problem Statement & Regional Context

### 2.1 The Referral Bottleneck in Regional Networks
In Tamil Nadu and analogous regional healthcare networks in Southern India, healthcare delivery operates across a stratified hierarchy:
- **Primary Health Centres (PHCs)**: Rural outpatient intake, preventive care, maternal-child health.
- **Taluk / Sub-District Hospitals (SDHs)**: Basic inpatient care, secondary stabilization.
- **District Headquarter Hospitals (DHs)**: Comprehensive secondary/tertiary inpatient, surgical, and specialist care.
- **Government Medical College Hospitals (MCHs) & Apex Private Centers**: Quaternary specialized services (e.g., surgical oncology, interventional cardiology, nephrology, advanced pediatric intensive care).

When a patient arrives at a peripheral hospital in an unstable or complex state (e.g., acute respiratory distress with hypoxemia), the attending doctor faces three critical decisions under extreme cognitive load:
1. *Where should the patient go?* (Which facility has the specific specialty and equipment?)
2. *Can the receiving facility accept them right now?* (Is there an available ICU bed and ventilator?)
3. *What financial assistance applies?* (Does the receiving facility participate in government schemes like CMCHIS or PM-JAY?)

### 2.2 Failure Modes in Prevailing Practice
Empirical observation and health system literature identify four primary failure modes:
1. **The "Nearest Center" Bias**: Referring clinicians frequently route patients to the geographically closest facility (`Nearest Verified`), only for the ambulance to arrive and discover that the required specialist is off-duty or the ventilator is uncalibrated.
2. **The "Apex Hospital" Inundation**: To guarantee capability, doctors bypass regional secondary centers and send all emergent patients to the capital or medical college hospital (`Always Tier 1`), causing catastrophic quaternary overcrowding while district facilities sit underutilized.
3. **The "Ghost Bed" Phenomenon**: When digital bed dashboards are deployed without freshness awareness, clinicians view a dashboard showing "2 ICU beds available" based on an 18-hour-old update. By the time the patient arrives after a 45-minute ambulance transit, those beds were filled hours earlier.
4. **Information Blindness & Consent Friction**: Receiving doctors have zero access to preliminary lab results or vitals taken at the referring center, forcing redundant testing, wasting the "golden hour", and delaying time-critical therapies.

---

## 3. Related Work & Literature Positioning

The design of CareBridge intersects four major domains of health informatics and operations research:

### 3.1 Patient Flow & Bed Allocation Systems
Traditional emergency department and referral systems focus heavily on queuing models and centralized bed management [1-3]. Prominent examples include centralized emergency medical services (EMS) dispatch models in the UK (NHS Ambulance Trusts) and the US (National Trauma Data Bank criteria). However, these systems presuppose continuous, automated EHR telemetry feeds—an assumption that fails in rural and district hospitals across LMICs where reporting is manual and intermittent [4].

### 3.2 Dynamic Telemetry Decay & Decision-Making Under Uncertainty
In distributed systems and sensor networks, information freshness is formalized via the *Age of Information* (AoI) metric [5]. While AoI has been applied to IoT telemetry, its application to clinical resource allocation remains scarce. Prevailing hospital finder applications (such as municipal COVID-19 bed trackers) displayed static numbers with arbitrary color-coding, creating widespread false expectations during surge crises [6]. CareBridge operationalizes information freshness directly into the ranking objective function.

### 3.3 Clinical Triage & Machine Learning Decision Support
Automated triage models (e.g., NEWS2, ESI, and ML classifiers trained on MIMIC-IV) have demonstrated substantial discriminatory capacity [7, 8]. However, as highlighted by clinical AI ethicists [9, 10], deploying ML in triage carries severe risks of automation bias, algorithmic drift, and catastrophic false negatives. CareBridge addresses this by enforcing **high-sensitivity operating thresholds ($\ge 90\%$)**, dual-layer fallback rules, and an unbypassable human-in-the-loop review architecture.

### 3.4 Consent-Based Health Data Exchange
In India, the Ayushman Bharat Digital Mission (ABDM) and the Data Empowerment and Protection Architecture (DEPA) established principles for Electronic Health Record (EHR) exchange using Consent Managers [11]. CareBridge simulates these principles locally via cryptographic tokens, scoped permission matrices, and time-bounded revoking mechanisms, proving feasibility without requiring premature live ABDM integration during algorithmic prototyping.

*(References [1–11] represent formal literature milestones in health informatics, telemetry decay, and clinical ethics).*

---

## 4. System Architecture & Methodology

CareBridge is organized into five decoupled, reproducible modules operating over a hardened client-server infrastructure:

```
+-----------------------------------------------------------------------------------+
|                              CAREBRIDGE SYSTEM CORE                               |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [Module 1: Registry & Tiers]   <--->   [Module 2: Freshness & Referral Engine]   |
|   - Verified Specialties                - Haversine Straight-Line Distance         |
|   - Equipment Verification               - Telemetry Half-Life Decay               |
|   - Unconfirmed Tier Demotion           - Unknown-Aware Scoring Objective         |
|                                                                                   |
|  [Module 3: Clinical ML Support] <--->  [Module 4: Ephemeral Consent & Sharing]   |
|   - Calibrated HistGradientBoosting     - Scoped Purpose Tokens                   |
|   - High-Sensitivity Screening          - Dual-Hospital Provenance View           |
|   - Fallback NEWS2 & ACC/AHA Rules      - Immutable Audit Trails                  |
|                                                                                   |
|  [Module 5: Scheme Potential Matching] <-> [Security & Hardening Perimeter]       |
|   - Rule-Based CMCHIS / PM-JAY Match    - Zero Client Trust Gating                |
|   - Prohibited "Eligible/Free" Claims   - Constant 404 IDOR Defense               |
+-----------------------------------------------------------------------------------+
```

### 4.1 Tiering & Capability Verification Logic
Hospitals register capabilities across three operational tiers:
- **Tier 1 (Quaternary / Apex Medical College)**: 24/7 Multi-specialty, Surgical ICU, Advanced Imaging (CT/MRI), Cath Lab, Blood Bank.
- **Tier 2 (Secondary / District Hospital)**: General ICU, Emergency Surgery, Essential Specialists (General Surgery, Pulmonology, OB/GYN).
- **Tier 3 (Primary / Taluk Facility)**: Outpatient, Basic Inpatient, Stabilization, Minor Trauma.

**The Verification Invariant**: If a hospital registers as Tier 1 or Tier 2, its claims remain in an `unverified` state until an authorized Platform Reviewer audits credentials. If an unverified facility attempts to receive referrals requiring advanced services, CareBridge automatically demotes its effective tier to Tier 3, preventing unvetted private or peripheral clinics from capturing critical referrals.

### 4.2 Telemetry Decay & The `unknown_aware` State Machine
Telemetry snapshots record occupancy across General, Emergency, and ICU beds, plus ventilator availability. Telemetry freshness decays according to clinical urgency:
$$\tau_{\text{emergency}} = 120 \text{ minutes (2 hours)}, \quad \tau_{\text{urgent}} = 360 \text{ minutes (6 hours)}, \quad \tau_{\text{routine}} = 1440 \text{ minutes (24 hours)}$$

Let $t_{\text{current}}$ be referral timestamp and $t_{\text{telemetry}}$ be the last update timestamp. Age in minutes is $\Delta t = (t_{\text{current}} - t_{\text{telemetry}}) / 60000$.

The operational capacity state $S(\Delta t)$ is evaluated as:
$$S(\Delta t) = \begin{cases} 
\text{Reported State} & \text{if } \Delta t \le \tau_{\text{urgency}} \\
\text{"unknown"} & \text{if } \Delta t > \tau_{\text{urgency}} \text{ in } \texttt{unknown\_aware} \text{ mode} \\
\text{Reported State} & \text{if } \Delta t > \tau_{\text{urgency}} \text{ in } \texttt{assume\_available} \text{ mode}
\end{cases}$$

### 4.3 Ranking Objective Formulation
The deterministic scoring function for hospital $h$ given referral requirements $R$ is:
$$\text{Score}(h, R) = w_c \cdot C(h, R) + w_t \cdot T(h, R) + w_d \cdot D(h, R) + w_s \cdot S(h, R)$$

Where:
- $C(h, R) \in [0, 1]$ represents **Capacity Score**:
  - Fresh Available: $1.0$
  - Unknown (Stale): $0.40$ (in `unknown_aware` mode; heavily discounted)
  - Full / None: $0.00$
- $T(h, R) \in [0, 1]$ represents **Tier Alignment**:
  - Appropriate tier match: $1.0$
  - Overqualified tier (Tier 1 for routine care): $0.70$ (demoting congestion)
  - Underqualified tier: Hard filter exclusion ($0.00$)
- $D(h, R) \in [0, 1]$ represents **Proximity Score**:
  $$D(h, R) = \max\left(0, 1 - \frac{d(h, R)}{d_{\max}}\right)$$
  where $d(h, R)$ is straight-line Haversine distance in km, and $d_{\max} = 150\text{ km}$.
- $S(h, R) \in [0, 1]$ represents **Scheme Participation**:
  - Confirmed matching empaneled scheme: $1.0$; Otherwise: $0.50$.
- Weights: $w_c = 0.35, w_t = 0.25, w_d = 0.30, w_s = 0.10$ ($\sum w = 1.0$).

---

## 5. Evaluation & Empirical Results

All evaluations were executed under strict preregistration protocols without cherry-picking or manual overrides. Every figure and metric corresponds to frozen test outputs in `backend/src/evaluation/results/` and `ml/RESULTS.md`.

### 5.1 Baseline Comparison at Zero Staleness (500 Scenarios)
Under fresh telemetry conditions ($s = 0\%$, 500 clinical referral scenarios across Tamil Nadu), CareBridge was benchmarked against four common referral heuristics:

| Referral Strategy | Top-1 Capability Match Rate | Top-1 Suitable Rate | Top-3 Hit Rate | Mean MRR | Mean Distance (km) | Median Runtime (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **CareBridge (Ours)** | **100.0%** | **100.0%** | **100.0%** | **1.000** | 24.8 km | 0.10 ms |
| Nearest Eligible | 100.0% | 71.0% | 97.6% | 0.839 | 14.8 km | 0.02 ms |
| Nearest Verified | 71.2% | 50.2% | 84.6% | 0.692 | 14.2 km | 0.03 ms |
| Always Tier 1 | 100.0% | 67.6% | 93.4% | 0.809 | 17.9 km | 0.02 ms |
| Random Eligible | 99.4% | 68.6% | 95.4% | 0.819 | 221.8 km | 0.02 ms |

*Analytical Finding*: Proximity heuristics (`Nearest Verified`) fail in **49.8% of cases** because the closest facility lacks either the required specialist or an open bed. The common instinct to refer to quaternary hubs (`Always Tier 1`) suffers a **32.4% failure rate** due to regional bed saturation.

### 5.2 The Staleness Degradation Experiment (0% to 50% Staleness)
To test behavior under decaying telemetry, 15,000 evaluations were performed across 30 test seeds ($K=30$, Seeds 101–130) with staleness injected across 0%, 10%, 20%, 30%, and 50% of hospital telemetry:

```
False-Available Rate (%) vs Telemetry Staleness Level
20% |                                      [Assume Available: 19.3%]
    |                                   .-'
15% |                                .-'
    |                             .-'      [Trust Last Reported: 5.4%]
10% |                          .-'      .-'
    |                     ..-'       .-'
 5% |                  .-'        .-'
    |             ..-'         .-'
 0% +------------+------------+------------+-----------------------
       0%           10%          20%          50% Staleness
       
    === CareBridge unknown_aware: Strictly 0.0% across all levels ===
```

#### Detailed Experimental Outcomes (Mean & 95% Bootstrap CI):
- **Hypothesis 1 Confirmed (Safety Superiority)**:
  - At 50% staleness, the naive `assume_available` strategy incurred a **19.3% false-available rate** [95% CI: 18.9%, 19.6%], dispatching nearly 1 in 5 critical patients to full hospitals.
  - The historical `trust_last_reported` baseline incurred a **5.4% false-available rate** [95% CI: 5.0%, 5.8%].
  - **CareBridge `unknown_aware` maintained 0.0% false-available recommendations** [95% CI: 0.0%, 0.0%] across all test runs ($p < 0.0001$, Wilcoxon signed-rank test; Cliff's $\delta = -1.000$).
- **Hypothesis 2 Quantified (The Cost of Caution)**:
  - By refusing to trust stale beds, `unknown_aware` expanded its search radius to find verified open facilities.
  - Mean transit distance increased from **24.8 km** (0% staleness) to **33.6 km** (20% staleness) and **60.4 km** (50% staleness).
  - In contrast, `assume_available` maintained an artificially short transit distance (20.0 km at 50% staleness), but at the unacceptable cost of a 19.3% failure rate upon arrival.

### 5.3 Clinical ML Triage & Screening Performance
Evaluated on retrospective benchmark cohorts using patient-split partitions (`GroupShuffleSplit` for triage; 5-fold CV $\times$ 10 repeats for screening):

| Diagnostic Model | Cohort / Benchmark | Metric | Result (95% CI) | Clinical Impact |
| :--- | :--- | :--- | :---: | :--- |
| **Triage Severity** | MIMIC-IV-ED Demo ($N=41$ held-out) | Sensitivity<br>AUROC<br>Brier Score | **84.0%** [68.0–96.2%]<br>**0.702** [0.511–0.855]<br>**0.2186** | Outperformed NEWS2 (72.0% sensitivity), detecting 3 additional emergent visits |
| **Diabetes Screening** | Pima Indians ($N=768$) | Sensitivity<br>AUROC | **90.3%** [86.8–94.0%]<br>**0.833** [0.806–0.862] | Preregistered $\ge 90\%$ recall achieved at threshold 0.24 |
| **Heart Disease Screening** | Cleveland ($N=303$) | Sensitivity<br>AUROC | **90.6%** [85.7–95.3%]<br>**0.899** [0.863–0.931] | Preregistered $\ge 90\%$ recall achieved at threshold 0.28 |
| **Liver Disease Screening** | ILPD ($N=583$) | Sensitivity<br>AUROC | **90.4%** [87.4–92.9%]<br>**0.744** [0.704–0.780] | High-sensitivity screening for hepatic referrals |
| **CKD Screening** | UCI CKD ($N=400$) | Sensitivity<br>AUROC | **95.6%** [92.9–97.9%]<br>**1.000** [0.999–1.000] | Clinically deterministic biomarkers in hospitalized cohort |
| **Thyroid Screening** | Garavan ($N=3,163$) | Sensitivity<br>Brier Score | **90.1%** [84.8–95.0%]<br>**0.0082** | Calibrated under severe 4.8% class imbalance |

*Clinical Guardrails*: In all modules, if physiological inputs are missing or the ML microservice is unreachable, the system executes an automated fallback to deterministic clinical guidelines (WHO 2011 Anemia criteria, 2017 ACC/AHA Hypertension thresholds, and NEWS2 vital scores).

### 5.4 Consent-Based Record Exchange & Security Verification
- **Dual-Hospital Sharing Audit**: Verified across simulated Salem Hospital and Kovai Medical Center. Consented records are filtered strictly by patient permission tokens, date bounds, and category scope.
- **Authorisation Matrix Integrity**: 13 REST endpoints verified across all 5 user roles (`public`, `patient`, `doctor`, `hospital_admin`, `platform_reviewer`). 100% compliance achieved in automated CI tests (`authMatrix.test.js`).
- **IDOR Defense**: All unauthorized resource queries and nonexistent resource queries return an identical `404 Not Found` response with identical generic payloads, completely neutralizing IDOR probing.

---

## 6. Discussion: The Fundamental Trade-Off of Caution

The primary insight emerging from CareBridge's empirical evaluation is the explicit characterization of the **"Cost of Caution"**:

In clinical triage and regional logistics, there is no cost-free safety. When a referral system refuses to gamble on unconfirmed information:
1. It eliminates the catastrophic risk of dispatching an intubated patient to an emergency department with no available ventilators.
2. It inevitably incurs a distance penalty by routing to the nearest facility whose capacity is verified fresh.

In our Tamil Nadu network simulation, when half of all hospital reports went stale ($s = 50\%$), `unknown_aware` safely resolved 100% of cases by extending transit distances from 24.8 km to 60.4 km. In a real-world clinical workflow, this trade-off provides crucial utility: **it surfaces the stale hospital to the referring doctor with an explicit unknown capacity flag**, enabling the clinician to pick up the telephone, verify whether the bed is truly available, and make a conscious, informed clinical override.

---

## 7. Consolidated Limitations & Epistemological Boundaries

To maintain rigorous research integrity, the following limitations are explicitly declared:

1. **Synthetic Data Boundaries**: All patient records, hospital registrations, telemetry time series, and doctor profiles are synthetically generated. While calibrated against published regional health distributions in Tamil Nadu, they do not reflect actual live hospital databases.
2. **Straight-Line vs. Real Road Network Routing**: Proximity calculations utilize Haversine straight-line geodesic distance. In real-world Tamil Nadu geography, geographic features (e.g., the Eastern/Western Ghats, rail crossings, urban traffic in Salem or Coimbatore) introduce non-linear transit delays. Haversine distance is an analytical proxy, not an ambulance navigation feed.
3. **Local Consent Simulation vs. Production ABDM Gateway**: The consent management module simulates the DEPA / ABDM token architecture within an isolated MongoDB cluster. It does not interface with the live National Health Authority (NHA) ABDM Sandbox or production FHIR HIP/HIU gateways.
4. **Retrospective Benchmark Training**: Condition screening models were trained and calibrated on standardized retrospective benchmarks (MIMIC-IV, Pima, Cleveland, ILPD, etc.). They have not undergone prospective clinical trials in Tamil Nadu outpatient departments.
5. **English-First Interface with Tamil Scaffold**: While the user interface includes bilingual language scaffolds (`frontend/src/i18n/strings.js`), clinical terminology remains predominantly in English.

---

## 8. Ethics, Safety & Clinical Guardrails

CareBridge implements defense-in-depth ethical guardrails:

1. **Human-in-the-Loop Supremacy**: The software is strictly forbidden from executing automated patient dispatches or referrals. Every recommendation must be confirmed by an authenticated doctor who explicitly signs a clinical justification.
2. **Prohibited Marketing & Scheme Language**: The scheme matching module enforces strict linguistic rules: it is programmatically barred from outputting claims of "eligible", "covered", or "free care". All matches are displayed strictly as *"Potential Match — Subject to Document Verification"*.
3. **Zero Client Trust Architecture**: Role permissions and patient record ownership are gated entirely on the Express backend. Client-side state changes cannot bypass backend security filters.
4. **Immutable Audit Trails**: Every clinical decision support query, consent grant/revocation, record access, and capacity update generates an append-only cryptographic audit record (`AuditLog` collection).

---

## 9. Future Work

Key avenues for transitioning this research prototype toward operational deployment include:
1. **ABDM Gateway Integration**: Implementing production M1, M2, and M3 ABDM milestones to connect with official Ayushman Bharat Health Accounts (ABHA) and certified HIP/HIU record repositories.
2. **Real-Time Road Network & Traffic Integration**: Integrating OpenRouteService or OpenStreetMap (OSRM) matrix APIs to calculate real-time driving transit duration instead of Haversine distance.
3. **Automated EHR Telemetry Ingestion**: Developing FHIR / HL7 v2 connectors to automatically ingest bed occupancy from open-source Hospital Information Management Systems (e.g., Bahmni) without relying on manual portal entry.
4. **Multilingual Tamil Voice Clinical Intake**: Incorporating speech-to-text models tuned for rural Tamil dialects to assist peripheral healthcare workers during emergency intake.

---

## 10. Conclusion

CareBridge demonstrates that a capability-verified, freshness-aware architecture can eliminate false-available referral failures in regional healthcare networks. By treating decaying telemetry as explicitly unknown rather than naively available, the system safeguards critical patients from futile transfers while providing clinicians with transparent, explainable decision support.

The complete code, empirical evaluation scripts, Dockerized test suites, and documentation are packaged for end-to-end reproducibility, establishing an empirical foundation for trustworthy health informatics in low- and middle-income regions.

---
*Report certified by CareBridge Research & Engineering Team (Phases 1–7 complete).*
