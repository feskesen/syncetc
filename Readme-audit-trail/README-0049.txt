README-0049 — Organization People UX + Role Safety

Package: organization_people_ux_role_safety_package_0049.zip
Internal versions:
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-07-006-A
- core-access-action/index.ts: 2026-06-07-006-A

Purpose:
- Improve Organization Admin People & Access page UX.
- Replace two-column layout with top people finder + full-width editor.
- Make person cards compact, uniform, and clickable anywhere.
- Move search/filter into the people finder area.
- Add email and phone validation.
- Move primary phone selection into Contact Info via radio selection.
- Rename internal notes to clarify they are not visible to the person.
- Order roles by hierarchy.
- Allow Organization Admins to edit ordinary roles.
- Keep Organization Admin / Organization Super Admin role assignment locked unless elevated access is present.
- Add Non-member / Limited User membership class for existing and future organizations.

Files to use:
- supabase/sql/ORGANIZATION-PEOPLE-UX-ROLE-SAFETY.sql
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

No Webflow embed change required.
No dashboard file change required.
