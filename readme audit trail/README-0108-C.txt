# SyncEtc 0108-C — Applicant Portal Logout Redirect Hotfix

## Purpose
Small UX hotfix after 0108-A/0108-B header/nav recipe foundation testing.

Applicant logout was technically working, but it left the user on the applicant portal request-link screen. That felt like nothing happened. This patch makes applicant-context logout redirect to the public home page after Supabase sign-out succeeds.

## Changed files

- `assets/core/CORE-COMPONENT-portal-shell-current.js`

## Install

Upload this file to GitHub:

- `assets/core/CORE-COMPONENT-portal-shell-current.js`

## Do not run SQL

No SQL is included or required.

## Do not redeploy Edge Functions

No Supabase Edge Function redeploy is required for this patch.

## Expected version

- `CORE-COMPONENT-portal-shell-current.js`: `2026-06-12-108-C`

## Behavior

When the portal shell logs out from an applicant context, it now:

1. Calls Supabase `auth.signOut()`.
2. Clears shell auth state.
3. Dispatches the existing `syncetc:portal-auth-changed` event.
4. Redirects the browser to `/`.

This redirect is intentionally limited to applicant context:

- `state.mode === "applicant"`, or
- access row says applicant, or
- the current path is `/applicant-portal`.

Other member/admin portal logout behavior is not intentionally changed.

## Test

1. Log in as an applicant.
2. Open `/applicant-portal?syncetc_debug=1`.
3. Click `Log out`.
4. Expected: browser lands on `https://syncetc.webflow.io/`.
5. Open `/applicant-portal?syncetc_debug=1` again.
6. Expected: applicant details are no longer visible; the request-link screen appears.

