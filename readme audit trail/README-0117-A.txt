SYNCETC 0117-A — Asset Qualification Requirements + Qualified Pilots Foundation

Purpose
- Connect the People qualification/check-out groundwork to the aircraft record side.
- Let organization admins define which qualifications/checkouts are required for a specific aircraft.
- Show a reverse aircraft-side view of pilots who are already authorized for that aircraft from the same person-aircraft checkout source of truth.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt
- supabase/sql/0117-A-asset-qualification-requirements.sql

Expected versions
- Organization Management: 2026-06-17-117-A
- Aircraft Admin: 2026-06-17-117-A
- core-access-action: 2026-06-17-117-A

Install order
1. Run supabase/sql/0117-A-asset-qualification-requirements.sql in Supabase SQL Editor.
2. Deploy supabase/functions/core-access-action/index.ts.
3. Upload the GitHub asset files.

What changed
- Added a new aircraft-side tab: Requirements / Qualified Pilots.
- Added a new table: core_asset_qualification_requirements.
- Aircraft records can now select required qualifications/checkouts for that aircraft.
- Aircraft records can now mark whether a specific aircraft checkout is required.
- Aircraft records show qualified pilots already recorded from Members / People → Aviation / Qualifications → Aircraft checkouts.
- Qualified pilot data remains sourced from core_person_asset_checkouts.
- No reservation enforcement/blocking is added yet.
- No Webflow embed changes.

First tests
- Open /organization-management?syncetc_debug=1&module=assets-aircraft.
- Select an aircraft.
- Open Requirements / Qualified Pilots.
- Select one or more required qualifications and save the aircraft.
- Reload and confirm selections persist.
- Confirm qualified pilots appear if that aircraft was authorized on a person record.

Validation
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for Aircraft Admin.
- Edge Function TypeScript transpile/parse check passed.
