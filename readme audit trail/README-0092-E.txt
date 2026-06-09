README-0092-E
Customer Admin Events Manager JS-only cleanup.

Internal Version:
2026-06-09-092-E

Scope:
- Preserve event form data on validation/backend save errors.
- Add client-side validation before save.
- Keep Save Changes button state as Saving... only during real save attempts.
- Show validation/backend save messages in the left control panel without re-rendering the editor.
- Simplify attendee list visibility to one checkbox: Show RSVP list to logged-in users.
- Admins/organizers are still intended to always see RSVP details.
- Default RSVP audience for new events is Public.
- Add duplicate-name protection for reusable event types and reusable locations.
- Clarify reusable type/location helper text.
- Preserve 0092-D changes: no Hidden status in normal UI, draft warning, no RSVP close date, map preview, advanced map options, tooltip fixes, hidden checklist UI.

Explicitly not included:
- Drag-and-drop image upload.
- Checklist / bring-items claiming.
- Event copy / recurring copy generator.
- Archive/deactivate saved reusable locations or event types; that likely needs Edge Function and/or SQL action support.
