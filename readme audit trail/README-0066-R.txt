README-0066-R — Roster Root Hold Until Style

Purpose:
- Stop the Roster page from rendering/revealing its own default/fallback UI before auth/access/style have completed.
- Preserve the duplicate-load fix from 0066-Q.

Files to upload:
- assets/user/USER-PAGE-roster-current.js

Version expected:
- 2026-06-07-021-R

Test:
- /roster?syncetc_debug=1
- Confirm no early fallback/default render.
- Confirm diagnostics do not show root:rendered at 5–6ms while styleConfig is missing.
- Confirm no duplicate get_user_dashboard or organization_list_roster calls.

No SQL.
No Edge Function.
No shell changes.
No Webflow change.
