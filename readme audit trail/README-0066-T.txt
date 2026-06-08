README-0066-T — Roster Absolute Style Gate

Purpose:
- Stop the Roster page from rendering any fallback/default shell while organization style is missing.

Install:
- Upload assets/user/USER-PAGE-roster-current.js to GitHub.

Test:
- Open /roster?syncetc_debug=1.
- Confirm version 2026-06-07-021-T.
- Confirm there is no root:rendered/root:revealed while styleConfig is missing.
- Confirm no blue/default roster flash.

No SQL.
No Edge Function deploy.
No shell changes.
No Webflow change.
