# README-0110-A — Member Dashboard Foundation

Internal versions:
- MEMBER-PAGE-dashboard-current.js: 2026-06-13-110-A
- USER-PAGE-dashboard-current.js: 2026-06-13-110-A
- CORE-COMPONENT-portal-shell-current.js: 2026-06-13-110-A
- CORE-COMPONENT-organization-header-current.js: 2026-06-13-110-A
- AUTH-PAGE-login-current.js: 2026-06-13-110-A
- core-access-action: 2026-06-13-110-A

Purpose:
Builds the first release-style member dashboard foundation as a quick-look launch pad, separate from /my-profile.

Scope:
- Member dashboard is a clean launch pad, not an accordion and not a profile editor.
- Welcome hero: "Welcome back, [first/display name]".
- Does not show low-value status/role labels like "member status active".
- Shows "Profile needs update" only if required basics are missing; it links to /my-profile.
- Required basics are checked fail-soft against available core_people/profile_json data: name, email, phone, address, profile photo, and pilot certificate data where present.
- Adds quick-link cards for My Profile, Member Documents, Roster, Calendar / Events, Submit to Gallery, Flight Scheduler placeholder, Report Maintenance Squawk placeholder, and Club Forum placeholder.
- Shows one next upcoming club event from existing published core_events data.
- Adds backend-fetched METAR cards for KFFA and KICT using AviationWeather.gov Data API.
- Shows raw METAR, decoded/translated details, flight category, observed UTC/local time, and fetch/last-updated time.
- Shows visible weather failure diagnostics if the backend fetch fails; the page still loads.
- Includes aviation weather disclaimer.
- Leaves CheckWX/provider backup as a future hook only; no API key was added.
- Does not build forum, maintenance squawk, finance, flight scheduler, or aircraft reservation systems.
- Updates login/default dashboard paths from /user-dashboard to /member/dashboard while keeping /user-dashboard asset compatibility.
- Preserves applicant-only access separation.

Install:
1. Upload GitHub assets:
   - assets/member/MEMBER-PAGE-dashboard-current.js
   - assets/user/USER-PAGE-dashboard-current.js
   - assets/core/CORE-COMPONENT-portal-shell-current.js
   - assets/core/CORE-COMPONENT-organization-header-current.js
   - assets/auth/AUTH-PAGE-login-current.js
   - assets/auth/AUTH-PAGE-password-current.js
2. Redeploy Supabase Edge Function:
   - core-access-action

Do not run SQL.
Do not redeploy:
- core-public-render
- core-admin-action

Test URLs:
- https://syncetc.webflow.io/member/dashboard?syncetc_debug=1
- https://syncetc.webflow.io/user-dashboard?syncetc_debug=1
- https://syncetc.webflow.io/login
- https://syncetc.webflow.io/my-profile
- https://syncetc.webflow.io/applicant-portal?syncetc_debug=1

Expected test results:
- Member/org-admin login lands on or can open /member/dashboard.
- Dashboard shows welcome, quick links, next event, METAR cards, and weather disclaimer.
- Profile-needs-update card appears only if required basics are missing and links to /my-profile.
- KFFA and KICT weather cards show raw METAR and decoded details, or clear failure diagnostics.
- Applicant-only users cannot access member dashboard.
- Logout behavior remains home redirect through the portal shell.
