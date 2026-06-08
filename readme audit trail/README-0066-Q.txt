README-0066-Q — Roster Render Gate Repair

Purpose:
- Prevent the Roster page from visibly rendering its fallback/default blue style before organization style arrives.
- Suppress duplicate startup refresh/auth/access loads by using one in-flight refresh promise.
- Keep roster diagnostics available behind ?syncetc_debug=1.

Files to upload:
- assets/user/USER-PAGE-roster-current.js

Install:
1. Upload assets/user/USER-PAGE-roster-current.js to GitHub.
2. Commit.
3. Wait 1–3 minutes.
4. Confirm direct URL shows 2026-06-07-021-Q.
5. Test /roster?syncetc_debug=1.

No SQL.
No Edge Function deploy.
No shell changes.
