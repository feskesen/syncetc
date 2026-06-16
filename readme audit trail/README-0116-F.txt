SYNCETC PACKAGE 0116-F — ADMINISTRATORS & ACCESS LENS
Generated: 2026-06-16

Purpose
- Activate and polish People → Administrators & Access as an access-focused lens over the existing People workbench.
- Keep one unified people/membership data model. No separate administrators table/database.
- Add UI safeguards and backend self-lockout protections around administrator access.

Files changed
1. assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   - Internal version: 2026-06-16-116-F
   - Updates expected People Workbench version to 2026-06-16-116-F.
   - Routes People → Administrators & Access to the People module with:
     - initial filter: admins-access
     - initial tab: access
     - initial lens: admin-access

2. assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
   - Internal version: 2026-06-16-116-F
   - Adds the Administrators & Access lens.
   - Defaults the lens to access-focused filters and the Access & Roles tab.
   - Adds access summary cards for login state, access level, and role summary.
   - Keeps invite and password reset actions in the Access & Roles tab.
   - Adds frontend warnings/guards for Organization Admin and Organization Super Admin role changes.
   - Blocks attempts to remove your own organization admin access from the page.
   - Blocks attempts to restrict your own organization access from the page.
   - Keeps Members / People and existing definition modules working as before.

3. supabase/functions/core-access-action/index.ts
   - Internal version: 2026-06-16-116-F
   - Adds backend self-lockout protections for organization people/access saves:
     - cannot restrict your own organization access;
     - cannot remove your own Organization Admin role;
     - cannot remove your own Organization Super Admin role.
   - Existing last-admin / last-super-admin protections remain in place.

4. supabase/functions/core-access-action/index.ts.txt
   - Exact text copy of index.ts for easier upload/review.

No SQL changes
No Webflow embed changes
No new tables
No data model split

Install / deploy order
1. Deploy Supabase Edge Function:
   supabase/functions/core-access-action/index.ts

2. Upload GitHub Pages assets:
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js

Expected versions after install
- Organization Management: 2026-06-16-116-F
- People Workbench: 2026-06-16-116-F
- core-access-action Edge Function: 2026-06-16-116-F

Primary test URLs
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-admins
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-lifecycle-statuses
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-membership-classes
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-stages

Suggested first test
1. Open People → Administrators & Access.
2. Confirm the page title says Administrators & Access.
3. Confirm the left filter defaults to Admins & access.
4. Select an admin/access person.
5. Confirm the right editor opens to Access & Roles.
6. Confirm invite/password reset buttons are visible in Access & Roles.
7. Confirm login/access/roles summary cards appear above the role checklist.
8. Confirm Members / People and all three People definition modules still load.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.
