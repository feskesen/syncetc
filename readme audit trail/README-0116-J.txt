SYNCETC 0116-J — PEOPLE FILTER TAXONOMY CLEANUP
Generated: 2026-06-16

Purpose
- Correct the Members / People finder so the main filter and advanced filters do not duplicate the same concepts.
- Make the People list understandable before additional People modules are added.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-J
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-J

What changed
- Removed role/access/member-type items from the primary Members / People Status filter.
- Primary Status filter is now only lifecycle/status-oriented:
  - All
  - Active
  - Applicants
  - Waitlist
  - Onboarding
  - Former
  - Suspended / Expelled
  - Archived
- Group / role filtering now lives only under Advanced filters.
- Login filtering now lives only under Advanced filters.
- Active advanced filters show visible chips with clear controls.
- Old/direct initial filters such as board, admins, managers, users, non-member, no-login, or admins-access are normalized back to All in the main People finder.
- Role assignment in Members / People > Access & Roles is unchanged.
- Groups / Roles definition module is unchanged.
- No SQL changes.
- No Edge Function changes.
- No Webflow embed changes.

Reasoning
- Board, Manager, Admin, and similar items are roles/access concepts, not lifecycle statuses.
- The main filter should not say All while another same-concept filter is also active elsewhere.
- This pass separates concepts cleanly: lifecycle/status in the primary filter, roles/access in Advanced filters.

First test
1. Open:
   https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members
2. Confirm the primary Status filter does not show Board, Admins, Managers, Members, Non-member, or No Login.
3. Confirm Advanced filters contains Group / role and Login.
4. Select Board Member under Group / role and confirm the active chip is visible.
5. Change the Status filter to All and confirm the Board Member chip still clearly explains why the list is narrowed.
6. Clear the chip and confirm the full list returns.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
