SYNCETC 0116-N — Assign Qualifications to People

Purpose
- Make People → Members / People → Aviation / Qualifications operational by assigning qualification/check-out definitions to individual people.
- Builds on 0116-M, which created the organization-level qualification/check-out definition list.

Install / deploy order
1. Run SQL:
   supabase/sql/0116-N-person-qualification-assignments.sql
2. Deploy Edge Function:
   supabase/functions/core-access-action/index.ts
3. Upload GitHub assets:
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-N
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-N
- core-access-action/index.ts: 2026-06-16-116-N

Database changes
- Adds public.core_person_qualification_assignments.
- Assignments are organization-scoped and tied to a specific organization membership/person.
- Tracks qualification definition, assignment status, issued date, expiration date, notes, and archive state.
- Uses service_role access only; no anon/authenticated direct table grants.

Frontend changes
- Members / People → Aviation / Qualifications now includes a Qualifications & Checkouts assignment section.
- Admins can add/remove assigned qualifications, set status, issued date, expiration date, and notes.
- Existing aviation detail fields remain in place.
- People search includes assigned qualification labels and keys.

Edge Function changes
- organization_list_people now returns qualification_assignments, qualification_keys, and qualification_labels for each person/membership.
- organization_get_person inherits the same enriched assignment data.
- organization_save_person replaces the selected person's active qualification assignments when saved from the People editor.

What this does not do yet
- No document upload for qualification proof.
- No automated expiration warnings.
- No dispatch/reservation enforcement.
- No aircraft-specific checkout enforcement.

First tests
1. Open:
   https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members
2. Select a person.
3. Open Aviation / Qualifications.
4. Assign a qualification such as Medical Certificate or Night Checkout.
5. Save.
6. Reopen the person and confirm the assignment persists.
7. Search for the qualification label and confirm the person can be found.

Regression tests
- People → Instructors / Qualifications still opens and edits definitions.
- People → Members / People still saves ordinary identity/contact/membership changes.
- People → Groups / Roles and Permissions still open.

Validation performed by package builder
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.
