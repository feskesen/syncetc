README-0097 — Applicant Intake + Applicant Tracker Foundation

Package: syncetc-applicant-intake-tracker-0097.zip
Internal Version: 2026-06-10-097-A

Purpose:
- Adds public Apply Now intake form.
- Adds organization-admin Applicant Tracker.
- Adds applicant records, default aviation question set, status workflow, checklist/task foundation, internal notes, applicant email templates, and admin badge support.

Privacy / access:
- Public visitors can submit application data only.
- Applicant records are organization-scoped and intended for organization admins/applicant managers.
- Ordinary members should not access applicant records.
- Applicant portal, uploads, and conversion to member are intentionally deferred.

Installed files:
- supabase/sql/0097-applicant-intake-tracker.sql
- supabase/functions/core-public-render/index.ts
- supabase/functions/core-access-action/index.ts
- assets/public/PUBLIC-PAGE-apply-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js
- webflow embeds/apply-now-embed.txt
- webflow embeds/applicant-tracker-embed.txt

Notes:
- Email uses the existing RESEND_API_KEY / SyncEtc-managed sender pattern. No Microsoft/Google OAuth sending is included.
- File upload tasks are seeded as checklist tasks only; actual upload UI/storage is deferred.
- Applicant conversion to people/membership is deferred.
