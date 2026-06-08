README-0071 — My Profile contact field cleanup
Version: 2026-06-08-024-B

Files changed:
- assets/user/USER-PAGE-profile-current.js
- supabase/functions/core-access-action/index.ts

Purpose:
- Improve My Profile contact section layout and self-service fields.
- Keep membership/access fields read-only for user self-service.
- Preserve photo upload, email-change request, inherited styling, and existing header/shell behavior.

Changes:
- Added Middle name / initial field.
- Added Suffix field.
- Added Emergency contact name.
- Added Emergency contact relationship.
- Added Emergency contact phone.
- Added mobile "Can receive texts" checkbox.
- Changed phone selector label from Primary to Preferred.
- Moved last-name helper text under the last-name field only.
- Removed vague "Access fields remain controlled by your organization" wording.
- Contact hero now says membership/access settings are managed separately.

Storage:
- New fields are stored in core_people.profile_json.name and core_people.profile_json.contact.
- No SQL migration was required.

Notes:
- This does not add BasicMed, medical, Flight Review, or pilot credential workflows.
- Those should be a separate Pilot Credentials / Currency module later.
