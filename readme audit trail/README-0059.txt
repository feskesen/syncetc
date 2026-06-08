README-0059 — Page Setup Publish/Nav Repair

Version: 2026-06-07-014-A

Purpose:
Make Page Setup the clear source of truth for customer page status, publish/draft state, and navigation visibility.

Files:
- supabase/sql/PAGE-SETUP-PUBLISH-NAV-REPAIR-0059.sql
- supabase/functions/core-admin-action/index.ts
- assets/admin/ADMIN-PAGE-page-setup-current.js

Changes:
- Registers Roster and People & Access templates as implemented.
- Ensures missing customer page rows exist as draft / hidden from nav.
- Does not automatically publish or show pages in customer navigation.
- Adds Page Setup controls for Publish + show, Hide from nav, Set draft, Archive, and Restore as draft.
- Adds clearer customer page state labels.
- Adds filters for customer page state and build status.
- Sorts live/implemented pages ahead of draft/planned items by default.

Security:
- Platform admin only through core-admin-action.
- Page Setup controls affect customer page activation only.
- Disabled/draft/hidden page behavior is still enforced by portal access/page activation logic.

Install order:
1. SQL.
2. Edge Function.
3. GitHub JS.
4. Test Page Setup.
