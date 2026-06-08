README-0056 — User Roster

Package: user_roster_package_0056
Version: 2026-06-07-011-A

Purpose:
Build the logged-in user-facing roster page for ordinary organization users/members.

Files included for use:
- supabase/functions/core-access-action/index.ts
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/user/USER-PAGE-dashboard-current.js
- assets/user/USER-PAGE-roster-current.js
- webflow embeds/WEBFLOW-user-roster.txt

Changes:
- Added organization_list_roster Edge Function action.
- Roster action returns privacy-filtered roster data only.
- Tightened organization_list_people and organization_get_person so ordinary roster viewers cannot fetch admin people-editor data.
- Added Roster link to portal header when user has roster access.
- Added Roster link to User Dashboard available areas.
- Added new user-facing roster page with accordion rows, search, open/close all, CSV export, and print-friendly view.
- Roster inherits selected organization style/layout.
- Roster excludes archived, platform/internal, suspended, expelled, blocked, and default non-member/applicant records unless explicitly made roster-visible.
- CSV export contains name, address fields, phone, and email only.

No SQL changes.
No Webflow embed changes except creating the new /roster page with the provided embed.
