# 0108-F Apply / Update Application Precheck and Applicant Portal Continuation Flow

Internal version: 2026-06-12-108-F

## Purpose

Adds the applicant intake front-door flow:

Apply / Update Application
→ basic identity precheck
→ detect active/prior possible application
→ route strong active matches to Applicant Portal
→ allow clean new applications when no match is found
→ allow possible/prior matches to continue while flagging for admin review

The Applicant Portal remains the secure continuation layer. Public pages do not show application details or stage/status until the applicant authenticates through the portal.

This package also includes the small public-header regression fix discovered during testing: if an applicant-only auth session clicks from Applicant Portal to a public page, the public shell now treats the backend `applicant_access_only` response as "public navigation only" instead of rendering "Navigation unavailable." Public pages stay public while member/admin links remain unavailable.

## Changed files

- assets/public/PUBLIC-PAGE-apply-current.js
- assets/public/PUBLIC-COMPONENT-site-shell-current.js
- supabase/functions/core-public-render/index.ts
- readme audit trail/README-0108-F.txt

## Install

1. Upload to GitHub:
   - assets/public/PUBLIC-PAGE-apply-current.js
   - assets/public/PUBLIC-COMPONENT-site-shell-current.js

2. Redeploy Supabase Edge Function:
   - core-public-render

## Do not deploy / do not run

- Do not run SQL.
- Do not redeploy core-access-action.
- Do not redeploy core-admin-action.
- Do not upload portal shell, organization header, applicant portal JS, or other assets unless separately changed.

## Expected versions

- PUBLIC-PAGE-apply-current.js: 2026-06-12-108-F
- PUBLIC-COMPONENT-site-shell-current.js: 2026-06-12-108-F
- core-public-render: 2026-06-12-108-F

## Behavior

### New applicant / no active match

The Apply Now page first asks for:

- First name
- Last name
- Date of birth
- Email
- Phone

If no active application match is found, the full application form opens with those fields prefilled.

### Strong active match

If the precheck strongly matches an active application by date of birth + email or date of birth + phone, the public page does not open a duplicate full application. It routes the applicant toward the secure Applicant Portal and can request a secure login link.

### Possible active match

If the precheck only possibly matches an active application, for example same name/date of birth but different email/phone, the applicant may continue, but the new application is flagged for admin review through duplicate_check_json / needs_attention.

### Prior/archived match

If the precheck matches a prior/closed/archived application, the applicant may continue as a likely reapplication. The new application is flagged for admin review through duplicate_check_json / needs_attention.

### Submit safety

The backend repeats the precheck during final submit. A strong active match is blocked even if the frontend is bypassed.

### Applicant-only auth on public pages

If an applicant-only user leaves the applicant portal by clicking a public page link, public pages still render normally with public navigation. The backend refusal for member/admin access is not shown as a public navigation error.

## Privacy behavior

The public precheck may say that the submitted identity appears to match an existing/prior application, because the user has entered multiple pieces of identifying information. It does not expose application details, internal stage, status, notes, documents, tasks, or uploads. Those remain behind secure applicant portal login.

## Test URLs

- https://syncetc.webflow.io/apply-now?syncetc_debug=1
- https://syncetc.webflow.io/applicant-portal?syncetc_debug=1
- https://syncetc.webflow.io/?syncetc_debug=1
- https://syncetc.webflow.io/calendar?syncetc_debug=1

## Test plan

1. Open Apply Now with debug enabled.
2. Confirm the first screen is the precheck screen, not the full application form.
3. Enter new applicant identity data that should not match an active application.
   - Expected: full application form opens with first name / last name / DOB / email / phone prefilled.
4. Enter identity data for the known active test applicant.
   - Expected: full application form does not open; page routes to Applicant Portal / secure login link request.
5. Complete a brand-new test application only if you want another test row.
   - Expected: success screen includes a Go to Applicant Portal button.
6. Confirm nav-away protection still appears if leaving the full application form after edits.
7. Confirm Applicant Portal still loads and applicant-only security still works.
8. While logged in as applicant, click Home / Calendar / Apply Now from the Applicant Portal header.
   - Expected: public pages render normally; no "Navigation unavailable" message.
9. Confirm the applicant still cannot access member/admin pages.

## Notes

This is not the final customer-facing wording polish. It is the workflow foundation. Later settings can control how much status/next-step detail is shown inside the Applicant Portal.
