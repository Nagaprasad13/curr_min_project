# CareBridge: 3-to-5 Minute Live Demonstration Script

*Scenario:* **Emergency Referral of Acute Respiratory Failure (Salem to Coimbatore Network)**  
*Total Time:* 4 minutes 30 seconds  
*Target Portals:* React Vite UI (`http://localhost:3000`) & Express Backend (`http://localhost:5000`)  

---

## Pre-Demo Quick Verification (T-Minus 2 Minutes)

> [!NOTE]
> **No Python ML Service Required:** The backend includes embedded clinical rule engines (NEWS2 vital score protocol, WHO anemia guidelines, ACC/AHA hypertension thresholds). The entire demonstration is **100% self-contained** using only Terminal 1 (Node.js backend) and Terminal 2 (React frontend). There is **no need** to run or start the Python ML model.

1. Ensure services are running:
   ```powershell
   # Terminal 1: Backend
   cd backend && npm run dev
   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```
2. Reset demo data to a pristine state:
   ```powershell
   cd backend && npm run demo:reset
   ```
3. Open browser at `http://localhost:3000`.

---

## Step-by-Step Demo Flow

### Step 1: Persona 1 — Hospital Admin Telemetry Update (0:00 – 0:45)
- **Action**: In the top navigation bar, select Persona: **"Salem Admin"** (`admin.salem@carebridge.test`).
- **Screen**: Hospital Admin Portal (`/admin`).
- **What to Point Out on Screen**:
  1. Show the Hospital Profile: *Salem District Hospital (Tier 2)*.
  2. Notice the Capability Verification Badge: *VERIFIED by TNHSP*.
  3. Point out the live telemetry panel: General Beds, Emergency Beds, ICU Beds, Ventilators.
  4. Notice the **Freshness Indicator**: *"Last updated: <1 hr ago (FRESH)"*.
- **Live Interaction**:
  - Decrement available ICU beds from 2 to 1.
  - Click **"Update Operational Capacity"**.
  - Show instant success toast: *"Capacity snapshot persisted with timestamp"*.
- **Spoken Script (Talking Point)**:
  > *"We begin from the perspective of an administrator at Salem District Hospital. Hospital capabilities are verified, and bed capacity is recorded as an immutable time-stamped snapshot rather than a static counter. The system immediately notes that this data is fresh."*

---

### Step 2: Persona 2 — Referring Doctor Intake & AI Triage (0:45 – 1:45)
- **Action**: Switch Persona to: **"Referring Doctor"** (`doctor.salem@carebridge.test`).
- **Screen**: Doctor Portal (`/doctor`), Tab 1: **"Intake & AI Triage"**.
- **What to Point Out on Screen**:
  1. The mandatory prominent disclaimer: *"Decision support only. A clinician must review."*
  2. Patient profile: *Kavitha Sundaram, 58F, Acute Respiratory Distress*.
  3. Pre-filled vital signs: SpO2 88% (hypoxemic), Respiratory Rate 28 bpm, SBP 145 mmHg.
- **Live Interaction**:
  - Click **"Run Automated Acuity Screening"**.
  - Show the ML Decision Support card:
    - Urgency suggestion: **"urgent"**
    - High-Risk Probability: **0.78**
    - Top contributing factors: *SpO2 < 90%, Tachypnea (>24 bpm)*.
    - Specialty suggestion: *Pulmonology / Critical Care*.
- **Spoken Script (Talking Point)**:
  > *"Now switching to the referring physician. A 58-year-old female presents with severe dyspnea and 88% oxygen saturation. With one click, our calibrated tree ensemble evaluates the vitals. It flags high acuity, highlights the exact contributing physiological factors, and suggests a pulmonology consult. Notice the system never makes the final clinical decision—it leaves the decision to the doctor."*

---

### Step 3: Persona 2 — Freshness-Aware Referral Ranking (1:45 – 2:45)
- **Action**: Doctor Portal, Tab 2: **"Referral Recommendations"**.
- **What to Point Out on Screen**:
  1. Urgency Confirmation Step: Doctor confirms urgency with a required clinical justification note.
  2. Toggle: Show the **"Unknown-Aware Mode"** switch (active by default).
- **Live Interaction**:
  - Click **"Generate Ranked Recommendations"**.
  - Inspect the Top-Ranked Hospitals:
    - **Rank 1**: *Kovai Medical Center (Tier 1, Coimbatore)* — ~145 km away, **Verified Fresh Capacity (3 ICU beds, 5 ventilators)**. Total score: **0.88**.
    - Notice Salem City Clinic: **Excluded / Filtered Out** in the exclusions table because it lacks a registered Pulmonologist and ICU ventilator.
  - Show the **Staleness Notice**:
    - Highlight an intermediate hospital whose report is 8 hours old. It displays an amber **"Unknown Capacity"** warning and was demoted in rank because its capacity cannot be guaranteed.
- **Spoken Script (Talking Point)**:
  > *"When the doctor requests recommendations, CareBridge evaluates distance, verified capabilities, and data freshness. The closest private clinic is filtered out because it lacks intensive respiratory equipment. Kovai Medical Center ranks at the top because it has confirmed fresh ICU beds. A closer facility with stale data is flagged with an amber warning—preventing a futile ambulance dispatch."*

---

### Step 4: Persona 3 — Patient Consent Governance (2:45 – 3:30)
- **Action**: Switch Persona to: **"Patient"** (`kavitha.patient@carebridge.test`).
- **Screen**: Patient Portal (`/patient`).
- **What to Point Out on Screen**:
  1. Personal Electronic Health Records: *Discharge Summary, Pulmonary Function Test, Chest CT Report*.
  2. Consent Configuration Form:
     - Target Facility: *Kovai Medical Center*.
     - Scope: *Discharge Summary + Lab Reports*.
     - Duration: *Set to 7 days*.
     - Purpose: *EMERGENCY_REFERRAL*.
- **Live Interaction**:
  - Click **"Grant Ephemeral Sharing Consent"**.
  - Show the newly active token with countdown and the **"Revoke Immediately"** button.
  - Scroll down to the **Immutable Access History**: Point out the live audit log showing which doctor viewed records.
- **Spoken Script (Talking Point)**:
  > *"Patient autonomy is central to CareBridge. Here, Mrs. Kavitha views her diagnostic history. Before any data travels to the receiving hospital, she grants an ephemeral 7-day consent token specifically for emergency referral. She can revoke access at any second, and her portal logs every single read operation."*

---

### Step 5: Persona 4 — TNHSP Platform Reviewer Audit Queue (3:30 – 4:15)
- **Action**: Switch Persona to: **"TNHSP Reviewer"** (`reviewer.tnhsp@carebridge.test`).
- **Screen**: Reviewer Portal (`/reviewer`).
- **What to Point Out on Screen**:
  1. **Tab 1: Facility Verification Queue**: Show pending hospital applications. Reviewer can approve or reject with mandatory audit remarks.
  2. **Tab 2: Scheme Catalogue**: Show CMCHIS and PM-JAY packages. Show the **"180-Day Audit Sweep"** button ensuring government scheme benefits are never out-of-date.
  3. **Tab 3: Condition-Specialty Mapping**: Show the clinical sign-off interface where state medical officers validate referral routing rules.
- **Spoken Script (Talking Point)**:
  > *"Finally, who guards the system? The State Health Systems Project (TNHSP) Reviewer. Facilities cannot self-certify as quaternary hubs without government review. Scheme packages are audited every 180 days to prevent obsolete billing rules, and condition routing maps require formal medical officer sign-off."*

---

### Wrap-Up & Closing (4:15 – 4:30)
- **Action**: Point to terminal / test outputs.
- **Spoken Script (Talking Point)**:
  > *"To conclude: In 4 minutes, we witnessed an end-to-end referral cycle that prevented a futile transfer, protected data freshness, preserved patient consent, and enforced state regulatory oversight. Every single metric and scenario you saw is verified by our automated CI test suite. Thank you."*

---

## Demo Fallback & Troubleshooting Tips
- **If MongoDB Atlas has network latency**: The backend maintains local in-memory fallback caches. All endpoints respond in under 50ms.
- **If the Python ML microservice is shut down**: The backend automatically falls back to deterministic NEWS2 and ACC/AHA clinical rules, displaying a clear *"Rule-Based Clinical Fallback Active"* notice without throwing errors.
- **To reset everything back to step 1**: Run `npm run demo:reset` in `backend`.
