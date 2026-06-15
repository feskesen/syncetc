# SyncEtc 0114-F — Organization Management Accordion Close + Search Focus Polish

Internal versions:
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-14-114-F
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-F
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-F

## Purpose
Focused UI behavior patch after 0114-E. This pass does not change SQL, Edge Functions, Webflow roots, access rules, or module business logic.

## Changes
1. Organization Management left navigation accordion behavior
   - Home remains visible/open.
   - Major sections may now all be closed.
   - Only one non-Home major section can be open at a time.
   - Clicking a closed major section opens it and closes the others.
   - Clicking the currently open major section closes it.
   - On initial page load, the active module's section still opens automatically.
   - On module navigation, the newly active module's section opens.

2. Spaces & Locations search focus
   - The debounced Spaces & Locations search now restores focus after filtering.
   - Cursor/selection position is preserved where possible.
   - Filtering still waits briefly after typing stops.

## Files changed
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

## Install
Upload the three changed JS files to GitHub using the stable production filenames above.

## Not required
- No SQL required.
- No Supabase Edge Function redeploy required.
- No Webflow embed change required.

## Suggested first test
Open:
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=assets-locations

Expected:
- Assets starts open because Spaces & Locations is active.
- Clicking Assets closes it, leaving only Home visible/open.
- Clicking People opens People and closes Assets.
- Typing in Search locations filters after a short pause and keeps focus in the input.
