SYNCETC 0116-I — People Filter Clarity
Date: 2026-06-16

Purpose
- Reduce confusion in the Members / People list after the role/group assignment pass.
- Remove the always-visible second Role / group dropdown from the left panel.
- Preserve role assignment and role badges while making role-based filtering optional and obvious.

Files changed
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-I
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-I

Behavior changes
- Members / People now shows only the primary Status / lens selector by default.
- Group / role filtering moved into an Advanced filters area.
- When a group/role filter is active, a visible chip appears, for example: Group / role: Board Member ×.
- A Clear control removes the advanced role filter.
- Primary Status / lens counts no longer silently shrink because a role/group filter is active.
- Role assignment in the Access & Roles tab remains unchanged.
- Person cards continue to show assigned role/group badges.

No changes
- No SQL migration.
- No Edge Function change.
- No Webflow embed change.
- No database model change.

Suggested tests
1. Open Organization Management with module=people-members.
2. Confirm the role/group dropdown is not always visible.
3. Click Advanced filters and select Board Member or another group/role.
4. Confirm the active filter chip appears and the list narrows.
5. Change Status / lens to All and confirm the role chip remains visible so the narrowed list is not mysterious.
6. Clear the chip and confirm all matching people return.
7. Confirm Access & Roles still allows group/role assignment.
