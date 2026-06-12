README-0107-D
Applicant Portal Access-Level / Record-Link Hotfix

Changed files:
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-public-render/index.ts
- assets/user/USER-PAGE-applicant-portal-current.js
- assets/core/CORE-COMPONENT-portal-shell-current.js

No SQL. No Webflow changes.
Do not redeploy core-admin-action.
Do not rerun prior SQL.

Expected internal versions after install:
- core-access-action: 2026-06-12-107-D
- core-public-render: 2026-06-12-107-D
- USER-PAGE-applicant-portal-current.js: 2026-06-12-107-D
- CORE-COMPONENT-portal-shell-current.js: 2026-06-12-107-D

What changed:
- Applicant portal access now treats the applicant as an authenticated lowest-level login, not a member/admin login.
- core-access-action applicant lookup now tries applicant_user_id first, then normalized email, then normalized primary_email.
- If the applicant record safely matches the authenticated email and applicant_user_id is blank, core-access-action links applicant_user_id to auth.uid().
- The applicant access response now includes an applicant-only access object and diagnostics showing auth email/user id, lookup attempts, match method, applicant id, organization id, portal access decision, and whether applicant_user_id was linked.
- portal_access_mode controls applicant portal availability. applicant_account_mode is returned for clarity but does not override portal_access_mode when portal_access_mode exists.
- Logged-in-but-unmatched users now get the clearer message: “You are logged in as [email], but no applicant portal record is linked to this login.”
- Applicant portal frontend preserves backend diagnostics in debug mode and no longer says the secure login failed when authentication succeeded but applicant record lookup failed.
- Portal shell no longer shows the confusing “Open full login page” link.
- Portal shell treats applicant mode as applicant-only and does not show member dashboard/admin/platform navigation to applicants.
- Portal shell now recognizes #syncetc-applicant-portal-root for early-hide/reveal handling.

Install:
1. Upload these GitHub assets:
   - assets/user/USER-PAGE-applicant-portal-current.js
   - assets/core/CORE-COMPONENT-portal-shell-current.js
2. Redeploy these Supabase Edge Functions:
   - supabase/functions/core-access-action/index.ts
   - supabase/functions/core-public-render/index.ts
3. Do not change Webflow embeds for this package.
4. Do not run SQL for this package.

Test URLs:
- https://syncetc.webflow.io/applicant-portal?syncetc_debug=1
- https://syncetc.webflow.io/applicant-portal

Primary test path:
1. Log in or use the secure applicant link for feskesen2@icloud.com.
2. Open https://syncetc.webflow.io/applicant-portal?syncetc_debug=1.
3. Expected: applicant portal loads application 8c3a458b-a10b-4921-95e6-13a4fb110906 for test-customer-1.
4. Expected debug payload from core-access-action: version 2026-06-12-107-D, access_level applicant, match_method email or primary_email on the first successful run if applicant_user_id was blank, then applicant_user_id on later runs.
5. Expected: applicant_user_id becomes linked to auth user 816b42c7-788c-4685-a779-eaad4b61c721 when the email match is safe.
6. Expected: applicant sees only applicant portal/tasks/uploads/application info, not roster, member documents, internal documents, organization admin, or platform tools.

Nav-away protection:
- Checked. The applicant portal still has beforeunload protection for dirty editable state.
