README-0060 — Portal/Admin Stability Repair
Version: 2026-06-07-015-A

Purpose:
- Repair regressions after portal page activation/tiered navigation work.

Changes:
- Platform admin receives synthetic organization access for diagnostic use.
- Platform admin can open user/admin/people/roster pages without being a real organization member.
- Platform admin access is not customer roster membership.
- Portal header shows Log out whenever a Supabase Auth session exists, even when organization access fails.
- Restores/ships core-access-action platform actions including platform_list_organizations.
- Ships current Page Setup JS and core-admin-action backend.
- Page Setup left column scrolls independently.

Files:
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-admin-action/index.ts
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/user/USER-PAGE-dashboard-current.js
- assets/user/USER-PAGE-roster-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-dashboard-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- assets/admin/ADMIN-PAGE-page-setup-current.js

No SQL.
