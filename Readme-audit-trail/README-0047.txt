README-0047 — Platform Access Tools Cleanup

Date: 2026-06-06
Package: platform_access_tools_cleanup_package_0047

Files to upload:
- assets/core/CORE-COMPONENT-admin-shell-current.js
- assets/admin/ADMIN-PAGE-access-admin-current.js

Changes:
- Cleaned Platform Access Tools hero/header.
- Improved logo contrast with a light logo card.
- Moved logged-in email/logout to top-right of hero.
- Fixed hero text readability on dark gradient.
- Made admin shell navigation pills more uniform.
- Added Edit buttons to organization affiliation rows.
- Added edit form for lifecycle status, membership class, application stage, roles, reference number, and title/note.
- Added confirmation warnings for restrictive statuses and removing organization-admin role.

No database migration.
No Edge Function change.
No Webflow embed change.

Test after upload:
1. Open Access Admin / Platform Access Tools.
2. Click Edit on a membership row.
3. Change status/class/stage or roles.
4. Save.
5. Confirm row updates.
6. Confirm blocked statuses still block user access.
