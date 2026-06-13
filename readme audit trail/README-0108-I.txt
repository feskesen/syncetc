SyncEtc Website Rebuild — 0108-I Apply / Update Application Inline Secure Link Consolidation

Purpose
- Consolidates the returning-applicant secure-link request onto the Apply Now / Apply-Update page.
- Keeps /applicant-portal as the logged-in applicant portal and magic-link destination, not the primary public request step.
- Cleans applicant portal request copy and removes privacy/sausage-making language.

Changed files
- assets/public/PUBLIC-PAGE-apply-current.js
- assets/user/USER-PAGE-applicant-portal-current.js
- supabase/functions/core-public-render/index.ts

Install
1. Upload to GitHub:
   - assets/public/PUBLIC-PAGE-apply-current.js
   - assets/user/USER-PAGE-applicant-portal-current.js

2. Redeploy Supabase Edge Function:
   - core-public-render

Do not run SQL.
Do not redeploy core-access-action.
Do not redeploy core-admin-action.
Do not upload any other GitHub assets for this package.

Expected versions
- PUBLIC-PAGE-apply-current.js: 2026-06-12-108-I
- USER-PAGE-applicant-portal-current.js: 2026-06-12-108-I
- core-public-render: 2026-06-12-108-I

Behavior changes
- Apply page left card is now clearly for new applicants:
  - New applicant?
  - Begin the application process here
  - Begin application
- Apply page right card is now clearly for returning applicants:
  - Already applied?
  - View or update your application
  - Inline email field
  - Send secure link
- Returning applicants no longer need to click through to a separate applicant-portal request page just to request a magic link.
- The applicant portal request page remains available as a fallback/direct URL, but its copy is simpler.
- Removed the public-facing privacy explanation from the fallback applicant portal request page.
- Existing active application matches show a masked email hint and require the user to confirm the full email address on file before the precheck secure-link request sends.
- If the confirmed email does not match the email on file, the backend does not send the link.
- The system still does not allow public/unauthenticated email reset.
- If the applicant no longer has access to the email on file, the UI directs the applicant to Contact.

Test URLs
- https://syncetc.webflow.io/apply-now?syncetc_debug=1
- https://syncetc.webflow.io/applicant-portal?syncetc_debug=1

Key tests
1. Apply page loads and shows:
   - Left: New applicant / Begin application
   - Right: Already applied / View or update your application / email field / Send secure link
2. Returning applicant email request on the right sends a neutral success message and email when a matching eligible application exists.
3. New, unique applicant precheck opens the full application form.
4. Strong active duplicate precheck shows masked email on file and asks for full email confirmation before sending link.
5. If the wrong email is confirmed, no link is sent.
6. If the correct email is confirmed, the link is sent to the email on file.
7. Applicant portal direct request page still works as a fallback but no longer includes the privacy explanation language.
8. Applicant portal logged-in view still works.
9. Applicant cannot access member/admin pages.

Notes
- This package intentionally does not add public self-service email reset. Email changes remain post-login or admin-assisted later.
- Customer-editable copy/settings can be added in a future pass.
