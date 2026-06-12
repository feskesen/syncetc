# SyncEtc 0107-F Applicant Portal Auth-Only / core_people Constraint Hotfix

Internal version: 2026-06-12-107-F

## Why this exists

After 0107-E, applicant auth and email lookup were improved, but a logged-in applicant could still fail before portal loading because core-access-action globally called ensurePersonForAuthUser() before applicant actions. That helper attempted to create a core_people row with status auth_unlinked. The database check constraint core_people_status_check rejected that status.

This was also the wrong architectural behavior for applicant-only access: an applicant portal login should not require creating a core_people/person/member row.

## Changed file

- supabase/functions/core-access-action/index.ts

## What changed

- Applicant portal actions now run before ensurePersonForAuthUser().
- applicant_get_my_portal, applicant_save_my_application, and applicant_upload_task_file use an in-memory applicant-only person placeholder instead of creating core_people.
- Applicant auth users with metadata syncetc_account_type=applicant and no existing person link are blocked from member/admin/platform actions with a clear applicant_access_only error.
- get_my_access for applicant-only auth returns applicant-level access when available, without creating core_people.
- As a safety belt for ordinary non-applicant auth flows, ensurePersonForAuthUser() no longer inserts status auth_unlinked; it uses active, which matches the existing core_people status model.

## Install

Redeploy only:

- supabase/functions/core-access-action

Do not run SQL.
Do not redeploy core-admin-action.
No Webflow changes.
No GitHub asset upload is required for this hotfix unless you did not already install 0107-E.

## Expected versions

- core-access-action: 2026-06-12-107-F
- applicant portal JS may remain: 2026-06-12-107-E
- core-public-render may remain: 2026-06-12-107-E
- portal shell may remain: 2026-06-12-107-D

## Test

Go directly to:

https://syncetc.webflow.io/applicant-portal?syncetc_debug=1

Expected:

- no core_people_status_check error
- no [object Object]
- applicant portal loads for the logged-in applicant
- first successful run may link core_applications.applicant_user_id
- later runs should match by applicant_user_id
- applicant still receives only applicant access, not member/admin/platform access
