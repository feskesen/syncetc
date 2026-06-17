SYNCETC 0116-Q — Qualifications Grid Alignment + JWT/Dirty Cleanup

Purpose
- Fix the Qualifications grid so columns line up consistently.
- Clarify checkbox meaning in qualification rows.
- Retry once with a refreshed Supabase session when an Edge Function call fails with an invalid/expired JWT.
- Clear the People dirty state when the user confirms they want to discard changes and navigate away.

Files changed
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-Q
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-Q

Install
1. Upload the two JS files to GitHub at the same stable production paths.
2. No Supabase SQL changes.
3. No Edge Function changes.
4. No Webflow embed changes.

Testing
1. Open /organization-management?syncetc_debug=1&module=people-members.
2. Select a person and open Aviation / Qualifications.
3. Confirm the grid columns align.
4. Confirm checkbox rows show clearer labels such as Yes, Approved, Current, or Privileges current instead of the ambiguous Current / approved everywhere.
5. Edit a qualification definition display name from People > Qualifications and confirm an invalid/expired JWT is retried once after session refresh.
6. Make an unsaved edit, try switching modules, choose to discard, and confirm the page no longer repeatedly thinks it is dirty.
