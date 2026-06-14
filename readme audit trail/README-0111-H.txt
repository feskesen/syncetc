SyncEtc 0111-H — Public Page Cross-Org Login / Logout Header Hotfix

Purpose
- Fix public pages when a logged-in user belongs to a different organization than the public site being viewed.
- Public pages must remain public.
- Logged-in users who do not have member/admin access to the displayed organization should still see public navigation and a logout button, not a "Navigation unavailable" error.

Changed files
- assets/public/PUBLIC-COMPONENT-site-shell-current.js
- assets/core/CORE-COMPONENT-organization-header-current.js

Expected versions
- PUBLIC-COMPONENT-site-shell-current.js: 2026-06-14-111-H
- CORE-COMPONENT-organization-header-current.js: 2026-06-14-111-H

Install
1. Upload the two changed GitHub assets.
2. Do not run SQL.
3. Do not redeploy Edge Functions.

What changed
- Public shell now treats member/dashboard access denial as "public nav only" instead of a public-page failure.
- Public shell now tolerates private navigation lookup failures and still renders the public header.
- Organization header no longer treats any authenticated user as eligible for the USER nav row when configured navigation is used.
- Authenticated cross-organization users should still see their signed-in badge/logout control.

Testing
1. Log in as a user who does not belong to the test organization.
2. Visit https://syncetc.webflow.io/?syncetc_debug=1
3. Expected: home page renders normally with public nav and logout control.
4. Expected: no "Navigation unavailable" message.
5. Click Log out.
6. Expected: user signs out and remains/goes to public home.
7. Log in as a real member/admin and confirm user/admin nav still appears on public pages for the correct organization.

Notes
- This is intentionally a narrow public-shell/header patch.
- It does not change public/member/admin/platform access enforcement for restricted pages.
