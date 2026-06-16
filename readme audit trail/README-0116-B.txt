SYNCETC WEBSITE REBUILD — AUDIT TRAIL
Package: 0116-B — People Workbench Load Guard
Date: 2026-06-16

Purpose
- Fix first-run Organization Management People/Members module load failure showing "lower is not defined".
- Preserve 0116-A People Workbench UI/functionality.
- Add a small compatibility guard for legacy/stale People module fragments that may reference a global lower() helper during embedded loading.
- Improve debug-only module error detail so the active module and expected child-module versions are visible in syncetc_debug=1.

Changed Files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Expected Internal Versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-B
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-B

No SQL Changes
No Edge Function Changes
No Webflow Embed Changes

Install
1. Copy the two changed files into the repo using the same paths.
2. Commit/push to GitHub.
3. Wait for GitHub Pages to refresh.
4. Hard refresh the test page.

Primary Test URL
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members

Expected Result
- People/Members loads inside Organization Management.
- The module should not show "lower is not defined".
- Debug mode should show 2026-06-16-116-B.
- Existing People Workbench functions from 0116-A remain unchanged.

Notes
- The compatibility helper is intentionally tiny and only defines window.lower if it does not already exist.
- This is a defensive guard against stale/cached/legacy frontend fragments during the embedded module transition.
