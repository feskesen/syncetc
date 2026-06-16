SyncEtc 0115-F — Organization Maintenance Action Row / Sausage Text Polish
Date: 2026-06-15

Purpose
- Standardize action-row placement across the Organization Management maintenance modules.
- Remove normal-UI internal/implementation text from Assets / Aircraft.
- Keep this as a focused UI polish pass: no SQL, no Edge Function, no Webflow changes.

Files changed
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

Versions
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-F
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-F

Changes
1. Assets / Aircraft
- Removed normal UI “X shown” count from the list header.
- Removed normal UI “Generated slug/SKU” text from the editor header.
- Moved Saved/Unsaved, Reset, Archive/Restore, and Save Aircraft into the bottom editor action row.
- Renamed Clear to Reset.
- Kept New Aircraft at the top of the left list panel.

2. Asset Types
- Kept New Asset Type at the top of the left list panel.
- Kept Saved/Unsaved, Reset, Archive/Restore, and Save Asset Type in the bottom editor action row.
- Renamed Clear to Reset.
- Reset now restores the selected asset type draft instead of jumping to a new blank asset type.

3. Spaces & Locations
- Kept New Location at the top of the left list panel.
- Added Reset and Archive/Restore to the bottom editor action row.
- Kept Saved/Unsaved and Save Location in that same bottom action row.
- Reset restores the selected location draft or clears a new unsaved draft.
- Archive/Restore updates the location status and saves through the existing location save flow.

Install
1. Upload the two files above to GitHub.
2. Do not run SQL.
3. Do not redeploy Edge Functions.
4. Do not change Webflow embeds.

Testing
- Open /organization-management?syncetc_debug=1&module=assets-aircraft
  Confirm action buttons are at the bottom of the editor and “Generated slug/SKU” is gone.
- Open /organization-management?syncetc_debug=1&module=assets-types
  Confirm New button remains top-left and action row is bottom-aligned.
- Open /organization-management?syncetc_debug=1&module=assets-locations
  Confirm Reset, Archive/Restore, Saved/Unsaved, and Save Location are all in the bottom action row.

Notes
- The duplicate test asset named “12345” was intentionally not removed in this UI pass. Handle that later in a data cleanup / SQL pass.
