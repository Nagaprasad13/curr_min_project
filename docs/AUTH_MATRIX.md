# CareBridge Role-Based Access Control (RBAC) Authorisation Matrix

> **Generated Automatically by**: `backend/src/tests/authMatrix.test.js`
> **Date Generated**: 2026-10-13T17:46:50.277Z
> **Standard**: Zero Client Trust; strict server-side role gating on all endpoints.

| Endpoint | Method | Public | Patient | Doctor | Hospital Admin | Platform Reviewer | Result |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `/api/health` | **GET** | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | PASSED |
| `/api/auth/me` | **GET** | `DENY` (401) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | PASSED |
| `/api/hospitals` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `ALLOW` (400) | `DENY` (403) | PASSED |
| `/api/hospitals/6ace6e856fca651e9025a863/capacity` | **PUT** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `ALLOW` (201) | `DENY` (403) | PASSED |
| `/api/referrals/assess` | **POST** | `DENY` (401) | `DENY` (403) | `ALLOW` (200) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/referrals/recommend` | **POST** | `DENY` (401) | `DENY` (403) | `ALLOW` (400) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/consents/request` | **POST** | `DENY` (401) | `DENY` (403) | `ALLOW` (400) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/consents/access-history` | **GET** | `DENY` (401) | `ALLOW` (200) | `DENY` (403) | `DENY` (403) | `DENY` (403) | PASSED |
| `/api/schemes` | **GET** | `DENY` (401) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | PASSED |
| `/api/schemes/6ace6e856fca651e9025a868/verify` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | PASSED |
| `/api/specialty-map` | **GET** | `DENY` (401) | `DENY` (403) | `ALLOW` (200) | `ALLOW` (200) | `ALLOW` (200) | PASSED |
| `/api/specialty-map/6ace6e856fca651e9025a87b` | **PATCH** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | PASSED |
| `/api/hospitals/6ace6e856fca651e9025a863/verify` | **POST** | `DENY` (401) | `DENY` (403) | `DENY` (403) | `DENY` (403) | `ALLOW` (200) | PASSED |

### Legend
- `ALLOW (2xx/3xx/400/404)`: Authorized role (request passed authentication & authorization gates; may return 400 for empty body payload).
- `DENY (401/403)`: Unauthorized role (properly rejected by JWT or RBAC middleware).
