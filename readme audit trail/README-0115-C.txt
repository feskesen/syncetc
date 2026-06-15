# SyncEtc 0115-C — Asset Type / Location List Layout and Archive Cues

Date: 2026-06-15

## Purpose
Polish the left list pattern used by Asset Types and Spaces & Locations so it is reusable for future Organization Management maintenance screens.

## Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

## Version strings
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-C
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-C

## What changed
- Asset Type list rows now keep text, status badge, drag handle, and arrow controls within their own list column.
- Asset Type status badges now sit under the row text instead of being squeezed to the right.
- The order hint now wraps inside the list column.
- Row controls have a fixed narrow right-side control column.
- Archived Asset Type rows remain muted/gray and stay at the bottom.
- Spaces & Locations now gets the same archived/inactive visual cues.
- Archived Spaces & Locations rows are muted/gray and sorted to the bottom.
- Archived Spaces & Locations are not manually reorderable while archived.
- When a location is saved as archived, the client sends sort_order 999.

## Not changed
- No SQL.
- No Edge Function changes.
- No Webflow embed changes.
- No new business modules.

## Testing
1. Open `/organization-management?syncetc_debug=1&module=assets-types`.
2. Confirm the left list text/status badges stay inside the list column.
3. Confirm archived rows are gray/muted and stay at the bottom.
4. Open `/organization-management?syncetc_debug=1&module=assets-locations`.
5. Change one location status to Archived and save.
6. Confirm it moves to the bottom, is visually muted, and its row controls are disabled.
