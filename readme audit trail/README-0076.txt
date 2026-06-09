README-0076 — Portal Logged-Out Render Repair

Purpose
- Fix portal pages hanging while logged out after the style-gate work.
- Logged-out users should see a neutral login screen without waiting for organization style.
- Logged-in users remain protected by the organization-style render gate to prevent blue/default flashes.

Changed files
- assets/core/CORE-COMPONENT-portal-shell-current.js

Install
1. Upload assets/core/CORE-COMPONENT-portal-shell-current.js to GitHub.
2. Wait 1–3 minutes.
3. Confirm direct URL shows 2026-06-08-026-B.
4. Hard refresh portal pages.

Test
- Logged out /organization-admin shows login form.
- Logged out /member-documents shows login form.
- Logged out /internal-documents shows login form.
- After login, page waits for organization style and renders without blue flash.

No SQL. No Edge Function. No Webflow change.
