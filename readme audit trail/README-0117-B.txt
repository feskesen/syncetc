SYNCETC 0117-B — Aircraft Requirement Clarity + Pilot Readiness

Version: 2026-06-17-117-B
Package date: 2026-06-17

Install/deploy order:
1. Deploy supabase/functions/core-access-action/index.ts
2. Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
3. Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js

Changed files:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt

No SQL migration in this package.
No Webflow embed changes.

Purpose:
Clarify the aircraft-side requirements screen and make the qualified pilots view evaluate aircraft checkout records against the organization-wide and aircraft-specific requirements.

Changes:
- Separates inherited organization-wide requirements from aircraft-specific requirements.
- Organization-wide requirements are displayed as locked/inherited rows and are not selectable on the aircraft page.
- Aircraft-specific requirements remain editable on the aircraft page.
- Replaces the misleading “Currently authorized pilots” summary with readiness-focused counts.
- Qualified pilots table now shows:
  - Aircraft checkout state
  - Requirement status
  - Ready / Needs attention result
- Edge Function now includes each qualified pilot’s qualification assignments in the aircraft-admin payload so the aircraft page can evaluate missing/expired required qualifications.
- Existing person-to-aircraft checkout source of truth remains core_person_asset_checkouts.
- Existing qualification source of truth remains core_person_qualification_assignments.
- No reservation blocking/enforcement is added yet.

Expected versions:
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-17-117-B
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-17-117-B
- core-access-action/index.ts: 2026-06-17-117-B

First test:
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=assets-aircraft

Test steps:
1. Open Assets / Aircraft.
2. Select an aircraft.
3. Open Requirements / Qualified Pilots.
4. Confirm Medical Certificate / Flight Review / Organization Checkout, or other organization-wide reservation requirements, appear in a locked organization-wide section.
5. Confirm aircraft-specific requirements such as High Performance, Complex, Tailwheel, IFR Checkout, etc. remain selectable.
6. Save the aircraft and reload.
7. Confirm Qualified pilots shows Ready / Needs attention rather than only “Currently authorized.”
8. Confirm pilots missing or expired required qualifications show Needs attention.

Validation performed:
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for Aircraft Admin.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.
