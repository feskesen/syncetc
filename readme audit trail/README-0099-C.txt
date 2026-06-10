SyncEtc 0099-C Applicant Tracker UI Polish

Purpose:
- Polish the Applicant Tracker review UI after 0099-B testing.

Changes:
- Application details now show field labels even when answers are blank, using an em dash.
- Major sections are accordions:
  - Application details open by default.
  - Checklist closed by default.
  - Notes/activity timeline closed by default.
  - Applicant emails closed by default.
- Add-note behavior is optimistic: the note appears immediately as pending and then confirms without a full visible refresh.
- Add-note button shows Adding... while the backend call is pending.
- Unsaved note text now triggers nav-away protection.
- Applicant search filters the loaded applicant list locally instead of visibly refreshing the whole page on each search input.
- Archive/restore updates the selected/list state without a full visible refresh where practical.
- Tracker width reduced to better match the other customer-admin pages.
- Removed duplicate left-panel status alert so messages appear once.

Install:
- Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js

No SQL, Edge Function, or Webflow changes.
