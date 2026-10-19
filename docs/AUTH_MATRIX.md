# CareBridge Role-Based Access Control (RBAC) Authorisation Matrix

> **Generated Automatically by**: `backend/src/tests/authMatrix.test.js`
> **Date Generated**: 2026-10-19T09:49:47.291Z
> **Standard**: Zero Client Trust; strict server-side role gating on all endpoints.

| Endpoint | Method | Public | Patient | Triage Nurse | Doctor | Hospital Admin | Platform Reviewer | Result |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `/api/health` | **GET** | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | PASSED |
| `/api/auth/me` | **GET** | `DENY` (401) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | PASSED |
| `/api/hospitals/6ad5e7b74dce8af0bb5fba3f` | **GET** | `ALLOW` (200) | `ALLOW` (200) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | PASSED |
| `/api/hospitals/6ad5e7b74dce8af0bb5fba3f/practitioners` | **GET** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | PASSED |
| `/api/hospitals/6ad5e7b74dce8af0bb5fba3f/capacity/latest` | **GET** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | PASSED |
| `/api/hospitals/6ad5e7b74dce8af0bb5fba3f/capacity` | **PUT** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/hospitals/6ad5e7b74dce8af0bb5fba3f` | **PUT** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/hospitals` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (400) | `DENY` (403) | PASSED |
| `/api/hospitals/6ad5e7b74dce8af0bb5fba39/capacity` | **PUT** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (201) | `DENY` (403) | PASSED |
| `/api/referrals/assess` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/referrals/recommend` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `ALLOW` (400) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/consents/request` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `ALLOW` (400) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/consents/access-history` | **GET** | `DENY` (401) | `ALLOW` (200) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/schemes` | **GET** | `DENY` (401) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | PASSED |
| `/api/schemes/6ad5e7b74dce8af0bb5fba48/verify` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | PASSED |
| `/api/specialty-map` | **GET** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | PASSED |
| `/api/specialty-map/6ad5e7b74dce8af0bb5fba4b` | **PATCH** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | PASSED |
| `/api/hospitals/6ad5e7b74dce8af0bb5fba39/verify` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | PASSED |
| `/api/triage/records` | **POST** | `DENY` (401) | `DENY` (403) | `ALLOW` (400) | `ALLOW` (400) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/triage/records` | **GET** | `DENY` (401) | `DENY` (403) | `ALLOW` (200) | `ALLOW` (200) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/triage/records/6ad5e7b84dce8af0bb5fba8e/confirm-urgency` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `ALLOW` (400) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/triage/patients` | **GET** | `DENY` (401) | `DENY` (403) | `ALLOW` (200) | `ALLOW` (200) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/hospitals/6ad5e7b74dce8af0bb5fba39/nurses` | **GET** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | `DENY` (403) | PASSED |

### Legend
- `ALLOW (2xx/3xx/400/404)`: Authorized role (request passed authentication & authorization gates; may return 400 for empty body payload).
- `DENY (401/403)`: Unauthorized role (properly rejected by JWT or RBAC middleware).
