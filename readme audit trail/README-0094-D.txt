README-0094-D — Customer Admin Events Editor Cleanup

Goal
- Finish the event editor polish pass after 0094-C by making event-type defaults behave like a clear template, removing the right editor's internal scroll trap, and adding start/end validation.

Changes
- Bumped CUSTOMER-ADMIN-PAGE-events-current.js to internal version 2026-06-09-094-D.
- Saved event type selection now applies the saved type defaults to the current event:
  - event title
  - event type name
  - accent color
  - event image URL/path
- The editor still shows only one visible Event image field. That field now uses the selected event type image by default and can be replaced for the specific event.
- If the Event image is changed while a saved event type is selected, the reusable event-type update prompt can appear so the admin can optionally update the saved type default.
- Removed the right-hand editor's internal max-height/scroll behavior so the browser page scrolls normally. The left event list remains independently scrollable for long event lists.
- Made accordion section footers and final action buttons static/cleared so Continue/Back and Save buttons do not overlap later sections.
- Added validation to prevent an end date/time before the start date/time, and to prevent same start/end time for timed events unless No end time is checked.

Preserved
- 094-C explicit Save as Draft / Save & Publish / Archive / Restore controls.
- 094-C close-editor-after-save/archive/restore behavior.
- 094-B single visible event image control, content helpers, RSVP text, and checklist remove behavior.
- 092-F failed-save protection so validation/server errors should not wipe typed form data.

Deferred
- Event copy / recurrence builder.
- Public calendar month view and button-state fixes.
- RSVP page bring-items claiming.
