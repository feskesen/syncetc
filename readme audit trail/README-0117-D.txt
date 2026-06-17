SYNCETC 0117-D — Aircraft UI Baseline Cleanup
Date: 2026-06-17

Purpose
- Clean up the aircraft/person checkout/reservation preview separation after 0117-C.
- Remove normal-customer raw URL media fields from aircraft media UI.
- Provide a compatibility loader for the older standalone aircraft admin script path so it loads the current aircraft workbench module instead of drifting independently.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-17-117-D
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-17-117-D
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-17-117-D
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-17-117-D compatibility loader

Summary of changes
- Members / People → Aviation / Qualifications → Aircraft checkouts now stays focused on aircraft checkout only: Authorized, Completed / approved, Valid until, Notes.
- Overall reservation readiness is kept separate as a distinct Reservation preview section.
- Aircraft checkout rows no longer show missing Medical, Flight Review, High Performance, Complex, or other general qualification warnings inside the aircraft checkout row.
- Aircraft media tab no longer shows raw image URL fields.
- Aircraft media tab now shows compact image-selection cards with current preview, media-library selection placeholder, and clear buttons.
- Existing stored media URLs are preserved silently in the draft/payload but are not shown as editable URL text fields.
- Aircraft-side Qualified Pilots heading is simplified; readiness remains visible but is described separately from aircraft checkout assignment.
- Older admin aircraft script path now acts as a compatibility loader for the current customer-admin aircraft module.

SQL changes
- None.

Edge Function changes
- None.

Webflow embed changes
- None expected.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for Aircraft Admin.
- JavaScript syntax check passed for People Workbench.
- JavaScript syntax check passed for the standalone aircraft compatibility loader.

First test
1. Open: /organization-management?syncetc_debug=1&module=people-members
2. Select a person and open Aviation / Qualifications.
3. Confirm Aircraft checkouts only shows aircraft checkout fields and no longer lists missing Medical/Flight Review/etc. in the checkout row.
4. Confirm Reservation preview is a separate section.
5. Open: /organization-management?syncetc_debug=1&module=assets-aircraft
6. Open Media / Notes and confirm there are no image URL entry fields.
7. Open Requirements / Qualified Pilots and confirm the Qualified Pilots section still renders.
