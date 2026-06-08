README-0053 — People archived restore + portal header auth controls

Package: organization_people_archived_header_patch_0053
Date: 2026-06-07

Files to use:
- supabase/functions/core-access-action/index.ts
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-dashboard-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Changes:
- Fixes archived People rows not appearing under the Archived filter.
- Keeps archived records available to the People page when requested, so restore can work.
- Adds uniform portal-shell Log in / Log out controls in the header.
- Removes logged-in/logout controls from Organization Admin and People hero areas.
- Login forms remain on the page body when logged out.

Version target:
- 2026-06-07-008-A

No SQL.
No Webflow embed change.
