README-0064
Package: Unified Header + Auth Flow Merge Repair
Version: 2026-06-07-019-A

Purpose:
- Merge the 0062 portal auth-flow repair with the 0063 unified organization header.
- Fix pages stuck on “Checking login…” when scripts load after DOMContentLoaded.
- Keep one organization header across public/user/admin pages.

Files changed:
- CORE-COMPONENT-portal-shell-current.js
- PUBLIC-COMPONENT-site-shell-current.js
- AUTH-PAGE-login-current.js
- USER-PAGE-dashboard-current.js
- USER-PAGE-roster-current.js
- CUSTOMER-ADMIN-PAGE-dashboard-current.js
- CUSTOMER-ADMIN-PAGE-people-current.js

Notes:
- No SQL.
- No Edge Function deploy.
- Fix is primarily robust boot/auth initialization across Webflow/GitHub-loaded scripts.
