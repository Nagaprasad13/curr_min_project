# CareBridge: Project Defense & Conference Slide Deck

*Title:* **CareBridge: A Capability-Verified, Freshness-Aware Hospital Referral and Decision Support System for Regional Healthcare Networks**  
*Audience:* Project Examiners, Clinical Informatics Faculty, and Peer Researchers  
*Duration:* 12–15 Minutes (followed by Q&A)  

---

## Slide 1: Title & Core Motivation
### Title: CareBridge
**Subtitle:** A Capability-Verified, Freshness-Aware Hospital Referral and Decision Support System for Regional Healthcare Networks  
**Authors / Presenters:** CareBridge Research Team  
**Regional Context:** Simulation Study on Tamil Nadu Secondary & Tertiary Hospital Networks  

- **The Problem in One Sentence:** Patients transferred between regional hospitals frequently arrive at facilities lacking required specialists, functioning equipment, or open ICU beds.
- **The Core Contribution:** *A capability-verified, freshness-aware referral engine that systematically treats unknown capacity as unknown.*

> **Speaker Notes:**  
> "Good morning, respected examiners. When a critically ill patient arrives at a district hospital in Tamil Nadu, the doctor must decide where to send them within minutes. Today, this is done by guesswork, phone calls, or sending everyone to the capital hospital. CareBridge is a research prototype engineered to solve this through capability verification and freshness-aware decision support."

---

## Slide 2: The Four Bottlenecks of Regional Referrals
### Current Reality in Regional Networks
1. **The Nearest-Center Bias:** Clinicians dispatch to the closest hospital, only to find the ventilator is uncalibrated or the specialist is absent.
2. **Quaternary Inundation:** Doctors bypass secondary facilities and send all cases to Medical Colleges (`Always Tier 1`), causing catastrophic apex overcrowding.
3. **The "Ghost Bed" Phenomenon:** Static bed dashboards display numbers hours or days old. Patients arrive after an ambulance ride to find the beds were filled hours ago.
4. **Information Blindness:** Receiving doctors have zero access to referring vitals and lab results, wasting the critical golden hour on duplicate tests.

> **Speaker Notes:**  
> "Notice the third point: the ghost bed phenomenon. Previous digital solutions failed because they assumed static numbers stay true forever. In reality, healthcare telemetry is fragile and decays rapidly."

---

## Slide 3: CareBridge Solution Architecture
### Decoupled 5-Module Multi-Tier System
- **Module 1: Hospital Directory & Verified Tiers** (Prevents unvetted clinics from claiming advanced capabilities).
- **Module 2: Freshness-Aware Referral Engine** (Haversine distance + time-based telemetry decay + multi-criteria ranking).
- **Module 3: Calibrated ML Triage & Screening** (HistGradientBoosting with $\ge 90\%$ sensitivity recall constraints and fallback rules).
- **Module 4: Ephemeral Consent-Based Record Exchange** (Patient-governed, time-bounded tokens across simulated hospitals).
- **Module 5: Scheme Potential Matcher & Hardening Perimeter** (Rule-based CMCHIS matching; Zero Client Trust; constant 404 IDOR defense).

> **Speaker Notes:**  
> "We did not build a monolithic black box. CareBridge decouples verified hospital profiles, dynamic telemetry decay, ML triage support, and patient-governed data exchange, wrapped in a Zero-Trust security perimeter."

---

## Slide 4: Freshness Decay & The `unknown_aware` Logic
### How CareBridge Treats Decaying Data
- **Urgency Decay Windows:**
  - Emergency referrals: $\tau = 120$ minutes (2 hours)
  - Urgent referrals: $\tau = 360$ minutes (6 hours)
  - Routine referrals: $\tau = 1440$ minutes (24 hours)
- **The Telemetry State Machine:**
  - If $\text{Age} \le \tau$: Status is **Confirmed Fresh**.
  - If $\text{Age} > \tau$ in `assume_available` mode: Naively assumed available (Conventional flawed practice).
  - If $\text{Age} > \tau$ in `unknown_aware` mode: Status transitions to **UNKNOWN** (Score penalized to 0.40, amber badge rendered).

> **Speaker Notes:**  
> "This is our mathematical core: rather than hoping an 8-hour-old bed report is still accurate, CareBridge penalizes stale telemetry and treats unknown capacity as genuinely unknown."

---

## Slide 5: Deterministic Referral Engine Formulation
### Transparent Multi-Criteria Ranking
$$\text{Score}(h, R) = 0.35 \cdot C(h, R) + 0.25 \cdot T(h, R) + 0.30 \cdot D(h, R) + 0.10 \cdot S(h, R)$$

- **Strict Hard Filters Pre-Check:**
  1. Hospital must be **Verified** by Platform Reviewer.
  2. Hospital must possess the **Required Specialty** (e.g., Pulmonology).
  3. Hospital must provide **24/7 Emergency** if urgency is emergency.
- **Continuous Scoring Components:**
  - $C$: Capacity score (1.0 for fresh available, 0.40 for stale unknown, 0.0 for full).
  - $T$: Tier match (1.0 for match, 0.70 for overqualified Tier 1).
  - $D$: Proximity score ($\max(0, 1 - d / 150 \text{ km})$).
  - $S$: Scheme participation (1.0 for CMCHIS empaneled, 0.50 otherwise).

> **Speaker Notes:**  
> "We intentionally chose a deterministic weighted sum over a black-box neural ranking model. In emergency medicine, every score breakdown must be inspectable and explainable to the attending physician."

---

## Slide 6: Phase 3 Baseline Benchmark (500 Scenarios)
### Performance Under Fresh Telemetry ($s = 0\%$)

| Strategy / Method | Top-1 Capability Match | Top-1 Suitable Rate | Top-3 Hit Rate | Mean MRR | Mean Distance |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **CareBridge (unknown_aware)** | **100.0%** | **100.0%** | **100.0%** | **1.000** | 24.8 km |
| Nearest Eligible | 100.0% | 71.0% | 97.6% | 0.839 | 14.8 km |
| **Nearest Verified (Proximity)** | **71.2%** | **50.2%** | **84.6%** | **0.692** | 14.2 km |
| **Always Tier 1 (Quaternary Hub)** | **100.0%** | **67.6%** | **93.4%** | **0.809** | 17.9 km |
| Random Eligible | 99.4% | 68.6% | 95.4% | 0.819 | 221.8 km |

- **Key Takeaway:** Real-world heuristics fail significantly: Proximity sends patients to inappropriate clinics **49.8% of the time**; Quaternary bias fails in **32.4% of cases** due to bed congestion.

> **Speaker Notes:**  
> "Even under perfect fresh conditions, sending patients to the nearest hospital fails half the time because the clinic lacks the specialist. Always sending to apex hubs fails a third of the time because tertiary beds are congested."

---

## Slide 7: Phase 4 Headline Finding: The Staleness Experiment
### 15,000 Evaluations across 30 Test Seeds ($s \in [0\%, 50\%]$)

- **Hypothesis 1 Confirmed (Safety Superiority):**
  - At 50% staleness, naive `assume_available` suffered a **19.3% false-available rate** [95% CI: 18.9%, 19.6%].
  - CareBridge `unknown_aware` maintained **0.0% false availability** [95% CI: 0.0%, 0.0%].
  - Significant safety improvement: $\Delta = -19.25\%$, $p < 0.0001$ (Wilcoxon), Cliff's $\delta = -1.000$.

- **Hypothesis 2 Quantified (The Cost of Caution):**
  - By refusing to trust decaying reports, `unknown_aware` expanded search horizons.
  - Mean transit distance increased from **24.8 km** $\to$ **33.6 km** (20% staleness) $\to$ **60.4 km** (50% staleness).
  - Naive `assume_available` stayed closer (20.0 km), but dispatched 1 in 5 patients to full emergency rooms!

> **Speaker Notes:**  
> "This slide captures our core empirical finding. CareBridge eliminates false-available dispatch errors entirely. But we don't hide the trade-off: safety has a geographic distance cost. The system diverts to verified open hospitals further away."

---

## Slide 8: Machine Learning Triage & Screening Support
### High-Sensitivity Pre-Referral Decision Support
- **Triage Severity Model:** Calibrated HistGradientBoosting on MIMIC-IV-ED Demo ($N=41$ test visits).
  - Test AUROC: **0.702** [0.511–0.855], Sensitivity: **84.0%** [68.0–96.2%], Brier Score: **0.2186**.
  - Achieved 84.0% sensitivity (21/25) on the held-out split; the approximate NEWS2 baseline's continuous-score AUROC was 0.672 (no cutoff metrics reported).
- **5 Condition Screening Models (50-fold Repeated Stratified CV):**
  - Diabetes (Pima): **90.3% sensitivity**, AUROC 0.833 (threshold 0.24)
  - Heart Disease (Cleveland): **90.6% sensitivity**, AUROC 0.899 (threshold 0.28)
  - Liver Disease (ILPD): **90.4% sensitivity**, AUROC 0.744 (threshold 0.56)
  - Chronic Kidney Disease: **95.6% sensitivity**, AUROC 1.000 (threshold 0.85)
  - Thyroid Disease: **90.1% sensitivity**, AUROC 0.990 (threshold 0.53)
- **Safety Fallback:** Automatic rule fallback to WHO 2011 Anemia and 2017 ACC/AHA Hypertension guidelines if microservice times out.

> **Speaker Notes:**  
> "In clinical pre-referral screening, missing a sick patient is catastrophic. We explicitly tuned operating thresholds downward to ensure greater than 90% sensitivity across all screening models."

---

## Slide 9: Patient-Governed Ephemeral Consent & Sharing
### Dual-Hospital Simulation (Salem Hospital & Kovai Medical Center)
- **Granular Patient Agency:**
  - Patient selects specific records to share (Discharge Summary, Lab Reports, Imaging).
  - Enforces explicit time duration (1 to 90 days).
  - Can narrow scope, shorten duration, or revoke instantly.
- **Immutable Audit Logging:**
  - Every access event records actor ID, hospital ID, IP address, and timestamp.
  - Complete access history visible to the patient.
- **Clinical Safeguards:**
  - Records older than 6 months automatically flagged with a staleness warning in the doctor portal.

> **Speaker Notes:**  
> "Patients are not passive data objects in CareBridge. They control exactly which records are visible to the receiving hospital and for how many days, with an immutable access trail."

---

## Slide 10: Security Hardening & Defenses
### Enterprise-Grade Defense-in-Depth
- **Zero Client Trust:** All role authorization and object permissions enforced server-side.
- **Brute-Force Protection:** IP & account-based rate limiter (5 consecutive failed attempts locks out for 15 minutes).
- **NoSQL Injection Defense:** Recursive operator query sanitizer strips `$where`, `$regex`, `$ne`, `$gt`.
- **Constant 404 IDOR Protection:** Probing nonexistent vs unauthorized referral IDs returns an identical 404 response, preventing object enumeration.
- **Authorisation Matrix CI:** 13 critical REST endpoints automatically audited across 5 distinct user roles.

> **Speaker Notes:**  
> "In Phase 7, we audited and hardened every layer. Notice our IDOR defense: an attacker scanning referral IDs cannot distinguish between an ID that doesn't exist and one that belongs to another patient."

---

## Slide 11: Consolidated Limitations & Honest Boundaries
### Explicit Research Boundaries
1. **Synthetic Data Construct:** Evaluated on realistic synthetic patient cohorts and hospital distributions; not yet tested on live production EHRs.
2. **Straight-Line Distance:** Uses Haversine distance; real mountain ranges, traffic, and road conditions will alter travel times.
3. **Local Consent Simulation:** Simulates ABDM / DEPA token mechanics locally; does not connect to live National Health Authority sandbox.
4. **Mandatory Human-in-the-Loop:** Decision support only; never executes automated transfers or dispatch without doctor signature.
5. **No Coverage Claims:** Programmatically forbids claiming "eligible" or "free care" for government schemes.

> **Speaker Notes:**  
> "Academic honesty is critical. We do not claim this is an operational clinical product. We clearly state our simulation assumptions, distance approximations, and the strict requirement for human clinical review."

---

## Slide 12: Conclusion & Summary
### Summary of Achievements
- **Built, Integrated, & Hardened** a 5-module regional health referral decision support system.
- **Demonstrated Empirical Value:** Eliminated false-available transfer failures (0.0% vs 19.3%) under decaying telemetry.
- **Characterized the Trade-Off:** Quantified the geographic distance cost of caution (24.8 km to 60.4 km).
- **Ensured High-Sensitivity Clinical ML:** $\ge 90\%$ recall across condition screening models with automatic fail-safe fallback.
- **100% Automated Reproducibility:** CI workflows, Docker containers, Makefiles, and single-command verification (`npm run check:reproduce`).

**Thank you! We welcome your questions.**

---
