SyncEtc Website Rebuild — README-0110-C
Package: Member Dashboard Polish / Routing / Event Cleanup
Internal version: 2026-06-13-110-C

PURPOSE
This is a focused polish pass on the 0110-A/B member dashboard foundation.
It does not change database schema.

CHANGED FILES
- assets/member/MEMBER-PAGE-dashboard-current.js
- assets/user/USER-PAGE-dashboard-current.js
- assets/auth/AUTH-PAGE-login-current.js
- supabase/functions/core-access-action/index.ts

INSTALL
1. Upload these GitHub assets:
   - assets/member/MEMBER-PAGE-dashboard-current.js
   - assets/user/USER-PAGE-dashboard-current.js
   - assets/auth/AUTH-PAGE-login-current.js

2. Redeploy Supabase Edge Function:
   - core-access-action

DO NOT RUN SQL.
DO NOT redeploy:
- core-public-render
- core-admin-action

WHAT CHANGED
- Login default destination now points to /user-dashboard instead of /member/dashboard.
- Member dashboard profile-needs-update no longer lists Pilot certificate, because that is not currently member-editable in /my-profile.
- Next Club Event card no longer displays raw event summary/detail text such as stray values like "1".
- Next Club Event card now uses event image/icon if available.
- Next Club Event card uses event accent color if available for a stronger visual treatment.
- Weather cards no longer show member-facing cache/programmer language such as "fresh cache".
- Weather cards only show stale/fetch-failure language when there is a real warning.
- If live weather refresh fails but a prior METAR is available, the member-facing warning says:
  "Unable to reach the weather source. Showing the latest available METAR from [local time] / [Zulu]."
- Detailed refresh errors are retained only in debug mode.

TEST ONE STEP AT A TIME
Step 1:
Open https://syncetc.webflow.io/user-dashboard?syncetc_debug=1
Confirm the dashboard loads and the version shows 2026-06-13-110-C.

Step 2:
Check Next Club Event only:
- no stray "1" or raw detail text
- title/date/time/location show cleanly
- image/icon appears if the event has one
- Open Full Calendar works

Step 3:
Check Profile Needs Update only:
- Pilot certificate should no longer appear as a required member-fixable item
- if profile needs update appears, Go to My Profile opens /my-profile

Step 4:
Check Weather only:
- no "fresh cache" wording appears
- raw METAR appears
- altimeter remains inHg
- remarks appear when present
- disclaimer appears

Step 5:
Log out, then log in through /login.
Expected default post-login destination: /user-dashboard.

NOTES
Dashboard quick links are still foundation placeholders and should eventually become organization-configurable dashboard links.
Weather airport list remains KFFA/KICT test defaults until dashboard/site settings are built.
