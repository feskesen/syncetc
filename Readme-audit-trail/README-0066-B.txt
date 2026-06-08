README-0066-B — Portal Shell Uses Shared Header

Purpose:
- Step 2 of the true single-header repair.
- The portal shell now calls the shared organization header engine instead of rendering its own portal-specific header.

Install:
1. Upload:
   assets/core/CORE-COMPONENT-portal-shell-current.js
2. Commit.
3. Wait 1–3 minutes.
4. Confirm direct URL shows 2026-06-07-021-B.
5. Hard refresh portal pages only.

Test only:
- /user-dashboard
- /organization-admin
- /organization-people
- /roster

Expected:
- Portal pages still load.
- Header displays through the shared header component.
- Home appears first in the Public row.
- User/Admin/Platform rows behave as before on portal pages.
- No public pages are changed yet.

No SQL.
No Edge Function deploy.
No Webflow change.
