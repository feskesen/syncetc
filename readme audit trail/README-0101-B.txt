0101-B Applicant Tracker UI Safety Patch

Install only:
assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js

No SQL. No Edge Function deploy. No Webflow changes.

Version: 2026-06-10-101-B

Changes:
- Added stronger nav-away protection for unsaved applicant tracker changes, including archive modal reason/note edits and settings modal edits.
- Applicant search/filter/sort now update the local applicant list without a visible full-page reload.
- Saving applicant workflow/status updates the current applicant/list locally instead of forcing a full tracker refresh.
- Preserved archive reason workflow from 0101.

Verification:
- node --check passed for CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js.
- Nav-away protection is implemented through hasUnsaved() and beforeunload, including unsaved note text, settings edits, and archive modal edits.
