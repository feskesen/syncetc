SYNCETC 0116-R — Qualification Reservation Readiness

Package purpose
- Adds a simple, customer-facing reservation readiness layer to the qualification system.
- Keeps Qualifications as the single operational source for person qualification values.
- Cleans up the remaining non-uniform qualification display details.

Install/deploy order
1. Run SQL:
   supabase/sql/0116-R-qualification-reservation-readiness.sql

2. Deploy Edge Function:
   supabase/functions/core-access-action/index.ts

3. Upload GitHub asset files:
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-R
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-R
- core-access-action/index.ts: 2026-06-16-116-R

Changed behavior
- Qualification name and description render as compact separate lines in the person qualification grid.
- Removed the visible qualification field count from the normal person profile UI.
- Added a customer-facing Required for general reservations setting to qualification definitions.
- Added a Reservation readiness summary to Members / People > Aviation / Qualifications.
- Medical Certificate and Flight Review are marked as general reservation requirements by the SQL migration.
- Required rows can show a compact Required to reserve badge.
- The readiness summary flags missing or expired required qualification items.
- This package does not block reservations yet and does not add asset-specific checkout rules yet.

No Webflow embed changes.
No document upload changes.
No reservation module enforcement yet.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.
