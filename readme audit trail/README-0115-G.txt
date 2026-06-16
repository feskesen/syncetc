SyncEtc 0115-G — Organization Maintenance New Button Alignment Polish

Purpose
- Standardize the placement and style of New buttons across the organization maintenance modules.
- Keep New item actions in the module header row and use outline/accent styling.
- Reserve solid accent buttons for primary save/commit actions.

Files changed
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

Version strings
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-G
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-G

Functional changes
- Assets / Aircraft now uses the same header pattern as Asset Types and Spaces & Locations.
- New Aircraft moved to the top-right of the module header area.
- New Aircraft changed from solid primary to outline/accent secondary styling.
- The Assets / Aircraft list/editor area now sits under the shared module header, matching the other maintenance modules.
- Save buttons remain solid primary buttons in the bottom editor action row.

No SQL changes.
No Edge Function changes.
No Webflow embed changes.

Install
1. Upload these two files to GitHub:
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
   - assets/admin/ADMIN-PAGE-aircraft-admin-current.js
2. Do not run SQL.
3. Do not redeploy Supabase Edge Functions.
4. Do not change Webflow embeds.

First test URL
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=assets-aircraft

Expected
- New Aircraft appears in the same top-right header location as New Asset Type and New Location.
- New Aircraft is outline/white with the customer accent color, not solid green.
- Save Aircraft remains solid green at the bottom editor action row.
