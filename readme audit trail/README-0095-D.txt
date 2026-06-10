README-0095-D — RSVP / Event Detail Accent Cleanup

Purpose:
Remove event accent color from the RSVP page and the calendar event-detail modal, while preserving event accent color on the calendar surfaces where it is useful.

Why:
The event accent is useful in the calendar list/compact/month view, especially for multi-day ribbons. It adds clutter on the RSVP page and event detail modal, where the organization/customer style should remain the visual theme.

Changed files:
- assets/public/PUBLIC-PAGE-calendar-current.js
- assets/public/PUBLIC-PAGE-event-rsvp-current.js

No SQL or Edge Function changes.

Version expectations:
- Calendar: 2026-06-09-093-E
- RSVP: 2026-06-09-095-D

Rollback:
Reinstall the prior 0095-C JS files if needed.
