README-0066-M — Portal Shell Timing Diagnostics

Purpose:
Adds ?syncetc_debug=1 timing diagnostics to the portal shell so User Dashboard, Organization Admin, People, and Roster pages can be measured the same way public pages are measured.

Files:
- assets/core/CORE-COMPONENT-portal-shell-current.js

No SQL.
No Edge Function deploy.
No Webflow changes.

Expected version:
2026-06-07-021-M

Test URLs:
- /user-dashboard?syncetc_debug=1
- /organization-admin?syncetc_debug=1
- /organization-people?syncetc_debug=1
- /roster?syncetc_debug=1
