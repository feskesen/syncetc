README-0066-C

Package: Shared Header Public Shell Patch
Version: 2026-06-07-021-C

Purpose:
- Patch PUBLIC-COMPONENT-site-shell-current.js to call the shared organization header engine.
- Continue incremental migration toward one organization header.

Files to upload:
- assets/public/PUBLIC-COMPONENT-site-shell-current.js

No SQL. No Edge Function deploy. No Webflow embed change.

Expected tests:
- Public pages still load.
- Public pages use SyncEtcOrganizationHeader.
- Logged-in users/admins should see additional rows on public pages.
- Home appears first.

Notes:
- Blue flash is not addressed in this patch.
