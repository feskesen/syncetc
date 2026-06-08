README-0066-F — Public Shell Shared Header Context Repair

Files to upload:
- assets/public/PUBLIC-COMPONENT-site-shell-current.js

Purpose:
- Public pages now render the shared organization header immediately using the real organization style.
- Public pages no longer remain stuck on “Loading organization navigation…”.
- Public pages attempt to upgrade the same header after session/access lookup.
- Logged-in users/admins on public pages should see additional USER/ADMIN rows when access context is available.
- Public nav filters out user/admin-only pages from the PUBLIC row.

Version:
- 2026-06-07-021-F

No SQL.
No Edge Function deploy.
No Webflow change.
