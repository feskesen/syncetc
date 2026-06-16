SYNCETC / OneSource Aviation
Package: 0116-G — Groups / Roles Foundation + Access Nav Cleanup
Date: 2026-06-16

PURPOSE

This package continues the Organization Management People workbench work by replacing the confusing Administrators & Access lens with a cleaner People workflow and activating the Groups / Roles definition module.

EXPECTED VERSIONS

- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-G
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-G
- supabase/functions/core-access-action/index.ts: 2026-06-16-116-G

FILES CHANGED

- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt

INSTALL ORDER

1. Deploy the Supabase Edge Function:
   supabase/functions/core-access-action/index.ts

2. Upload GitHub asset files:
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

3. No SQL migration is included.
4. No Webflow embed changes are required.

SUMMARY OF CHANGES

Organization Management

- Hid Administrators & Access from the active People navigation.
- Preserved the safety behavior added in 0116-F, but moved normal access management back to Members / People → Access & Roles.
- Manual/legacy links to module=people-admins now resolve to Members / People with the Access & Roles tab selected.
- Added active People → Groups / Roles module.
- Groups / Roles uses the People Workbench embed instead of a separate page/database.

People Workbench

- Added Groups / Roles as a real definition module.
- Follows the existing maintenance pattern used by Lifecycle Statuses, Membership Classes, and Application / Onboarding Stages:
  - left list/search/filter/reorder;
  - visible drag handle;
  - up/down row controls;
  - right editor;
  - top-right outline New button;
  - bottom Save/Reset/Archive action row;
  - status field only Active / Inactive;
  - archive/restore only through the bottom action row;
  - no visible key/slug/system fields in normal UI.
- Protected system roles are shown but cannot be archived or made inactive from this module.
- Access assignment remains in Members / People → Access & Roles.
- No separate administrator table or people database was added.

Edge Function

- Added organization-admin actions for role/group definitions:
  - organization_save_role_definition
  - organization_archive_role_definition
  - organization_restore_role_definition
  - organization_reorder_role_definitions
- Response payload includes updated lifecycle statuses, membership classes, application stages, and groups/roles lists.
- Protected/system role safeguards remain in place.

VALIDATION PERFORMED

- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.

FIRST TESTS

- /organization-management?syncetc_debug=1&module=people-groups
- /organization-management?syncetc_debug=1&module=people-members
- /organization-management?syncetc_debug=1&module=people-admins

EXPECTED RESULTS

- Groups / Roles opens as an active People module.
- Administrators & Access no longer appears as a separate nav item.
- Direct module=people-admins routes to Members / People with Access & Roles selected.
- Members / People still works.
- Lifecycle Statuses, Membership Classes, and Application / Onboarding Stages still work.
- Debug mode shows version 2026-06-16-116-G.
