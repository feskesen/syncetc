# README-0115-B — Asset Types Status / Archive / UI Polish

Internal versions:
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-B
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-B
- core-access-action: 2026-06-15-115-B

Purpose:
Polish the Organization Management > Assets > Asset Types module so it behaves like a customer-facing maintenance screen rather than exposing internal classification/database concepts.

Changed files:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt

Install:
1. Upload GitHub assets:
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
   - assets/admin/ADMIN-PAGE-aircraft-admin-current.js

2. Redeploy Supabase Edge Function:
   - core-access-action

Do not run SQL.
Do not redeploy:
- core-public-render
- core-admin-action

What changed:
- Removed the visible Category dropdown from the Asset Types editor.
- Asset Types now behaves as simple classifications: name, plural label, description, status, notes.
- Added a status filter for the asset type list: Active, Inactive, Archived, All.
- Default list filter is Active.
- Asset Type rows now have clearer visual status cues.
- Archived asset types are muted/gray with an Archived badge.
- Inactive asset types get a distinct inactive cue.
- Archived asset types sort to the bottom and are not manually reordered.
- Archiving an asset type sets its sort_order to 999 in the backend.
- Restoring an asset type makes it active again; it can then be moved/reordered.
- Backend now always returns asset types including archived records so the Archived filter works without relying on the aircraft Include Archived checkbox.

Notes:
- No rates, meters, maintenance, reservations, scheduler rules, or billing behavior were added.
- Category remains an internal compatibility field, defaulting safely behind the scenes.
