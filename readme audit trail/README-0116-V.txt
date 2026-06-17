SYNCETC PACKAGE 0116-V — Checkout Save Fix + Qualification Alerts
Generated: 2026-06-16

Purpose
- Fix aircraft checkout save failure caused by selecting a non-existent asset_id column from module_aircraft_admin_v1.
- Make bulk aircraft checkout updates save immediately after Apply.
- Add required-qualification attention indicators to the People list and selected person header.
- Add an Advanced filter for required qualification status.

Files changed
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-V
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-V
- core-access-action/index.ts: 2026-06-16-116-V

Behavior changes
- Bulk update under Aircraft checkouts now applies the selected values and calls Save immediately.
- The bulk panel closes after a successful save.
- Required qualification issues now appear as alert pills on person cards and in the selected person header.
- Advanced filters now include qualification status:
  - Any required qualification status
  - Qualifications need attention
  - Expired qualifications
  - Missing required qualifications
  - Qualifications current
- The qualification row warnings remain in Aviation / Qualifications.

Backend fix
- replacePersonAssetCheckouts no longer requests the non-existent asset_id column from module_aircraft_admin_v1.
- No SQL migration is included.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed via esbuild.
- index.ts and index.ts.txt match.

First tests
1. Deploy supabase/functions/core-access-action/index.ts.
2. Upload the two GitHub asset files.
3. Open:
   https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members
4. Select a person and open Aviation / Qualifications.
5. Use Aircraft checkouts → Bulk update, select one or more aircraft, apply values, and confirm the bulk panel saves/closes without the asset_id error.
6. Clear or expire a required qualification and confirm the person card shows a qualification alert pill.
7. Use Advanced filters → Qualifications to filter people with missing/expired required qualifications.

No Webflow embed changes.
No SQL changes.
