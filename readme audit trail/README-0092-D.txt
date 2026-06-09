SyncEtc Audit Trail README-0092-D

Package: syncetc-customer-admin-events-manager-0092-D.zip
Date: 2026-06-09
Scope: Customer Admin Events Manager JS-only cleanup.

Changed file:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js

Internal version:
- 2026-06-09-092-D

Purpose:
- Continue cleanup of /organization-events after 0092-C.
- Remove confusing Hidden status from normal UI.
- Add clearer Draft save warning and Publish-now path.
- Fix help tooltip clipping by rendering tooltip at page/body level.
- Clean RSVP rules layout and prevent RSVP audience from overlapping RSVP close time controls.
- Add No RSVP close date checkbox that disables RSVP close date/time controls until unchecked.
- Add map preview from written address, with advanced map query/embed override fields.

Notes:
- No SQL migration.
- No Edge Function change.
- No public calendar/RSVP page/header/contact-tracker changes.
- Checklist/bring-items remains intentionally hidden for a later package, but existing data is preserved in saves.
