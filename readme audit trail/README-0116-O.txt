SYNCETC / ONESOURCE AVIATION
0116-O — Qualifications Single Source Overhaul
Generated: 2026-06-16

Purpose
- Pivot Qualifications away from manual per-person mini-record creation.
- Make the Qualifications setup page the source of truth for what appears on each person profile.
- Replace duplicate visible qualification entry fields with one generated qualification form.

Install order
1. Run Supabase SQL:
   supabase/sql/0116-O-qualifications-single-source-overhaul.sql

2. Deploy Supabase Edge Function:
   supabase/functions/core-access-action/index.ts

3. Upload GitHub asset files:
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-O
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-O
- core-access-action/index.ts: 2026-06-16-116-O

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt
- supabase/sql/0116-O-qualifications-single-source-overhaul.sql

Summary of changes
- Renames the People nav item to Qualifications.
- Qualifications setup now controls how each qualification appears on a person profile.
- Adds profile field style settings: checkbox, checkbox + expiration, completion + expiration, class/option + expiration, status + expiration, notes.
- Adds profile option values for class/dropdown-style qualifications, such as medical class.
- Adds common qualification fields for IFR Rated and Organization Checkout.
- Backfills existing fixed aviation profile values into core_person_qualification_assignments where no active assignment exists.
- Members / People > Aviation / Qualifications now shows one generated qualification form from the active definitions.
- Removes the visible duplicate fixed qualification fields from the Aviation / Qualifications tab.
- Keeps general flight profile fields separate from qualification fields.
- Keeps the assignment table as the single operational source for per-person qualification values.

Not included
- No document upload for qualification proof.
- No automated reminders or expiration notifications.
- No dispatch/reservation enforcement.
- No aircraft-specific checkout enforcement.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.
