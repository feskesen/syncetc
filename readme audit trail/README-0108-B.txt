# SyncEtc 0108-B — Public Render organizationId Hotfix

## Purpose

Fixes a regression introduced during 0108-A Header/Nav Recipes Foundation where several public page payload builders attempted to read applicant portal settings using `organizationId` before that local variable was declared.

Observed symptom:

- Public home page shows STYLE CONFIGURATION ERROR.
- Debug panel says: `renderError:start — organizationId is not defined`.

## Scope

Changed file only:

- `supabase/functions/core-public-render/index.ts`

## What changed

Added the missing local variable declaration:

```ts
const organizationId = String(organization.organization_id);
```

in these public payload builders before calling `getApplicantSettingsPublic0107(...)`:

- Home
- Gallery
- Info
- Documents
- Calendar

Also bumped `core-public-render` internal version to:

- `2026-06-12-108-B`

## Install

Redeploy only this Supabase Edge Function:

- `core-public-render`

## Do not run

- Do not run SQL.
- Do not redeploy `core-access-action`.
- Do not redeploy `core-admin-action`.
- Do not upload any GitHub assets for this hotfix.

## Test URLs

After redeploying `core-public-render`, test:

- `https://syncetc.webflow.io/?syncetc_debug=1`
- `https://syncetc.webflow.io/calendar?syncetc_debug=1`
- `https://syncetc.webflow.io/apply-now?syncetc_debug=1`
- `https://syncetc.webflow.io/applicant-portal?syncetc_debug=1`

Expected result:

- Public pages no longer show `organizationId is not defined`.
- Existing style profile loads normally.
- Header/nav recipe foundation remains installed.
- Applicant portal remains working from 0107-F/G.
