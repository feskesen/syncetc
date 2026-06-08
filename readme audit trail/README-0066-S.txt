README-0066-S — Roster Hard Render Gate

Purpose:
- Prevent the Roster page from rendering/revealing its own default/fallback UI while auth/access/style refresh is still in flight.
- Fix the remaining blue/default flash that occurred before organization style was available.

Files to upload:
- assets/user/USER-PAGE-roster-current.js

No SQL.
No Edge Function deploy.
No Webflow change.

Expected version:
- 2026-06-07-021-S

Test:
- /roster?syncetc_debug=1
- Confirm no early root:rendered/root:revealed while styleConfig is missing.
- Confirm no duplicate get_user_dashboard or organization_list_roster calls.
