SyncEtc 0115-D — Asset Types / Spaces & Locations Status Filter Consistency
Date: 2026-06-15

Purpose
- Make Asset Types and Spaces & Locations behave consistently as organization-maintenance modules.
- Default both left-list status filters to All.
- Add the same All / Active / Inactive / Archived status filter to Spaces & Locations.
- Prevent archive/unarchive/save behavior from forcing the user into Archived view.

Changed Files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

Version Strings
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-D
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-D

Install
1. Upload the two changed JS assets to GitHub in the same paths.
2. No SQL is required.
3. No Supabase Edge Function redeploy is required.
4. No Webflow embed change is required.

Expected Behavior
- Asset Types opens with the status filter set to All.
- Spaces & Locations opens with the status filter set to All.
- Spaces & Locations has the same status filter pattern as Asset Types.
- Archived rows remain gray/muted and sorted below active/inactive rows.
- Saving an archived/unarchived Asset Type or Location does not jump the left list to Archived-only view.
- Search, drag/drop, arrow sort, archive cues, and saved/unsaved inline status remain intact.

Notes
- This is a UI behavior polish pass only.
- No schema, RLS, Edge Function, or Webflow shell behavior was changed.
