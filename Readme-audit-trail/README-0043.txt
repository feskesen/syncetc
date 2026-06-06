README-0043.txt
SyncEtc / Website Rebuild — Access/Auth Flow Repair

Purpose
This package repairs the first access foundation pass after testing showed confusing workflows around user login, password reset, generic organization status language, and platform access tooling.

What changed
- Renamed the access tool conceptually to Platform Access Tools.
- Clarified that this is an internal/platform bootstrap and diagnostic tool, not the normal way every customer user will be managed.
- Renamed the member-facing dashboard to User Dashboard while preserving a compatibility member-dashboard embed/file.
- Added a dedicated password reset page.
- Added Create Account / Forgot Password controls to user and organization-admin dashboard login panels.
- Added platform admin account tools to request a password reset or invitation/sign-up email.
- Added strong visible button feedback for actions like seed self, save affiliation, invite, reset, search, refresh, and login.
- Added organization-neutral status definitions: active, pending, invited, applicant, inactive, suspended, expelled, former, archived.
- Kept expelled distinct from suspended/inactive/former and marked it as requiring admin review with no login/portal access.
- Kept one-login architecture: Supabase Auth login first, then roles/permissions decide whether the person sees user, organization-admin, or platform-admin tools.

What this does not do
- Does not finalize customer-facing roster management.
- Does not finalize Apply Now onboarding.
- Does not finalize Calendar/RSVP.
- Does not create separate logins for members/admins.
- Does not remove legacy aviation/club labels; it adds generic defaults and makes the UI less club-specific.

Expected next
After this passes, rebuild Calendar/RSVP on top of this access layer rather than treating RSVP as a public test form.
