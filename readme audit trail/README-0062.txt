README-0062 — Portal Auth Flow Repair
Version: 2026-06-07-017-A

Purpose:
Repair portal login/session handoff so /login does not cause a second login request on /user-dashboard, /roster, /organization-admin, or /organization-people.

Files changed:
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/auth/AUTH-PAGE-login-current.js
- assets/user/USER-PAGE-dashboard-current.js
- assets/user/USER-PAGE-roster-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-dashboard-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Changes:
- Added browser-session settling after login.
- Added shared auth-change notification from portal shell.
- Added checking-login state before showing login forms.
- Prevented pages from showing login form while a just-completed login is still settling.
- Preserved existing organization selection, page activation, and role logic.

Install:
Upload the listed GitHub files only. No SQL, no Edge Function deployment, no Webflow change.
