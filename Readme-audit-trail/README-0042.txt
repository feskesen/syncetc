README-0042 — Member / Customer Admin Access Foundation

Purpose
This package pauses final Events/RSVP work and adds the missing access foundation it depends on: Supabase Auth user identity, person linkage, organization memberships, role permissions, member dashboard gating, and organization-admin gating.

Problem addressed
The prior calendar/RSVP package was too shallow because RSVP and customer event administration cannot be correct until the system knows who is logged in, which organization they belong to, whether they are a member, and whether they are a customer/organization admin. This package creates that foundation before further RSVP work.

What changed
- Adds/updates RLS helper functions:
  - core_auth_email
  - core_is_platform_admin
  - core_current_person_id
  - core_is_organization_member
  - core_has_organization_permission
  - core_is_organization_admin
- Adds member/customer-admin permissions such as member.portal.view, events.rsvp_self, organization.admin.open, access.manage_memberships.
- Updates default role permission arrays for member, board-member, organization-admin, and module-manager roles.
- Adds access views for current-user and platform diagnostics.
- Adds read RLS policies for signed-in members and organization admins while keeping mutation paths controlled through Edge Functions for now.
- Adds a new Edge Function: core-access-action, JWT ON.
- Adds platform Access Admin page for linking Supabase Auth users to people, organizations, memberships, and roles.
- Adds two gated test pages:
  - Member Dashboard
  - Organization Admin Dashboard
- Updates platform admin shell nav to include Access Admin.

Important design decision
This is not the final customer-admin UI. It is the access/gating foundation and diagnostic surface. Full customer-facing admin pages for events, documents, roster, gallery, and aircraft will be built on top of this layer later.

Security notes
- Public pages may still load static JS/HTML shells, but protected data is returned only through authenticated Edge Function calls.
- core-access-action must keep JWT verification ON.
- Existing core-public-render remains JWT OFF because it returns public-safe data only.
- Existing core-admin-action remains platform-admin-only.

Expected next step
After this access package passes testing, return to Events/Calendar/RSVP and rebuild it on top of the new member/customer-admin access layer. Customer event creation should become an organization-admin module, and RSVP should use logged-in member identity rather than typed name/email.
