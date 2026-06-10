README-0101 — Applicant Archive Reason + Filter Cleanup

Purpose:
- Treat applicant archiving as closing the applicant lifecycle.
- Remove Added as Member from the active workflow and use it as an archive reason.
- Require archive reason when archiving applicants.
- Replace Include Archived checkbox with clear filter choices.

Changes:
- Adds structured archive reason fields to core_applications.
- Converts prior Added as Member applicant status to Archived with reason Added as Member.
- Updates core-access-action applicant filtering and archiving validation.
- Updates Applicant Tracker UI archive flow with modal confirmation.

Install:
- Run SQL.
- Deploy core-access-action.
- Upload Applicant Tracker JS.

No Webflow changes.
