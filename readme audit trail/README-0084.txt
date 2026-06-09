SyncEtc Website Rebuild — README-0084
Package: Contact Tracker Supabase Loader Patch
Date: 2026-06-08

Purpose:
Fixes an initialization race on the new Contact Tracker page. The page-specific Contact Tracker JS could see an existing Supabase script tag inserted by the portal shell and assume Supabase was ready, then immediately call window.supabase.createClient before the CDN script finished loading.

Symptom fixed:
- /contact-tracker?syncetc_debug=1 showed:
  "Unable to load Contact Tracker. Cannot read properties of undefined (reading 'createClient')"
- Diagnostics showed Contact Tracker failed at ~5ms while the portal shell was still loading Supabase.

Files changed:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-contact-tracker-current.js

Internal version:
- Contact Tracker page JS: 2026-06-08-083-B

Implementation notes:
- Adds robust script detection/waiting for the Supabase CDN script.
- If the portal shell has already inserted the Supabase script but it is still loading, Contact Tracker now waits for load/createClient instead of continuing immediately.
- Adds diagnostics markers around ensureSupabase and script loading.

No changes:
- No SQL changes.
- No Edge Function changes.
- No Webflow embed changes.
- No shared header changes.

Testing:
1. Upload the changed JS file to GitHub Pages.
2. Hard refresh:
   https://syncetc.webflow.io/contact-tracker?syncetc_debug=1
3. Confirm Contact Tracker loads with an active session and selected organization.
4. Confirm the admin header badge still appears on admin pages.
5. Confirm existing portal pages still load:
   https://syncetc.webflow.io/user-dashboard?syncetc_debug=1
   https://syncetc.webflow.io/organization-people?syncetc_debug=1
