SyncEtc Website Rebuild — Audit Trail README-0089-D
Package: RSVP Page UI Cleanup
Internal Version: 2026-06-09-089-D

Purpose:
- Polish the RSVP page after RSVP People Integration 0088.
- Keep this as a UI-only patch that does not change the event/RSVP data model.

Changes:
- Updated assets/public/PUBLIC-PAGE-event-rsvp-current.js.
- RSVP page now inherits organization styling using the active style profile when available.
- Removed hardcoded blue visual treatment from the RSVP page.
- Made the layout more compact.
- Updated Yes / Maybe / No controls:
  - Yes uses green styling.
  - Maybe uses yellow styling.
  - No uses red styling.
  - Unselected states are light; selected states are dark.
- Moved “I am attending personally” into the same RSVP choice area.
- Removed the explanatory “linked to member/person record” text.
- Cleaned up RSVP summary table labels, including clearer “No response” display.

Not included:
- No event creator/customer-admin event manager changes.
- No event needs/bring-items feature yet.
- No saved locations or saved event types yet.
- No SQL changes.
- No Edge Function changes.

Testing:
- Test /event-rsvp as a logged-in member.
- Test /event-rsvp as a logged-out public visitor only where public RSVP is allowed.
- Confirm styling follows the organization theme.
- Confirm Yes/Maybe/No selection, guest counts, notes, save, and summary still work.
