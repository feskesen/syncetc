README 0095-B — RSVP / Calendar Modal Visual Polish

Purpose:
- Polish the RSVP page and calendar event detail modal so organization/customer color remains the primary theme and event color is used only as an accent.
- Replace the RSVP page Return to Calendar button with an X close control.
- Make Escape return to the calendar from the RSVP page.
- Return to the calendar after a successful RSVP save.
- Show calculated/display names rather than email addresses in bring-items claim summaries when claim names are allowed.

Changes:
- RSVP page now uses organization color for hero/buttons and event color as top/left/right accent.
- RSVP page close button returns to /calendar or a safe return parameter.
- RSVP save succeeds, shows confirmation briefly, then returns to calendar.
- Calendar event detail modal hero now uses organization color; event accent is a bracket/border only.
- Calendar modal RSVP button uses organization action styling rather than event accent color.
- Bring-items claimed-by display prefers person/display name, then respondent name, then email fallback.
- Public checklist claim names are returned when the RSVP/attendee-list setting allows names to be visible; otherwise generic Claim appears.

No SQL changes.
