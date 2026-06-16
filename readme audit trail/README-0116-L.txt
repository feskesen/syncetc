SYNCETC PACKAGE 0116-L
People Permissions / Capabilities Foundation
Generated: 2026-06-16

PURPOSE
This package adds a customer-admin Permissions / Capabilities module under Organization Management > People.
It makes Groups / Roles meaningful by letting authorized organization administrators review and edit the safe capabilities granted by customer-defined roles and groups.

INSTALL / DEPLOY ORDER
1. Deploy Supabase Edge Function:
   supabase/functions/core-access-action/index.ts

2. Upload GitHub asset files:
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

EXPECTED VERSIONS
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-L
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-L
- core-access-action/index.ts: 2026-06-16-116-L

CHANGED FILES
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt

WHAT CHANGED
- Added active People > Permissions module in Organization Management.
- Added a role/capability workbench with:
  - left role/group list;
  - search;
  - selected role editor;
  - grouped capability checklist;
  - bottom Save / Reset action row.
- Permissions use customer-facing capability labels, not raw database/system fields.
- Protected built-in roles cannot be edited from this screen.
- High-risk administrator capabilities are shown as protected and cannot be newly assigned from this module.
- Custom role/group permissions can be edited by authorized administrators.
- Existing Groups / Roles and Members / People role assignment behavior remains unchanged.
- No SQL migration.
- No Webflow embed changes.

SECURITY NOTES
- The Edge Function requires organization access management authority before saving role capabilities.
- Built-in roles such as Organization Admin, Organization Super Admin, and Member are protected from this module.
- Protected administrator capabilities cannot be newly added through this module.
- Existing protected capabilities on a role are preserved rather than silently removed.

FIRST TESTS
1. Open:
   https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-permissions

2. Confirm:
   - People > Permissions appears in the left nav.
   - Roles/groups appear on the left.
   - Selecting a role shows grouped capabilities on the right.
   - Built-in protected roles are view-only.
   - Custom roles can save safe capability changes.
   - Debug mode shows 2026-06-16-116-L.

REGRESSION TESTS
- People > Groups / Roles:
  https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-groups

- People > Members / People:
  https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members

- People > Lifecycle Statuses:
  https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-lifecycle-statuses

- People > Membership Classes:
  https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-membership-classes

- People > Application / Onboarding Stages:
  https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-stages

VALIDATION
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.
