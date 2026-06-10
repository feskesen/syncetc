README-0099-B — Applicant Tracker Review UI Cleanup

Package: syncetc-applicant-tracker-review-ui-cleanup-0099-B.zip
Date: 2026-06-10

Files changed:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js

Purpose:
- Clean up the Applicant Tracker review UI after 0099.
- No SQL, Edge Function, Webflow, public page, or portal-shell changes.

Changes:
- Applicant Tracker version advanced to 2026-06-10-099-B.
- Manual notes no longer force a full applicant-list refresh after adding a note.
- Notes/activity timeline no longer shows duplicate manual note entries from both the note record and note_added event.
- Notes/activity timeline now has search and basic filters: all activity, notes only, emails, workflow/tasks.
- Application summary now shows fuller application details in grouped sections:
  applicant, address/background, aviation qualifications, safety/FAA, interest/referral, and activity.
- Checklist tasks render as collapsible task panels.
- Added applicant archive/restore controls using the existing applicant update action.
- Preserved 0099 stage-based workflow, applicant portal settings, upload task review controls, and applicant timeline groundwork.

Install:
- Upload only assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js.

Test URL:
- https://syncetc.webflow.io/applicant-tracker?syncetc_debug=1
