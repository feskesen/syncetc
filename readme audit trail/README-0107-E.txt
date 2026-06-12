# SyncEtc 0107-E — Applicant Portal Email Lookup / Error Message Hotfix

## Scope

Focused follow-up to 0107-D. The screenshot showed the applicant was authenticated in the shell, but the applicant page fell back to the request-link card and displayed `[object Object]`. That points to a backend access-action error object being thrown by Supabase/PostgREST and then rendered unreadably by the frontend.

## Changed files

- `supabase/functions/core-access-action/index.ts`
- `supabase/functions/core-public-render/index.ts`
- `assets/user/USER-PAGE-applicant-portal-current.js`

## Fixes

- Removes the fragile PostgREST `.or(email.ilike...,primary_email.ilike...)` applicant lookup in the authenticated applicant portal path.
- Performs separate exact normalized-email lookups against `email` and `primary_email`, then deduplicates by `application_id`.
- Keeps the lookup order: `applicant_user_id`, then `email`, then `primary_email`.
- Still safely links `core_applications.applicant_user_id` when the email match is safe.
- Applies the same safer email lookup to public applicant portal link requests.
- Adds readable serialization for Supabase/PostgREST error objects so `[object Object]` is not shown to the user.
- Updates applicant portal frontend error handling to preserve debug payloads and show readable messages.

## Install

Upload to GitHub:

- `assets/user/USER-PAGE-applicant-portal-current.js`

Redeploy Supabase Edge Functions:

- `core-access-action`
- `core-public-render`

Do not redeploy `core-admin-action`.
Do not run SQL.
No Webflow changes are required.

## Expected versions

- `USER-PAGE-applicant-portal-current.js`: `2026-06-12-107-E`
- `core-access-action`: `2026-06-12-107-E`
- `core-public-render`: `2026-06-12-107-E`

## Test

Because the applicant is already logged in, first test directly:

`https://syncetc.webflow.io/applicant-portal?syncetc_debug=1`

Expected result:

- The applicant portal loads without sending another link.
- First successful authenticated load may show match method `email` or `primary_email` and `applicant_user_id_linked: true`.
- Later authenticated loads should show `match_method: applicant_user_id`.
- Applicant does not receive member/admin/platform access.

If it still fails, the visible error should now be readable and the debug panel should show the backend diagnostic payload.
