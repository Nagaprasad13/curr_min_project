# CareBridge Phase 8.5 Demo

All fixtures and accounts are synthetic. This is a research prototype, not a clinical
product. Do not enter real patient information or use it for care decisions.

## Run the demo database

Start a local MongoDB instance dedicated to the demo. The scripts intentionally do not
fall back to MongoMemoryServer or another database. In PowerShell, from `backend`:

```powershell
$env:CAREBRIDGE_DEMO_DATABASE = 'true'
$env:DEMO_DATABASE_NAME = 'carebridge_demo'
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/carebridge_demo'
npm run seed-demo
npm run demo-check
```

The seed writes unique generated passwords to the git-ignored
`backend/seed-credentials.json`. Read that local file to sign in; passwords are not
printed by the seed or documented here. The account entries include:

| Role | Demo account |
|---|---|
| Platform reviewer | `reviewer@carebridge.invalid` |
| Salem hospital administrator | `admin.salem@carebridge.invalid` |
| Doctor | `doctor@carebridge.invalid` |
| Patient | `patient.kavitha@carebridge.synthetic` |
| Each hospital administrator | `admin.<hospital-code>@carebridge.invalid` |
| Hospital-linked doctors | Unique `doctor.<practitioner-id>@carebridge.invalid` addresses, plus the base doctor account |

The credentials file maps the generated account email and password to its role,
hospital, and (for linked doctors) practitioner. Seeded accounts are synthetic and are
not enabled by production seed commands.

To restore the fixture state, keep the same environment variables and run
`npm run reset-demo`. Reset requires the persistent database marker created by
`seed-demo`; it refuses production mode, a missing marker, and any URI/database name
other than `carebridge_demo`. `npm run demo-check` prints collection/state counts and
fails if a required example is missing.

## Guided scenario: seven steps

The complete command-line walkthrough is `npm run demo`. It adds an audit-logged
capacity update and exercises the real consent services; it uses the pre-seeded
assessment examples rather than invoking an ML model. The static assessment fixtures
are marked `inferenceExecuted: false` and use version `demo-fixture-v1`; they are not
predictions from a registered model.

| Step | Account | Action |
|---|---|---|
| 1. Capacity | Salem hospital administrator, `admin.salem@carebridge.invalid` | Update the Salem facility capacity. The runner creates a fresh, timestamped capacity snapshot. |
| 2. Patient intake | Doctor, `doctor@carebridge.invalid`; patient `patient.kavitha@carebridge.synthetic` | Review the synthetic breathing-difficulty intake used in the walkthrough. |
| 3. Red flags | Doctor | Open `DEMO-REF-2026-0001`; review the red-flag assessment fixture and its explicit no-inference label. |
| 4. Confirm urgency | Doctor | Review `DEMO-REF-2026-0004`; it includes a simulated clinician urgency choice and a reason. |
| 5. Ranked referral | Doctor | Run the referral ranking in `npm run demo`. Also inspect `DEMO-REF-2026-0005` (nearest hospital lacks the specialty), `DEMO-REF-2026-0006` (ranked hospital with never-reported capacity), `DEMO-REF-2026-0007` (Tier 2 above Tier 1), and `DEMO-REF-2026-0011` (no suitable hospital). |
| 6. Consent and record view | Doctor, then patient | The runner requests consent, the patient grants a narrower record scope, and the doctor reads only matching records. |
| 7. Revoke and verify access stops | Patient, then doctor | The patient revokes consent; the runner verifies that record access is no longer active. The insufficient-data path then displays `DEMO-REF-2026-0002`. |

The seeded referral, assessment, and consent rows are examples for UI/demo navigation.
Their static content does not represent actual patient assessments or engine predictions.
The ranking printed by `npm run demo` is generated live by the existing referral engine.
The evaluation scenarios and staleness-run outputs remain separate from these fixtures.

## Reset and verification

```powershell
npm run demo-check
npm run reset-demo
npm run demo-check
```

Never point these commands at an Atlas URI, a production database, or a database
containing non-demo data. The scripts require the exact dedicated database name and a
stored demo marker before reset/check operations.
