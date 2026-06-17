SYNCETC 0116-U — Aircraft Checkout Simplification

Purpose
- Simplify aircraft checkout tracking so it matches the real club workflow: authorized yes/no, optional completed/approved date, optional valid-until date, and notes.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-U
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-U

What changed
- Replaced the Aircraft Checkouts status dropdown with a simple Authorized checkbox.
- Removed visible choices such as Not checked out, Pending, Suspended/revoked, Expired, and Waived from the normal UI.
- Treats blank Valid until as no expiration / valid until removed.
- Treats past Valid until as expired automatically and shows an alert on that row.
- Added small info buttons for Authorized and Valid until.
- Simplified Bulk update to Authorized, Completed/approved, Valid until, and Notes.
- Kept the existing source of truth: core_person_asset_checkouts.

No changes
- No SQL migration.
- No Edge Function change.
- No Webflow embed change.

First test
- Open /organization-management?syncetc_debug=1&module=people-members
- Select a person, open Aviation / Qualifications, and test Aircraft checkouts.
- Authorize one aircraft with no valid-until date, save, reload, and confirm it persists.
- Authorize one aircraft with a valid-until date, save, reload, and confirm it persists.
- Use Bulk update to apply Authorized to multiple aircraft.
