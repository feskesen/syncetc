README-0044.txt
SyncEtc / OneSource Aviation
Package: access_model_separation_foundation_package
Internal Version: 2026-06-06-004-C

PURPOSE
This package secures the next access foundation step before Calendar/RSVP, roster import, member-only documents, or scheduler integrations.

It keeps core_membership_status_definitions as the compatibility lifecycle/access-status table for now, then adds separate organization-configurable tables for:
- membership classes / types;
- application / onboarding stages;
- future event RSVP audience rules.

WHY THIS EXISTS
The prior access seed function mixed membership classes into membership statuses. Examples: full-member, probationary-member, family-member, honorary-member. That is wrong because a person can be an active family member, a suspended family member, a former honorary member, etc. The correct split is:
- lifecycle status: applicant, invited, pending, active, inactive, suspended, expelled, former, archived;
- membership class: full member, probationary member, family member, honorary member, or organization-specific custom classes;
- application/onboarding stage: waitlist, interview invited, interviewed, invited to join, onboarding, etc.;
- roles/permissions: what the person can do;
- RSVP audience: event-specific eligibility.

FILES INCLUDED
1. SQL
   supabase/sql/ACCESS-MODEL-SEPARATION-FOUNDATION.sql
   supabase/sql/ACCESS-AUDIT-QUERIES.sql
   supabase/sql/ROLLBACK-NOTES.txt

2. Edge Function
   supabase/functions/core-access-action/index.ts

3. GitHub-hosted JS assets
   assets/core/CORE-COMPONENT-admin-shell-current.js
   assets/core/CORE-COMPONENT-portal-shell-current.js
   assets/user/USER-PAGE-dashboard-current.js
   assets/member/MEMBER-PAGE-dashboard-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-dashboard-current.js
   assets/admin/ADMIN-PAGE-access-admin-current.js

4. Webflow embeds
   webflow embeds/WEBFLOW-user-dashboard.txt
   webflow embeds/WEBFLOW-organization-admin-dashboard.txt
   webflow embeds/WEBFLOW-platform-access-tools.txt
   webflow embeds/WEBFLOW-password-reset.txt

DEPLOYMENT ORDER
1. Supabase SQL Editor:
   Run supabase/sql/ACCESS-MODEL-SEPARATION-FOUNDATION.sql.

2. Supabase SQL Editor:
   Run supabase/sql/ACCESS-AUDIT-QUERIES.sql and confirm:
   - core_membership_class_definitions has rows per organization;
   - core_application_stage_definitions has rows per organization;
   - old full-member/family-member/probationary-member/honorary-member memberships have moved to lifecycle active plus membership_class_key;
   - old waitlist/onboarding memberships have moved to lifecycle applicant/pending plus application_stage_key;
   - no active membership rows still point to old class/status rows.

3. Supabase Edge Functions:
   Deploy supabase/functions/core-access-action/index.ts to the existing core-access-action Edge Function.
   JWT verification must remain ON.

4. GitHub:
   Upload/replace the included assets files at their exact paths.

5. Webflow:
   The existing embeds should already match, but the current .txt embeds are included for copy/paste reference.

IMPORTANT SECURITY NOTES
- No separate admin login is created. Supabase Auth remains the single login source.
- The Edge Function verifies JWT, resolves the auth user, person link, organization memberships, statuses, classes, stages, roles, and permissions.
- Platform Access Tools remain platform-admin-only.
- Restricted lifecycle statuses block normal access even if roles are present.
- Public render functions are not changed and must continue to return public-safe data only.
- Member-only documents and full RSVP rebuild are intentionally deferred until this access foundation is tested.

WHAT CHANGED IN SQL
- Adds core_membership_class_definitions.
- Adds core_application_stage_definitions.
- Adds nullable references to core_organization_memberships for membership_class_definition_id and application_stage_definition_id.
- Adds future RSVP foundation tables core_event_audience_rules and core_event_invitees.
- Replaces the default access seed function so future organizations receive separated lifecycle statuses, classes, stages, and roles.
- Hardens core_is_platform_admin by checking archived_at is null.
- Adds lifecycle-blocking behavior so suspended/expelled/archived/blocked override roles.
- Preserves old mixed status rows as legacy records instead of deleting them.

WHAT CHANGED IN THE EDGE FUNCTION
- Adds separated access context returned to dashboards:
  lifecycle_status_key / label / category;
  membership_class_key / label / dues behavior / privilege notes;
  application_stage_key / label / category;
  capabilities;
  style_profile.
- Adds get_user_dashboard as the preferred action while preserving get_member_dashboard as a compatibility alias.
- Adds get_organization_admin_dashboard as the preferred action while preserving get_customer_admin_dashboard as a compatibility alias.
- Makes auth-created person records non-privileged by default instead of misleadingly active.
- Allows explicit empty role_keys to remove old roles during platform membership update.
- Checks core_admin_users.archived_at is null when confirming platform admin.

WHAT CHANGED IN USER/ORG ADMIN UI
- User Dashboard now displays lifecycle status, membership class, application stage, roles, and capabilities.
- Organization Admin Dashboard now inherits the selected organization style profile after access context resolves.
- Organization Admin UI wording replaces customer/member language where visible.
- Backend result panels are collapsed by default on portal pages.

WHAT CHANGED IN PLATFORM ACCESS TOOLS
- Shows SyncEtc platform logo/colors.
- Adds separate selectors for lifecycle status, membership class, and application/onboarding stage.
- Updates affiliation table columns to show lifecycle, class, stage, roles, and permissions.
- Keeps visible button feedback.

WHAT THIS DOES NOT DO
- It does not rebuild Calendar/RSVP.
- It does not expose member-only document rendering.
- It does not import the 150th roster.
- It does not hardcode 150th Aero Flying Club logic.
- It does not create a final customer-facing roster manager.

TEST PLAN
Test these in order:
1. Platform admin can log into Platform Access Tools.
2. Platform admin can seed self as organization admin for a selected test organization.
3. Platform admin can create/link a person with lifecycle active, class full-member, role member.
4. User Dashboard loads for that person after login.
5. Organization Admin Dashboard loads only for a person with organization-admin or equivalent permission.
6. Suspended/expelled lifecycle statuses block portal/admin access even if roles remain assigned.
7. A login with no linked organization shows a clear no-access message.
8. A user with multiple organizations can switch organization context.
9. User and Organization Admin dashboards inherit organization style profile.

ROLLBACK
Preferred rollback is a Supabase backup restore plus reverting the JS/Edge Function files. See supabase/sql/ROLLBACK-NOTES.txt for manual emergency notes.


004-C PATCH NOTE
The SQL was patched after Supabase rejected the new lifecycle seed against the existing core_membership_status_definitions_lifecycle_check constraint. The replacement SQL now broadens the compatibility check and uses grouped lifecycle_category values for applicant/invited/pending while keeping status_key as the canonical lifecycle status. If the 004-A SQL failed before commit, run the full 004-C replacement SQL from the beginning.
