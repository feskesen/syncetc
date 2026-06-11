SyncEtc package 0105 — Applicant Workflow Actions + Confirmation Model

Purpose:
- Adds 1.0 workflow transition confirmations/actions to the Applicant Tracker.
- Keeps ordinary applicant tracking simple while adding structured confirmations and audit/timeline entries.

Files:
- supabase/sql/0105-applicant-workflow-actions-confirmations.sql
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js

Install:
1. Run the SQL.
2. Deploy core-access-action.
3. Upload CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js.

Expected versions:
- core-access-action: 2026-06-10-105-A
- CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js: 2026-06-10-105-A

Notes:
- Platform Admins and Organization Super Admins can edit Applicant Settings.
- Applicant Settings stage task accordions now behave one-open-at-a-time.
- Moving applicants forward can show a transition confirmation modal.
- Confirmations/actions are written to applicant timeline events.
- Email transition actions try to send configured applicant email templates but will not block the stage move if email is not configured.
- Grant applicant portal access transition action updates applicant portal access fields.
- Nav-away protections remain present in the Applicant Tracker JS.
