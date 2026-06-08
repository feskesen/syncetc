README-0066-P — Roster Page Timing Diagnostics

Purpose:
- Add temporary diagnostics to the logged-in roster page to identify whether the blue/default flash is coming from the roster page JS rather than the portal shell.

Install:
- Upload assets/user/USER-PAGE-roster-current.js to GitHub.
- Wait for GitHub Pages.
- Confirm the direct file shows 2026-06-07-021-P.

Test:
- Open /roster?syncetc_debug=1.
- Review the diagnostic panel.

Expected diagnostic value:
- Shows whether roster renders before organization style/access is ready.
- Shows timings for Supabase session, get_user_dashboard, organization_list_roster, and first visible roster render.

No SQL.
No Edge Function.
No shell changes.
