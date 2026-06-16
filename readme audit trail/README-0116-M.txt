SYNCETC 0116-M — Qualifications & Checkouts Definitions
=========================================================

Date: 2026-06-16
Package: SYNCETC-0116-M-qualifications-checkouts-definitions.zip

Purpose
-------
Adds the People → Instructors / Qualifications module as an active Organization Management module. The first pass defines the organization's qualification/check-out vocabulary. It does not yet assign qualifications to individual people.

Install / deploy order
----------------------
1. Run the SQL migration in Supabase SQL Editor:
   supabase/sql/0116-M-qualification-definitions.sql

2. Deploy the Supabase Edge Function:
   supabase/functions/core-access-action/index.ts

3. Upload these GitHub Pages assets:
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Expected versions
-----------------
CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-M
CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-M
core-access-action/index.ts: 2026-06-16-116-M

Files changed
-------------
assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
supabase/functions/core-access-action/index.ts
supabase/functions/core-access-action/index.ts.txt
supabase/sql/0116-M-qualification-definitions.sql

What changed
------------
- Activated People → Instructors / Qualifications in Organization Management.
- Added Qualifications & Checkouts as a definition module using the established maintenance pattern:
  - left list/search/filter/reorder;
  - drag handle and separated up/down controls;
  - right editor;
  - top-right outline New button;
  - Active/Inactive status only;
  - Archive/Restore only in the bottom action row;
  - no visible keys/slugs/system identifiers in normal UI.
- Added a new organization-level table for qualification/check-out definitions:
  core_organization_qualification_definitions.
- Added seeded starter qualification definitions for each organization, including CFI, CFII, medical certificate, flight review, IFR checkout, night checkout, and aircraft checkouts.
- Added Edge Function actions for listing/saving/archive/restore/reorder of qualification definitions.
- Existing Members / People, Groups / Roles, Permissions, Lifecycle Statuses, Membership Classes, and Application / Onboarding Stages remain unchanged.

What this does not do yet
-------------------------
- Does not assign qualifications to people.
- Does not track expiration dates on a person.
- Does not upload documents for a person's qualification.
- Does not apply qualification rules to reservations, checkouts, or dispatch.

First test URLs
---------------
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-instructors

Regression tests
----------------
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-groups
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-permissions
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-lifecycle-statuses
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-membership-classes
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-stages

Validation performed
--------------------
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.
