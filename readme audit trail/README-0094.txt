README-0094.txt
Audit trail: Customer Admin Events Pro Extensions

Package: 0094
Internal JS version: 2026-06-09-094-A
Edge Function version: 2026-06-09-094-A

Purpose:
Adds Pro-level extensions to the customer-admin Events Manager while preserving the 092-I guided editor behavior.

Included changes:
1. Added drag-and-drop / file-picker event image upload.
2. Added drag-and-drop / file-picker event type default image upload.
3. Added event image preview and clear controls.
4. Added backend image upload action through core-access-action using service-role storage access.
5. Added additive SQL fields for event image storage paths/metadata.
6. Added checklist / bring-items editor foundation in the event creator.
7. Added additive claim table foundation for later RSVP-page item claiming.
8. Removed the empty Advanced accordion from the UI.
9. Kept event visibility per event, not locked to event type.
10. Preserved 092-I behavior: draft warning, guided accordion flow, required basics/timing/location, no failed-save form wipe, no-blue-flash portal shell pattern.

Files included:
- supabase/sql/0094-customer-admin-events-pro-extensions.sql
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js
- INSTALL-0094.txt
- PACKAGE-MANIFEST-0094.txt

Notes:
- Image upload is routed through core-access-action; no Supabase service role key is exposed to the browser.
- The image upload uses the existing core-assets bucket.
- Checklist/bring-items claiming from the RSVP page is intentionally left for a later package.
- Public calendar month view and calendar button-state fixes are intentionally left for a later package.
