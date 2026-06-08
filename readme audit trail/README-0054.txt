README-0054 — Organization People UX + Access Rules

Version: 2026-06-07-009-A
Package: organization_people_ux_access_rules_package_0054.zip

Purpose:
Consolidated Organization People / portal cleanup after testing packages 0048–0053.

Included changes:
- Portal header now carries login/logout and organization context controls.
- Organization selector is moved out of page hero/body where supported.
- User Dashboard, Organization Admin Dashboard, and Organization People use consistent portal header context.
- Organization Admin can assign/remove Organization Admin role.
- Organization Admin cannot assign/remove Organization Super Admin role.
- Last Organization Admin protection added.
- Last Organization Super Admin protection retained.
- Archive action closes selected person panel.
- Preferred first name, middle name/initial, suffix, and calculated display name supported.
- Affiliation start date, affiliation end date, and end reason supported through existing membership fields/settings.
- Organization styling remains inherited; no 150th-specific colors are hardcoded.

Files:
- supabase/functions/core-access-action/index.ts
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/user/USER-PAGE-dashboard-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-dashboard-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Install notes:
- No SQL migration is included.
- No Webflow embed change is required.
- Deploy Edge Function first, then upload GitHub files.

Test checklist:
- Header shows login/logout and organization selector.
- Hero does not duplicate login identity or organization selector.
- Organization People loads version 2026-06-07-009-A.
- Organization Admin can assign/remove Organization Admin role.
- Organization Admin cannot assign/remove Organization Super Admin role.
- Last Organization Admin cannot be removed.
- Last Organization Super Admin cannot be removed.
- Archive closes selected person panel.
- Archived filter and Restore still work.
- Preferred/middle/suffix fields calculate Display Name.
- Affiliation end date/reason work with ended statuses.
