README-0048 — Organization Admin People & Access Foundation

Package: people_org_admin_package_0048
Date: 2026-06-06

Purpose:
Build the first customer-facing Organization Admin People & Access page.

Files included:
- supabase/functions/core-access-action/index.ts
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-dashboard-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- webflow embeds/WEBFLOW-organization-people.txt

Changes:
1. Added Organization Admin People & Access page.
2. Added people search and filters:
   - All People
   - Active
   - Applicants
   - Waitlist
   - Onboarding
   - Former
   - Suspended / Expelled
   - Archived
3. Added clickable phone and email links.
4. Added CSV export.
5. Added print/PDF-friendly view using browser print.
6. Added person editor sections:
   - Basic info
   - Membership / access
   - Roles
   - Contact info
   - Aviation / operational profile
   - Applicant notes
   - Admin notes
7. Added Edge Function actions:
   - organization_list_access_vocabulary
   - organization_list_people
   - organization_get_person
   - organization_save_person
   - organization_send_invite
   - organization_send_password_reset
8. Updated Organization Admin Dashboard with People & Access link.
9. Updated portal shell nav with People link for organization admins.

Security notes:
- No SQL changes.
- Passwords are not editable by admins.
- Invite/reset uses Supabase Auth flows.
- People edits require organization people-management permissions.
- Role edits require access-management / super-admin level permissions.
- Restrictive lifecycle statuses require confirmation before save.
- Platform tools remain separate from customer-facing People & Access.

Testing notes:
- JavaScript syntax checks passed with node --check.
- TypeScript syntax check passed except expected remote Deno/Supabase import resolution warnings.
