SYNCETC 0116-T — Aircraft Checkout UX Polish + Bulk Apply
Date: 2026-06-16

Purpose
- Make person-to-aircraft checkout tracking easier and clearer.
- Support both common club models:
  1. checked out once, valid until removed/revoked;
  2. checked out until a renewal/current-through date.
- Add a bulk update workflow so admins do not have to edit many aircraft rows one at a time.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Expected versions
- Organization Management: 2026-06-16-116-T
- People Workbench: 2026-06-16-116-T

Install
1. Upload these files to GitHub, preserving the same production paths:
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
2. No SQL migration is required.
3. No Supabase Edge Function deploy is required.
4. No Webflow embed change is required.

What changed
- Aircraft checkout status wording now uses customer-facing language:
  - Not checked out
  - Checked out
  - Pending
  - Suspended / revoked
  - Expired
  - Waived
- Blank expiration/current-through date on a checked-out aircraft now represents “No expiration.”
- Added a No expiration checkbox per aircraft checkout row.
- Added a Bulk update workflow in Members / People → Aviation / Qualifications → Aircraft checkouts.
- Bulk update supports selecting multiple aircraft, applying checkout status, completed date, expiration/no-expiration behavior, and optional notes.
- Expired dated checkouts can show an inline row warning.
- Bulk selection controls are UI-only and should not mark the person record dirty until Apply is clicked.
- Existing source of truth remains core_person_asset_checkouts.

What this does not do
- Does not add asset-side Qualified Pilots view yet.
- Does not enforce reservation blocking yet.
- Does not change database schema.
- Does not change Edge Function code.

First test
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members

Test steps
1. Select a person.
2. Open Aviation / Qualifications.
3. Find Aircraft checkouts.
4. Confirm status says Checked out rather than Approved.
5. Mark one aircraft Checked out with No expiration, save, reload, and confirm it persists.
6. Mark one aircraft Checked out with a valid-until date, save, reload, and confirm it persists.
7. Use Bulk update to select multiple aircraft and apply Checked out + No expiration.
8. Save, reload, and confirm the selected aircraft retain the applied checkout values.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
