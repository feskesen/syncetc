README-0058 — Portal Page Activation + Tiered Header Repair

Version: 2026-06-07-013-A

Purpose:
- Register User Roster and Organization People as architecture-aware pages.
- Repair 0057 behavior so pages are not automatically enabled for every organization.
- Make Page Setup the source of truth for whether portal pages appear or load.
- Add tiered portal header navigation: Public, User, Admin, and Platform when applicable.
- Keep Layout Designer / Look & Feel on platform-level navigation for now.
- Update roster wording and export behavior.

Files included:
- supabase/sql/PORTAL-PAGE-ACTIVATION-REPAIR-0058.sql
- supabase/functions/core-access-action/index.ts
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/user/USER-PAGE-dashboard-current.js
- assets/user/USER-PAGE-roster-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-dashboard-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Key behavior:
- Roster and People rows are created as draft/show_in_nav=false when missing.
- Existing Roster and People rows are repaired to disabled once if not previously marked by 0058.
- Reruns preserve later Page Setup choices after the 0058 repair marker exists.
- Enabled portal pages are returned through core-access-action only when active/published/enabled/live.
- Direct access to disabled Roster or People returns “This page is not enabled for this organization.”
- Header links are generated from enabled portal pages and user permissions.
- User-facing roster export now uses tab-separated .tsv “Export for Excel.”
