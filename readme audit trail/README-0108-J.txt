SyncEtc Website Rebuild — README-0108-J
Package: Applicant Portal Accordion / Status Semantics Polish
Internal Version: 2026-06-12-108-J

Purpose
- Clean up the logged-in Applicant Portal view.
- Remove unnecessary access-tier / member-access explanatory language from the hero.
- Reframe the portal as a simple status/action page:
  "View your application status, update your application information, and complete any steps requested by [organization name]."
- Convert the main applicant portal content into three consistent accordion sections:
  1. Application status — starts open.
  2. Next steps for you — starts closed.
  3. Update application information — starts closed.
- Align section badges/chips consistently at the right side of each section row.
- Preserve the future task system for applicant action items such as uploads, required documents, signatures, profile photo, and other organization-requested next steps.
- Use semantic badge classes for attention/warning states while allowing future customer/system alert colors through style colors_json when present.

Changed Files
- assets/user/USER-PAGE-applicant-portal-current.js

Install
1. Upload this file to GitHub:
   - assets/user/USER-PAGE-applicant-portal-current.js

Do Not Run
- Do not run SQL.
- Do not redeploy Edge Functions.
- Do not redeploy core-access-action.
- Do not redeploy core-public-render.
- Do not upload public Apply Now files unless separately changed.

Expected Version
- USER-PAGE-applicant-portal-current.js: 2026-06-12-108-J

Behavior
- The Applicant Portal hero now says:
  "View your application status, update your application information, and complete any steps requested by [organization name]."
- The status card is now an accordion section named "Application status" and starts open.
- Status content is direct and factual: status label, applicant name, submitted date, last updated date, and waitlist position if available.
- "Next steps for you" stays closed by default and shows a badge:
  - None when no applicant action is needed.
  - N need(s) attention when required applicant-facing tasks are open.
  - N optional when only optional applicant-facing tasks are open.
  - Complete when applicant-facing tasks exist and are complete.
- Required attention badges use the semantic attention style.
- Optional badges use the semantic warning style.
- Normal status/editable badges use the organization/default theme style.
- Existing nav-away protection for unsaved application updates is preserved.

Test URLs
- https://syncetc.webflow.io/applicant-portal?syncetc_debug=1

Testing Checklist
1. Log in as applicant and open applicant portal.
2. Confirm hero no longer mentions applicant-only/member access.
3. Confirm "Application status" is open and shows the status/submitted date.
4. Confirm "Next steps for you" is closed and badge says None for the current no-task test applicant.
5. Confirm "Update application information" is closed and badge says Editable.
6. Open Update application information, edit a field, and click a public nav link. Browser should warn before leaving.
7. Save updates; then navigation should not warn.
