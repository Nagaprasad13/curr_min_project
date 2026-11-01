# CareBridge Role-Based Access Control (RBAC) Authorisation Matrix

> **Generated Automatically by**: `backend/src/tests/authMatrix.test.js`
> **Date Generated**: 2026-11-01T06:53:45.690Z
> **Standard**: Zero Client Trust; strict server-side role gating on all endpoints.

| Endpoint | Method | Public | Patient | Triage Nurse | Doctor | Hospital Admin | Platform Reviewer | Result |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |

### Legend
- `ALLOW (2xx/3xx/400/404)`: Authorized role (request passed authentication & authorization gates; may return 400 for empty body payload).
- `DENY (401/403)`: Unauthorized role (properly rejected by JWT or RBAC middleware).
