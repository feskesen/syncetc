README-0098 — Applicant Portal Access + Applicant Update + Upload Tasks

Package: syncetc-applicant-portal-upload-tasks-0098.zip
Internal versions: 2026-06-10-098-A

Purpose:
Add applicant-only portal access groundwork, applicant self-update, private upload tasks, applicant tracker upload review controls, portal access settings, waitlist visibility setting, and duplicate-application detection groundwork.

Files included:
- supabase/sql/0098-applicant-portal-upload-tasks.sql
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-public-render/index.ts
- assets/public/PUBLIC-PAGE-apply-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js
- assets/user/USER-PAGE-applicant-portal-current.js
- webflow embeds/apply-now-embed.txt
- webflow embeds/applicant-tracker-embed.txt
- webflow embeds/applicant-portal-embed.txt

Important safeguards:
- Applicant login is applicant-only and does not grant member portal/roster/document/admin access.
- Applicant portal access is controlled by organization setting.
- Waitlist position visibility defaults off/private.
- Applicant uploads use a private storage bucket and Edge Function service-role upload path; no service role secret is exposed to the browser.
- Duplicate detection does not reveal full private applicant information; it uses masked email messaging.

Deferred:
- Automatic applicant-to-person/member conversion.
- Payments, e-signatures, Microsoft/Google OAuth sender integration.
- Flight scheduler access/check-out fields.
