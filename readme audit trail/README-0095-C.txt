README-0095-C
SyncEtc / OneSource Aviation Website Rebuild
Package: RSVP / Calendar Modal Hotfix
Date: 2026-06-10

Purpose
- Hotfix the 0095-B RSVP Edge Function failures without rolling back checklist/bring-items claiming.
- Keep claimant display names where safely available, but never allow name lookup failure to crash RSVP pages.
- Adjust the public calendar event detail modal so the event accent only brackets the hero/header instead of outlining the entire modal.

Changed files
- assets/public/PUBLIC-PAGE-event-rsvp-current.js
- assets/public/PUBLIC-PAGE-calendar-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-public-render/index.ts

Versions
- PUBLIC-PAGE-event-rsvp-current.js: 2026-06-09-095-C
- PUBLIC-PAGE-calendar-current.js: 2026-06-09-093-D
- core-access-action: 2026-06-09-095-C
- core-public-render: 2026-06-09-095-C

Notes
- No SQL changes.
- No Customer Admin Events Manager changes.
- No Contact Tracker changes.
- No header/public shell changes.
- The person/name lookup now uses conservative columns and gracefully falls back to respondent name, respondent email, claimed email, or "Claimed".
- RSVP claim-name lookup degrades safely if optional RSVP/person columns are unavailable.
