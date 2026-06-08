README-0070 — My Profile MVP

Version: 2026-06-08-024-A

Purpose:
- Adds user-facing My Profile page.
- Users can update safe self-service contact fields.
- Users can upload/replace/remove their own profile photo.
- Membership/access fields remain read-only.
- Login email change is confirmation-based and records pending request metadata.

Files:
- supabase/sql/MY-PROFILE-TEMPLATE-0070.sql
- supabase/functions/core-access-action/index.ts
- assets/user/USER-PAGE-profile-current.js
- webflow embeds/WEBFLOW-user-my-profile.txt

Notes:
- No header/shell files changed.
- No roster JS changed.
- My Profile must be enabled/published in Page Setup before normal user navigation shows it.
- Pilot credentials, BasicMed, medicals, and Flight Review are intentionally deferred to a later module.
