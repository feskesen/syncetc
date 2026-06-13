# SyncEtc 0110-D — Member Login Redirect + Dashboard Event Accent Polish

## Purpose
Small focused member-dashboard polish pass after 0110-C testing.

## Changes
- Public/header login links now default to `/login?next=/user-dashboard` instead of `/login?next=/`.
- Login page normalizes public-page return destinations (`/`, `/calendar`, `/apply-now`, etc.) to `/user-dashboard` after successful member/org-admin login.
- Protected-page return destinations remain supported for real restricted pages.
- Applicant portal/magic-link flow is not changed.
- Next Club Event dashboard card now uses the event accent as a left-side color bar instead of a top border, closer to the calendar-card visual convention.

## Install
Upload to GitHub:
- `assets/auth/AUTH-PAGE-login-current.js`
- `assets/public/PUBLIC-COMPONENT-site-shell-current.js`
- `assets/core/CORE-COMPONENT-organization-header-current.js`
- `assets/member/MEMBER-PAGE-dashboard-current.js`
- `assets/user/USER-PAGE-dashboard-current.js`

No SQL.
No Edge Function redeploy.

## Do not redeploy
- `core-access-action`
- `core-public-render`
- `core-admin-action`

## Expected versions
- `AUTH-PAGE-login-current.js`: `2026-06-13-110-D`
- `PUBLIC-COMPONENT-site-shell-current.js`: `2026-06-13-110-D`
- `CORE-COMPONENT-organization-header-current.js`: `2026-06-13-110-D`
- `MEMBER-PAGE-dashboard-current.js`: `2026-06-13-110-D`
- `USER-PAGE-dashboard-current.js`: `2026-06-13-110-D`

## Test one step at a time
1. From a logged-out public page, click Log in. Confirm the URL is `/login?next=%2Fuser-dashboard`.
2. Log in as a normal member. Confirm landing page is `/user-dashboard`.
3. Confirm applicant magic-link/applicant portal still works separately.
4. Open `/user-dashboard?syncetc_debug=1` and confirm Next Club Event uses the left accent bar and still shows event image if available.
