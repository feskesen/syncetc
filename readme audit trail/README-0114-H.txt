SyncEtc 0114-H — Organization Management Final Header/Save-State Polish

Purpose
- Finish the small Organization Management polish items before moving down the remaining management pages one at a time.
- Remove normal-page build/version and duplicate organization-name chrome.
- Move save/unsaved/saved feedback into the editing workflow row instead of showing it as top page chrome.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

Versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-14-114-H
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-H
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-H

Install
1. Upload the three JS files to the matching GitHub paths.
2. No SQL is required.
3. No Supabase Edge Function redeploy is required.
4. No Webflow embed change is required.

What changed
- Removed the duplicate organization name under the Organization Management label.
- Removed the visible version/build chip from the normal Organization Management header.
- Kept version information available in debug diagnostics only.
- Removed the top embedded Saved/Unsaved Changes badge from the aircraft/location module.
- Removed the visible top green save-success/status bar.
- Added the Saved/Unsaved Changes badge and save/status message into the bottom action row near the Save button.
- The save message now appears inline with the Save button row and should not cause the screen to hop.

First test
- Open /organization-management?syncetc_debug=1&module=assets-locations.
- Confirm the top left says Organization Management without repeating the club name below it.
- Confirm no version chip appears in the normal top row.
- Edit a location field.
- Confirm Unsaved changes appears in the bottom action row near Save Location.
- Save the location.
- Confirm the save message appears in that bottom row and no green status bar appears above the form.
