# SyncEtc 0107-G — Applicant Portal Visibility / Applicant-Facing Status Polish

Date: 2026-06-12

## Purpose

Polish the now-working applicant portal so applicants see applicant-safe status and only next steps that they can actually complete. This follows the successful 0107-F applicant-auth-only hotfix.

## Changed files

- `assets/user/USER-PAGE-applicant-portal-current.js`
- `supabase/functions/core-access-action/index.ts`

## What changed

### Applicant portal UI

- Renamed the applicant task section from `Applicant tasks` to `Next steps for you`.
- Replaced the old raw status pill such as `New` with applicant-facing status copy:
  - `Application received`
  - `On waitlist`
  - `Invited to interview`
  - `Onboarding in progress`
  - `Final review`
  - `Application closed`
- Displays waitlist number only if the backend returns it, which remains controlled by organization applicant settings.
- If there are no applicant next steps, the portal now says:
  - `No action is required from you right now. We will update this page if we need additional information.`
- Progress text now says `Required next steps for you`, not `Required applicant-visible tasks`.

### Backend applicant portal payload

- `applicant_get_my_portal` now returns only current-stage applicant-actionable tasks to the applicant portal.
- A task must be:
  - `applicant_visible !== false`
  - `responsible_party = applicant`
  - in the applicant's current stage
- The applicant payload removes internal-only fields that the applicant portal does not need:
  - `internal_notes`
  - `metadata_json`
  - `spam_score`
  - `spam_reason`
  - `last_reply_at`
  - `last_reply_by_email`
  - `ready_for_final_review`
  - `ready_for_final_review_at`
  - applicant events/timeline notes are returned as empty arrays for now
- Applicant uploads are now guarded server-side so an applicant cannot upload against a task that is not available in the applicant portal.

## Install

Upload to GitHub:

- `assets/user/USER-PAGE-applicant-portal-current.js`

Redeploy Supabase Edge Function:

- `core-access-action`

## Do not redeploy

- `core-admin-action`
- `core-public-render`
- portal shell

## SQL

No SQL is required.

## Expected versions

- `USER-PAGE-applicant-portal-current.js`: `2026-06-12-107-G`
- `core-access-action`: `2026-06-12-107-G`

Other working versions can remain:

- `CORE-COMPONENT-portal-shell-current.js`: `2026-06-12-107-D`
- `core-public-render`: `2026-06-12-107-E`

## Test URL

- `https://syncetc.webflow.io/applicant-portal?syncetc_debug=1`
- `https://syncetc.webflow.io/applicant-portal`

## Expected test result for the current test applicant

For `feskesen2@icloud.com`, whose current stage is `new`, the portal should show:

- Status: `Application received`
- No visible `Review application` board/admin task
- Section label: `Next steps for you`
- No-action message if no applicant task is currently due
- Application information remains available/editable according to settings

