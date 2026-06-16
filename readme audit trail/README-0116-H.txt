SYNCETC / ONESOURCE AVIATION WEBSITE REBUILD
Package: 0116-H — Assign Groups / Roles to People
Date: 2026-06-16

Purpose
- Make the Groups / Roles definitions useful from the unified People editor.
- Keep one People database/model.
- Do not reintroduce the separate Administrators & Access nav item.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-H
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-H

Supabase / Edge / SQL
- No SQL changes.
- No Edge Function changes.
- Existing organization_save_person role_keys handling is reused.

What changed
- Members / People now has a Role / group filter in the left list.
- Person list badges now show assigned customer roles/groups more clearly.
- Access & Roles tab now has a clearer Groups & Roles assignment area.
- Role checkboxes are grouped by role type: Admin/access, Board, Officers, Managers, Committees, Instructors, Staff, Groups, Member, Custom.
- Existing invite/reset actions stay in Access & Roles.
- Existing self-lockout, last-admin, and Super Admin safeguards remain unchanged.
- Groups / Roles helper text now explains that roles are defined there and assigned from Members / People.

Install order
1. Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js to GitHub.
2. Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js to GitHub.
3. Wait for GitHub Pages/cache to refresh.

First tests
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members
- Open a person, then open Access & Roles.
- Assign/remove a non-protected group or role, save, reopen the person, and confirm it persists.
- Use the Role / group filter on the left list.

Regression tests
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-groups
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-lifecycle-statuses
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-membership-classes
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-stages

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
