SYNCETC 0116-W — People List Scroll Cleanup

Purpose
- Remove the confusing double-scroll behavior in the Members / People left panel.
- Make the person-card list taller before it needs its own scroll.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-W
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-W

Notes
- UI-only change.
- No SQL changes.
- No Edge Function changes.
- No Webflow embed changes.
- The left panel shell no longer has its own scrollbar on desktop; only the person list scrolls.
- The person list now has a taller desktop viewport before scrolling.

Test
- Open /organization-management?syncetc_debug=1&module=people-members
- Confirm the left panel no longer shows nested/double scrolling.
- Confirm the people-card list is taller and still scrolls when there are more cards than fit.
- Confirm mobile/narrow layouts still stack and use the shorter list height.
