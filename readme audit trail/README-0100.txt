SyncEtc Website Rebuild
README-0100.txt
Package: 0100 Applicant Workflow Model Cleanup

Purpose:
- Simplify the applicant workflow to the lifecycle Frank described.
- Move Applicant Tracker Settings into a modal, visible to admins but editable only by Organization Super Admin / Platform Admin.
- Keep applicant notes/activity timeline lifecycle-ready so applicant notes can later carry into person/member history.
- Fix Applicant Tracker width inheritance by using the organization layout width instead of a hard-coded page width.

Files included:
- supabase/sql/0100-applicant-workflow-model-cleanup.sql
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js

Expected versions:
- core-access-action: 2026-06-10-100-A
- CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js: 2026-06-10-100-A

Notes:
- This package does not convert applicants into people/members.
- This package does not build payment, e-signature, OAuth email, or scheduler access.
- Applicant settings are intentionally separated from individual applicant detail work.
- Ordinary organization admins can view settings but cannot save them.
