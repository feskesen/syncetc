SYNCETC PACKAGE 0116-C — People Performance + Uniform UI Cleanup
Generated: 2026-06-16

Purpose
- Speed up the People workbench inside Organization Management.
- Remove the full-width embedded green refreshed/status banner from the normal People module UI.
- Keep the 0116-A/0116-B People workbench visual structure intact.

Changed production files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Expected internal versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-C
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-C

Organization Management changes
- Bumped Organization Management to 116-C.
- Bumped expected People module version to 116-C.
- Passes already-known parent context into the embedded People module:
  - access token
  - email
  - organization id
  - current organization access row
  - organization access rows
  - platform admin flag
  - shared Supabase client
- Adds debug timings for People script load/reuse and People mount duration.

People module changes
- Bumped People Workbench to 116-C.
- Reuses the parent/shared Supabase client when available.
- Uses parent Organization Management access context when embedded, avoiding an extra get_my_access startup call.
- Loads dashboard/access, vocabulary, and people list in parallel where safe.
- Adds a short-lived in-memory organization context cache to make switching away and back faster.
- Adds debug diagnostics for people count, cache state, Edge action timings, and render/load timings.
- Keeps mutation actions fresh by forcing list reloads after save, photo changes, invite, archive, and restore.
- Moves embedded success/status messages out of the full-width top banner:
  - refresh/export/organization messages appear inline near the left toolbar;
  - save/photo/invite/archive messages appear inline in the bottom editor action row.
- Keeps standalone People page status messaging available in the standalone hero.
- No database schema changes.
- No SQL changes.
- No Edge Function changes.
- No Webflow embed changes.

First test URL
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members

First test expectations
- People module loads inside Organization Management.
- Debug mode shows Organization Management 116-C and People 116-C.
- The former full-width green “Refreshed.” banner no longer appears above the People module header.
- Manual Refresh shows a small inline “Updated now” status near the Refresh button.
- Save/photo/invite/archive messages show near the bottom action row instead of as a large top banner.
- Search/filter/select/save/archive still work.
- Debug diagnostics include People timing/cache information.

Rollback
- Restore the previous 116-B versions of the two changed files.
