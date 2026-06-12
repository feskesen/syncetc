# SyncEtc 0108-E — Applicant Portal Full Public Nav Sync

## Purpose
Fixes the applicant portal header so applicant-only users still see the organization's full public navigation, not just the emergency fallback links.

## Background
After 0108-D, applicant portal correctly showed more than Home, but it only showed the portal-shell fallback public links: Home, Calendar, Apply Now. Public pages showed the full public nav (Home, Info, Aircraft, Calendar / Events, Gallery, Documents / Resources, Contact, Apply Now). Applicant-only access should not hide public pages.

## Changed file
- `assets/user/USER-PAGE-applicant-portal-current.js`

## Version
- `USER-PAGE-applicant-portal-current.js`: `2026-06-12-108-E`

## Behavior
- Applicant portal now fetches the public site shell/navigation for the applicant's organization after resolving the applicant record.
- It passes the real `public_nav_items`, `navigation_profile`, `navigation_rows`, `navigation_items`, and logo into `CORE-COMPONENT-portal-shell-current.js`.
- Applicant users remain applicant-only for protected/member/admin pages.
- Public nav should match public site nav.

## Install
Upload only:
- `assets/user/USER-PAGE-applicant-portal-current.js`

Do not run SQL.
Do not redeploy Edge Functions.
Do not upload unrelated assets.

## Test
1. Log in as applicant.
2. Open `/applicant-portal?syncetc_debug=1`.
3. Header PUBLIC row should now match the public website navigation, including items such as Info, Aircraft, Gallery, Documents / Resources, Contact, and Apply Now when configured.
4. Applicant still must not see member/admin/platform rows.
5. Logout should still go home.

