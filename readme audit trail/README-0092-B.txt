README-0092-B — Customer Admin Events Manager UX Correction

Purpose:
This patch corrects the first-pass Events Manager UI after live testing.

Changes:
1. Added New Event workflow in the left browser panel.
2. Page now opens with no event selected, instead of auto-loading the first event.
3. Left panel now includes search/status/date/type filters.
4. Desktop layout now behaves as two panels: event browser on the left and event editor on the right.
5. Right editor has a sticky action bar at the top.
6. Save controls are visible at top and duplicated at bottom for convenience.
7. Status is controlled by a dropdown in the editor action bar.
8. Event key is read-only and auto-generated/previewed for new events.
9. New events default to Draft.
10. Replaced datetime-local fields with separate date, hour, minute, and AM/PM controls.
11. Added All-day event and No end time controls.
12. Added real color picker for event accent color.
13. Added map helper controls.
14. Hid checklist/needed-items UI for this pass while preserving existing needed-items records on save.

Deferred:
- Drag-and-drop image upload.
- Supabase Storage bucket/policies for uploaded event images.
- Full checklist/bring-items claiming workflow.
- Dedicated event-type manager polish.
- Dedicated saved-location manager polish.
- Full RSVP invite/no-response audience workflow.

Install:
Upload only assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js.
