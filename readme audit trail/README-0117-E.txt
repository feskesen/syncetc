SYNCETC 0117-E — Aircraft Baseline Cleanup
Date: 2026-06-17

Purpose
- Clarify the aircraft module as an aircraft setup/profile area rather than daily operational tracking.
- Remove fake/non-working media library controls from normal aircraft UI.
- Keep media free of raw URL entry fields.
- Provide a deliberate SQL cleanup for the archived duplicate/test 12345 aircraft record.
- Keep the old standalone aircraft admin script as a compatibility loader targeting the current customer-admin aircraft module.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js
- supabase/sql/0117-E-archive-duplicate-test-aircraft-12345.sql

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-17-117-E
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-17-117-E
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-17-117-E compatibility loader
- PEOPLE module is not changed by this package and remains expected at 2026-06-17-117-D in Organization Management.

Summary of changes
- Renamed the active Assets module label in Organization Management from Assets / Aircraft to Aircraft Setup.
- Aircraft module header now reads Aircraft Setup / Profile.
- Aircraft module helper copy now describes stable profile, visibility, status, requirements, rates, images, and reference notes.
- Media / Notes tab is now Profile Images / Notes.
- Maintenance Setup tab is now Maintenance Settings.
- Removed the fake disabled Choose from media library buttons from normal UI.
- Aircraft media cards now only show existing image previews, no-image state, and Clear image when there is an existing image to clear.
- No raw URL entry fields were added.
- Notes wording now separates profile/reference notes from maintenance history, squawks, and logs.
- Rates/usage wording is cleaner and no longer describes the screen as groundwork/prototype text.
- Standalone admin aircraft compatibility loader now targets the 117-E aircraft module.
- SQL deletes only archived duplicate/test 12345 aircraft records for the current test organization and leaves active 12345 records untouched.

SQL changes
- Run supabase/sql/0117-E-archive-duplicate-test-aircraft-12345.sql in Supabase SQL Editor.
- This SQL hard-deletes archived duplicate/test aircraft records named exactly 12345 in organization e8e61324-8961-414a-97a2-83f5eba96490.
- It also removes dependent rows from known related checkout/requirement/rate/detail tables when those tables exist.
- It does not delete active aircraft.

Edge Function changes
- None.

Webflow embed changes
- None expected.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for Aircraft Admin.
- JavaScript syntax check passed for the standalone aircraft compatibility loader.

First test
1. Run the SQL cleanup file.
2. Open: /organization-management?syncetc_debug=1&module=assets-aircraft
3. Confirm the nav/module header uses Aircraft Setup / Profile language.
4. Confirm the archived duplicate/test 12345 aircraft is gone after reload.
5. Open Profile Images / Notes and confirm there are no URL fields and no fake Choose from media library button.
6. Confirm existing image previews still show if an image was already stored, and Clear image only appears when there is an existing image.
7. Open Maintenance Settings and confirm the notes are clearly setup/reference fields, not maintenance history.
