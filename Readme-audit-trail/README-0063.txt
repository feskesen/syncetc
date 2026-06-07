README-0063 — Unified Organization Header

Version: 2026-06-07-018-A

Purpose:
Unify the organization header experience across public pages and portal pages.

Files changed:
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/public/PUBLIC-COMPONENT-site-shell-current.js

Changes:
- Public pages now render the same tiered organization-header style used by portal pages.
- Header rows are access-aware:
  - Public row for public navigation.
  - User row when logged in with user access.
  - Admin row when logged in with organization admin access.
  - Platform row when logged in as platform admin.
- Public page header now checks Supabase login state and adds User/Admin/Platform rows where applicable.
- Home is forced into the public row and placed first.
- Home links normalize to / instead of /home.
- Header styling continues to inherit organization style settings.
- Portal shell keeps the same tiered model and normalizes Home to /.

Install notes:
- Upload only the two listed JS files.
- No SQL or Edge Function deploy is required.
- No Webflow embed change is required.

Test notes:
- Public pages and portal pages should now show the same organization-header pattern.
- Logged-out visitors should see public navigation plus Log in.
- Logged-in users should see public + user rows.
- Organization admins should see public + user + admin rows.
- Platform admins should also see platform row.
