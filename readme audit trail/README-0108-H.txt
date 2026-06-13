# SyncEtc 0108-H — Apply Now New/Returning Applicant Copy + Email-on-File Portal Link

## Purpose

Focused polish for the Apply Now / applicant continuation flow after 0108-F/0108-G testing.

This pass keeps the working precheck and duplicate-prevention logic, but changes the default UI framing so the left card is clearly for new applicants and the right card is clearly for returning applicants.

It also adds a safer email-on-file portal-link action: when the precheck identifies a likely existing application, the page shows only a masked email hint and can request a secure portal link to the email address already on file. It does not let unauthenticated applicants reset/change the email address from the public precheck screen.

## Files changed

- `assets/public/PUBLIC-PAGE-apply-current.js`
- `assets/user/USER-PAGE-applicant-portal-current.js`
- `supabase/functions/core-public-render/index.ts`

## Versions

- `PUBLIC-PAGE-apply-current.js`: `2026-06-12-108-H`
- `USER-PAGE-applicant-portal-current.js`: `2026-06-12-108-H`
- `core-public-render`: `2026-06-12-108-H`

## Install

Upload to GitHub:

- `assets/public/PUBLIC-PAGE-apply-current.js`
- `assets/user/USER-PAGE-applicant-portal-current.js`

Redeploy Supabase Edge Function:

- `core-public-render`

Do not run SQL.
Do not redeploy `core-access-action` or `core-admin-action`.
Do not upload other assets unless separately changed.

## Behavior changes

### Apply Now first screen

Left card now says:

- `New applicant?`
- `Begin the application process here`

The text explains that first-time applicants should enter their information accurately, and that the system checks for an existing application before asking for the rest of the application.

The primary button now says:

- `Begin application`

Right card now says:

- `Already applied?`
- `View or update your application`

It explains that returning applicants should use the Applicant Portal and the same email address used when applying. It also tells users who forgot the email address that the left-side precheck may show a partial hint if a likely application is found.

### Existing application match

When a likely active application is found:

- the duplicate full form is not opened;
- the page shows a masked email hint such as `f*********@i********.com`;
- the secure link button sends to the email already on file, not the newly entered email;
- the page tells the user to use Contact if they no longer have access to the email on file.

### Email changes

Unauthenticated users cannot reset/change the email address from the public Apply Now precheck screen. If they no longer have access to the email on file, they are directed to Contact so the organization can verify and update the record.

### Applicant Portal request screen

The request-link helper text now explains that returning applicants should use the same email from the application and should contact the organization if they no longer have access to the email address on file.

## Test URLs

- `https://syncetc.webflow.io/apply-now?syncetc_debug=1`
- `https://syncetc.webflow.io/applicant-portal?syncetc_debug=1`

## Test checklist

1. Open Apply Now.
2. Confirm the left card says `New applicant?` and `Begin the application process here`.
3. Confirm the right card says `Already applied?` and `View or update your application`.
4. Enter a new unique identity and confirm the full application opens.
5. Enter known active applicant identity and confirm duplicate form does not open.
6. Confirm a masked email hint appears.
7. Click `Send secure link to email on file` and confirm the neutral success message appears.
8. Confirm the secure link email is sent to the email already on file.
9. Open Applicant Portal logged out and confirm the helper text no longer suggests portal access is optional.
10. Confirm no public unauthenticated workflow lets the applicant change/reset the email address.

