# 0110-B Member Dashboard METAR Cache / Refresh Foundation

Internal version: 2026-06-13-110-B

Purpose
- Add a latest-successful METAR cache table keyed by organization_id + station_id.
- Keep KFFA and KICT as seeded/default test-customer weather stations.
- Member dashboard now reads cached/latest METAR data through core-access-action.
- If cached data is older than 15 minutes, core-access-action attempts a live AviationWeather.gov refresh and stores the latest success.
- If live refresh fails, dashboard shows the latest successful stored METAR with a visible warning and error detail.
- Add a scheduled refresh action and optional hourly Supabase Cron template.
- Leave CheckWX as a future backup provider hook only. No API key is hard-coded.

Changed files
- assets/member/MEMBER-PAGE-dashboard-current.js
- assets/user/USER-PAGE-dashboard-current.js
- supabase/functions/core-access-action/index.ts
- supabase/sql/0110-B-member-dashboard-metar-cache.sql
- supabase/sql/0110-B-optional-hourly-metar-cron-template.sql

Install order
1. Run required SQL:
   supabase/sql/0110-B-member-dashboard-metar-cache.sql

2. Upload GitHub assets:
   assets/member/MEMBER-PAGE-dashboard-current.js
   assets/user/USER-PAGE-dashboard-current.js

3. Redeploy Supabase Edge Function:
   core-access-action

Do not redeploy
- core-public-render
- core-admin-action

Optional cron setup
- The required SQL does not schedule hourly refresh by itself.
- To schedule hourly refresh later, first set an Edge Function secret named SYNCETC_CRON_SECRET.
- Then edit and run:
  supabase/sql/0110-B-optional-hourly-metar-cron-template.sql
- Replace <PROJECT_REF>, <SUPABASE_ANON_KEY>, and <SYNCETC_CRON_SECRET> before running.

Expected versions
- MEMBER-PAGE-dashboard-current.js: 2026-06-13-110-B
- USER-PAGE-dashboard-current.js: 2026-06-13-110-B
- core-access-action: 2026-06-13-110-B

Behavior
- The table stores only the latest successful METAR per organization/station.
- No historical weather archive is created.
- Dashboard uses data less than 15 minutes old without fetching.
- Dashboard attempts live refresh if data is older than 15 minutes or missing.
- If live fetch fails and a prior successful record exists, the member sees the prior METAR plus a warning.
- If live fetch fails and no prior successful record exists, the weather card shows a hard visible failure diagnostic.

METAR display changes
- Altimeter display uses U.S. inches of mercury, for example 29.84 inHg.
- Remarks after RMK are shown as a readable detail line when present.
- Disclaimer text uses Frank-approved language:
  Weather Disclaimer: METAR and flight category data are provided as a member convenience only. This is not a substitute for an official weather briefing. Always confirm conditions through official channels such as Flight Service (1-800-WX-BRIEF), the FAA Weather Briefing Portal, or another FAA-approved source before flight.

Test URLs
- https://syncetc.webflow.io/member/dashboard?syncetc_debug=1
- https://syncetc.webflow.io/user-dashboard?syncetc_debug=1

Test checklist
1. Dashboard loads for member/org admin.
2. KFFA and KICT weather cards show either fresh cached data, live refreshed data, or a clear visible failure.
3. Altimeter is in inHg, not hPa.
4. Remarks line appears when the raw METAR contains RMK.
5. Refresh the dashboard within 15 minutes and confirm it uses cache/fresh cache instead of showing a failure.
6. If AviationWeather.gov fails later, the page still loads and shows last successful METAR with a warning.
