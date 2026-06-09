README-0092-C — Customer Admin Events Manager UI Cleanup

Internal version: 2026-06-09-092-C

Scope:
- JS-only customer-admin Events Manager cleanup.
- Moves event status/save/archive controls to the left control panel.
- Removes sticky top save bar and duplicate bottom save controls.
- Adds reusable hover/focus help icons for confusing controls.
- Makes event list search include formatted dates and event keys.
- Keeps New Event, filters, and event list in the left panel.
- Keeps the event form in the right panel.
- Hides membership class/role checkboxes unless RSVP audience requires them.
- Moves Sort Order to an Advanced section near the bottom.
- Makes saved-location selection overwrite location fields immediately, including map embed URL.
- Keeps checklist/bring-items hidden while preserving existing checklist data on save.

Not included:
- No SQL changes.
- No Edge Function changes.
- No public calendar changes.
- No RSVP page changes.
- No header/contact tracker changes.
- No drag-and-drop image upload yet.
- No bring-items claiming workflow yet.
