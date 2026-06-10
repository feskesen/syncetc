SyncEtc Audit Trail - 0094-F Customer Admin Events Editor Cleanup

Date: 2026-06-09
Internal JS version: 2026-06-09-094-F

Scope:
- JS-only cleanup for the customer-admin organization events manager.

Changes:
- Removed stale post-save draft prompt actions from the left panel.
- When no event is open, current status and save buttons are hidden.
- After save/archive/restore closes the editor, the left panel shows only a short last-action confirmation.
- Save as Draft / Save & Publish buttons are visible only while editing or creating an event.
- Save buttons are disabled until minimum required sections are complete: Event Basics, Timing, and Location.
- Disabled save buttons expose a hover/title hint explaining what must be completed.
- Bottom save buttons use the same minimum-completion behavior as the left-panel save buttons.
- Left event list remains the only scrollable sidebar area and is limited to about three event cards.

Preserved:
- 0094-E no-end default restoration.
- Inline end-before-start timing warning.
- Saved-location dirty detection.
- Event image and checklist editor cleanup.
- Failed-save/validation protection so typed work is not erased.

Not included:
- Public calendar 0093 month view/list compact fixes/accent display.
- RSVP checklist claiming.
- Copy/recurring event builder.
