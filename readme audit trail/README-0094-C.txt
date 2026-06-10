README-0094-C — Customer Admin Events Editor Cleanup

Purpose
- Follow-up UI cleanup after 0094-B without changing SQL, Edge Functions, Webflow embeds, public calendar, RSVP page, header, or Contact Tracker.

Changes
- Replaced the left-panel status dropdown / generic Save Changes control with explicit left-panel action buttons:
  - Save as Draft
  - Save & Publish
  - Archive / Restore for existing events.
- Kept bottom Save as Draft and Save & Publish buttons.
- Successful Save as Draft, Save & Publish, Archive, or Restore now closes the editor on the right and returns to the no-event-selected state.
- Restored/clarified event type reusable-save behavior:
  - New custom event type names show a Save as new reusable event type option.
  - Changed selected event types show an Update saved event type option.
  - If no event type name is entered, the event title may be used as the candidate new type name for the reusable-type prompt.
- Selecting a saved event type fills/suggests the event title only when the title is blank or still contains the last auto-suggested title.
- Kept one visible Event Image control only.
- Preserved the failed-save protection introduced earlier so validation/server errors should not wipe typed form data.
- Made section navigation a bit more robust when moving to Checklist / bring-items.

Install
- Upload only assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js.

Expected version
- 2026-06-09-094-C
