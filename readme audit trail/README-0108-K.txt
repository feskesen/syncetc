SyncEtc 0108-K — Apply Now Returning Applicant Copy Polish

Purpose
- Small copy-only polish on the Apply Now returning-applicant help text.
- Changes the phrase from the command-like "Do not remember..." to the friendlier question "Don’t remember...".
- Changes the email-access paragraph to: "Got the email hint, but no longer have access to that email? Use the Contact link at the top of the page so the organization can help verify and update your record."

Changed files
- assets/public/PUBLIC-PAGE-apply-current.js

Install
1. Upload to GitHub:
   - assets/public/PUBLIC-PAGE-apply-current.js

Do not run SQL.
Do not redeploy Edge Functions.
Do not upload applicant portal JS or other assets for this pass.

Expected version
- PUBLIC-PAGE-apply-current.js: 2026-06-12-108-K

Test
- Open https://syncetc.webflow.io/apply-now?syncetc_debug=1
- Confirm the returning-applicant card says:
  - “Don’t remember which email you used? ...”
  - “Got the email hint, but no longer have access to that email? ...”
