README-0108-D — Global Logout Home + Public Nav Fallback
Date: 2026-06-12

Purpose
- Tight UX/regression polish after 0108-A/B/C header/nav foundation testing.
- Make logout behavior consistent: logout from shared portal/public/login surfaces sends the browser to the public home page instead of leaving the user on the same protected/login screen.
- Give applicant/portal pages a safe public navigation fallback so applicants can reach ordinary public pages, not just Home.

Problem observed
- Logging out from /my-profile left the user on the same URL with the inline login card. This was technically logged out but felt like nothing happened.
- Applicant portal header showed only Home in the PUBLIC row. Since public pages are public, applicant users should still have access to the public navigation set.

Files changed
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/core/CORE-COMPONENT-organization-header-current.js
- assets/public/PUBLIC-COMPONENT-site-shell-current.js
- assets/auth/AUTH-PAGE-login-current.js

Behavior changes
- Portal shell logout always redirects to / after Supabase signOut.
- Public shell logout redirects to / after Supabase signOut.
- Login page logout redirects to / after Supabase signOut.
- Portal shell now has a safe public fallback nav of Home, Calendar, Apply Now when no public nav items are available in the portal payload.
- Shared organization header treats apply-now/apply as public keys so they are not filtered out of public rows.

Security notes
- This is UX/navigation only.
- It does not grant applicant users member/admin/platform access.
- Navigation remains separate from authorization; protected pages still rely on page/access checks.

Install
1. Upload GitHub assets:
   - assets/core/CORE-COMPONENT-portal-shell-current.js
   - assets/core/CORE-COMPONENT-organization-header-current.js
   - assets/public/PUBLIC-COMPONENT-site-shell-current.js
   - assets/auth/AUTH-PAGE-login-current.js

Do not run SQL.
Do not redeploy Edge Functions.
Do not redeploy core-admin-action.

Expected versions
- CORE-COMPONENT-portal-shell-current.js: 2026-06-12-108-D
- CORE-COMPONENT-organization-header-current.js: 2026-06-12-108-D
- PUBLIC-COMPONENT-site-shell-current.js: 2026-06-12-108-D
- AUTH-PAGE-login-current.js: 2026-06-12-108-D

Testing
1. Log in on /my-profile, then click Log out. Expected: browser goes to /.
2. Log in on /applicant-portal, then click Log out. Expected: browser goes to /.
3. Log in on a public page where the header shows a logged-in pill, then click Log out. Expected: browser goes to /.
4. Visit /applicant-portal while logged in as applicant. Expected PUBLIC row includes Home, Calendar, Apply Now when no custom public nav is supplied.
5. Try opening /applicant-portal after logout. Expected: request-link screen, not applicant details.
6. Confirm applicant still cannot access member/admin/platform pages.
