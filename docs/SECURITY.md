# CareBridge Security Architecture, Threat Model & Hardening Review

> **CRITICAL DISCLAIMER:**  
> **Health Informatics Research Prototype.** CareBridge is designed for academic evaluation of capability verification, staleness-aware referral algorithms, and consent enforcement in simulated Tamil Nadu health systems.  
> It is **NOT** a certified Medical Device, clinical product, or legal record system. It has **NOT** undergone formal third-party penetration testing, legal regulatory certification (India's Digital Personal Data Protection (DPDP) Act 2023, ABDM M1-M3, or HIPAA), or commercial cryptographic audits.

---

## 1. Dependency Audit & Vulnerability Assessment

A full dependency audit was executed using `npm audit` across all backend and frontend packages.

| Package | Affected Versions | Dependency Type | Advisory / CVE | Severity | Context & Mitigation in CareBridge |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `braces` / `micromatch` | `<3.0.3` | devDependencies (`jest`, `nodemon`) | GHSA-grv7-fg5c-x5vh | High | **Dev/Build-only**: Nested inside Jest test runner and Nodemon file watcher. Neither package is bundled or executed in production Express HTTP request pipelines. |
| `sprintf-js` | `<1.1.3` | devDependencies (`argparse`, `js-yaml`) | GHSA-hp3w-g68c-fv3c | Moderate | **Dev/Build-only**: Used during Istanbul code coverage report generation. Never exposed to untrusted user input. |
| `uuid` | `<11.1.1` | Direct runtime | GHSA-w5hq-g745-h8pq | Moderate | **Buffer bounds in v3/v5/v6**: CareBridge strictly uses `uuid.v4()` (random UUID generation) without passing pre-allocated buffer offsets. No exploitable surface. |

---

## 2. Secrets Management & Credential Hygiene

1. **Environment Variables Only**: All credentials (database connection strings, JWT signing keys, port configuration) are read strictly from `process.env`.
2. **Templates Provided**: Complete, non-secret `.env.example` templates are provided in both root and `backend/` directories.
3. **Strict `.gitignore` Enforcement**:
   - `.env`, `.env.local`, `.env.*` are excluded from version control.
   - `/ml/data`, raw datasets, MIMIC exports, and clinical archives are strictly git-ignored.
   - Python artifacts (`*.pkl`, `*.joblib`, `__pycache__`) are ignored to prevent data leakage.
4. **Log Masking**: Database connection strings in console output automatically mask password strings (`:****@`).

---

## 3. Authentication & Session Hardening

1. **Dual-Token Architecture & Rotation**:
   - Access tokens are short-lived (`15m` default), passed via `httpOnly` cookies or Bearer headers.
   - Refresh tokens are 64-byte cryptographically secure random hex strings stored as SHA-256 hashes in MongoDB ([RefreshToken.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/models/RefreshToken.js)) with a 7-day TTL.
   - **Token Rotation**: Every refresh request revokes the previous refresh token and issues a new pair.
   - **Re-use Compromise Detection**: If a revoked refresh token is presented, the system detects a potential token hijack and immediately invalidates all active sessions for that user.
2. **Cookie Architecture & `SameSite=lax` + CSRF Rationale**:
   - Authentication cookies (`accessToken`, `refreshToken`) are marked `httpOnly: true` (preventing XSS exfiltration) and `secure: true` in production (`NODE_ENV=production`).
   - **Why `SameSite=lax` instead of `SameSite=strict`**:
     - `SameSite=strict` strips cookies on all top-level cross-site navigations (e.g. clicking an external referral link, email verification, or hospital portal redirect), causing jarring session drops.
     - `SameSite=lax` allows safe top-level `GET` navigations while withholding cookies on cross-origin `POST`, `PUT`, `DELETE`, and `PATCH` requests.
     - To ensure defense-in-depth, `SameSite=lax` is paired with an explicit **double-submit CSRF cookie** ([middleware/csrf.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/middleware/csrf.js)): browsers must echo the non-httpOnly `XSRF-TOKEN` cookie via the `x-xsrf-token` header on all mutating requests.
3. **MongoDB-Persisted Brute-Force Lockout**:
   - Failed login attempts and account lockouts are persisted in MongoDB ([LoginLockout.js](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/backend/src/models/LoginLockout.js)), surviving server restarts.
   - Accounts are locked for 15 minutes after 5 consecutive failures (`429 Too Many Requests`).
4. **Mandatory 2FA for High-Privilege Roles in Production**:
   - Optional RFC 6238 TOTP 2FA is supported for all accounts.
   - When running in production (`NODE_ENV=production`), 2FA enrollment and verification is **mandatory** for `platform_reviewer` and `hospital_admin` roles.
5. **Password Policy**: Registration enforces minimum 8 characters containing both letters and numbers. Passwords are salted and hashed using `bcryptjs` (salt rounds = 10).

---

## 4. Role-Based Access Control (RBAC) Authorisation Matrix

CareBridge enforces **Zero Client Trust**. Client claims, query parameters, or client-side role toggles are never trusted. All access gates are enforced server-side.

See the complete automatically generated matrix in [docs/AUTH_MATRIX.md](file:///c:/Users/Nagaprasad%20M/OneDrive/Desktop/mini/docs/AUTH_MATRIX.md).

| Route Family | Public | Patient | Doctor | Hospital Admin | Platform Reviewer |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `GET /api/health` | Allow | Allow | Allow | Allow | Allow |
| `POST /api/auth/login` | Allow | Allow | Allow | Allow | Allow |
| `GET /api/hospitals` (Verified) | Allow | Allow | Allow | Allow | Allow |
| `POST /api/hospitals` (Register) | Deny (401) | Deny (403) | Deny (403) | **Allow** | Deny (403) |
| `POST /api/hospitals/:id/verify` | Deny (401) | Deny (403) | Deny (403) | Deny (403) | **Allow** |
| `PUT /api/hospitals/:id/capacity` | Deny (401) | Deny (403) | Deny (403) | **Allow (Owner)** | Deny (403) |
| `POST /api/referrals/assess` | Deny (401) | Deny (403) | **Allow** | Deny (403) | Deny (403) |
| `POST /api/referrals/recommend` | Deny (401) | Deny (403) | **Allow** | Deny (403) | Deny (403) |
| `POST /api/consents/request` | Deny (401) | Deny (403) | **Allow** | Deny (403) | Deny (403) |
| `POST /api/consents/:id/grant` | Deny (401) | **Allow (Owner)** | Deny (403) | Deny (403) | Deny (403) |
| `GET /api/patients/:id/records` | Deny (401) | **Allow (Self)** | **Allow (Consented)**| Deny (403) | Deny (403) |
| `PATCH /api/specialty-map/:id` | Deny (401) | Deny (403) | Deny (403) | Deny (403) | **Allow** |

---

## 5. Insecure Direct Object Reference (IDOR) Mitigation

To prevent enumeration of patient IDs, referral codes, or hospital IDs:
- Whenever an authenticated caller queries an ID belonging to another user, the API returns the **identical generic 404 response**:
  ```json
  { "error": "Not Found", "message": "Record not found or access denied." }
  ```
- Attackers cannot deduce whether a record exists or distinguish unauthorized access from non-existent resources via HTTP status code discrepancies.

---

## 6. Input Validation, Output Encoding & Sanitization

1. **Strict Payload Limits**: Request bodies are capped at `100kb` (`express.json({ limit: '100kb' })`) to prevent memory exhaustion and Denial-of-Service.
2. **NoSQL Injection Sanitization**: All query parameters (`req.query`) and body parameters (`req.body`) are recursively scanned to strip MongoDB query operators (`$ne`, `$where`, `$regex`, `$gt`) and dot notations before hitting database models.
3. **HTTP Security Headers**: Express mounts `helmet()` configuring `X-Content-Type-Options: nosniff`, `X-DNS-Prefetch-Control`, and referrer policies.
4. **Decoupled Clinical Storage**: Clinical files are stored on disk in protected storage (`backend/storage/records/`) outside the web root. Direct HTTP access to `/storage/records` is blocked with a 403 Forbidden gateway.

---

## 7. Logging & Privacy Hygiene

1. **Zero PHI in Logs**: Express `morgan` and application logs omit clinical payloads, diagnostic details, and tokens.
2. **Password & Token Exclusion**: Audit logs record actor ID, role, action, and resource references, but **never** record passwords, JWT tokens, or raw medical text.
3. **Patient Access Report**: Every read of patient records generates an immutable `AuditLog` entry, allowing patients to view transparently who accessed their health data.

---

## 8. Consolidated Threat Model Across Phases

| Threat ID | Threat Description | Attacker Persona | Mitigation in CareBridge | Residual Risk |
| :--- | :--- | :--- | :--- | :--- |
| **TH-01** | **Ghost Facility Registration**: Malicious user registers non-existent hospital to divert patients. | Unauthorized actor | Two-stage tier audit: hospitals start as `unverified` and `unconfirmed`. Invisible to referrers until Platform Reviewer approval. | Reviewer collusion or compromised reviewer credentials. |
| **TH-02** | **Stale Bed Phantom Routing**: Diverting critically ill patients to hospitals with filled beds. | System staleness | **Freshness Evaluator**: Telemetry older than configurable threshold ($>2$ hours) is degraded to `"unknown"` and penalized. | Telemetry falsified in real-time by hospital staff. |
| **TH-03** | **Unauthorized PHI Exfiltration**: Referring doctor scraping records of patients without consent. | Inquisitive doctor | **Zero Client Trust**: Server-side consent check on every fetch. Consent requires affirmative patient grant. | Doctor viewing records under active consent and sharing offline. |
| **TH-04** | **IDOR Enumeration**: Script crawling `/api/patients/:id/records` to enumerate registered patients. | Malicious client | Generic 404 response for both unauthorized and non-existent IDs. Rate limiting (60 req/min). | Brute force timing attacks over millions of attempts. |
| **TH-05** | **Misleading Financial Guarantees**: Patient assuming scheme prediction guarantees free care. | Misinformed patient | **Forbidden-phrase scanner**: Rejects outputs containing "eligible", "covered", or "free". Enforces mandatory disclaimer. | External human misunderstandings outside software UI. |
| **TH-06** | **Emergency Transfer Failure (Break-Glass)**: System lockouts preventing records access during cardiac arrest. | Emergency physician | Time-limited Break-Glass access (default OFF, prominent audit logging, notification dispatch). | Potential clinician overuse of emergency bypass. |

---

## 9. Explicit Declaration: What Is NOT Done

CareBridge is a university health-informatics research prototype:
- **No Penetration Testing**: No offensive red-teaming, fuzzing, or formal penetration testing has been conducted.
- **No Production Key Management**: Uses symmetric JWT secrets rather than asymmetric HSM/KMS infrastructure (e.g., AWS KMS / HashiCorp Vault).
- **No Production Identity Verification**: Uses synthetic phone/email authentication rather than Aadhaar eKYC, DigiLocker, or ABDM Ayushman Bharat Health Account (ABHA).
- **No Regulatory Certification**: CareBridge is not certified under India's Digital Personal Data Protection (DPDP) Act 2023, the Clinical Establishments Act, or HIPAA/GDPR compliance frameworks.
