SYNCETC 0117-C — Reservation Eligibility Preview
Generated: 2026-06-17

Purpose
- Add a reservation eligibility preview layer before enforcing reservation blocking.
- Show aircraft-readiness from both directions:
  - Members / People: what each person appears ready to reserve.
  - Assets / Aircraft: which qualified pilots appear ready for a selected aircraft.

Install / deploy order
1. Deploy Supabase Edge Function:
   supabase/functions/core-access-action/index.ts

2. Upload GitHub Pages assets:
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

No SQL migration is included in this package.
No Webflow embed changes are required.

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-17-117-C
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-17-117-C
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-17-117-C
- core-access-action/index.ts: 2026-06-17-117-C

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
  - Bumped module expectations for People and Aircraft to 117-C.

- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
  - Updated Qualified Pilots heading/copy to frame the view as a reservation preview.

- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
  - Added aircraft reservation preview to Members / People → Aviation / Qualifications → Aircraft checkouts.
  - Each aircraft row now shows Ready to reserve or Needs attention.
  - Preview checks general organization-wide qualification requirements, aircraft-specific requirements, and specific aircraft checkout when required.
  - The aircraft preview uses existing qualification assignments and existing person-aircraft checkout records.

- supabase/functions/core-access-action/index.ts
  - People vocabulary payload now includes active aircraft qualification requirements so the People page can preview aircraft readiness.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for Aircraft Admin.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.

First tests
1. People-side preview:
   https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members
   - Select a person.
   - Open Aviation / Qualifications.
   - Review Aircraft checkouts.
   - Confirm each aircraft row shows Ready to reserve or Needs attention.
   - Change qualification values or checkout validity and confirm the preview updates after save/reload.

2. Aircraft-side preview:
   https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=assets-aircraft
   - Select an aircraft.
   - Open Requirements / Qualified Pilots.
   - Confirm the section says Qualified pilots / reservation preview.
   - Confirm pilot rows still show Ready or Needs attention.

Notes
- This package previews eligibility only.
- It does not block reservations.
- It does not add a reservation calendar or dispatch workflow.
- It preserves the single source of truth:
  - core_person_qualification_assignments = person qualifications/checkouts.
  - core_asset_qualification_requirements = aircraft requirements.
  - core_person_asset_checkouts = person-to-aircraft authorization/checkouts.
