README-0092-G — Customer Admin Events Manager draft reminder + accordion polish

Reason:
The default New Event status remains Draft for safety, but it needed to be much harder to miss because Draft events do not appear on the public calendar. The editor was also becoming cluttered as more event settings were added.

Changes:
- Keeps new events defaulting to Draft.
- Adds a loud Draft mode reminder in the left control panel whenever the selected/new event is Draft.
- Highlights the status control area while Draft is selected.
- Keeps the existing post-save Draft notice with Publish now / Keep as draft.
- Adds collapsible accordion sections to the editor:
  Event details, Timing, Event type, Location, Content, RSVP rules, Advanced, and Future checklist / bring-items.
- Keeps 0092-F validation/state preservation behavior.

Install:
Upload only assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js to the stable GitHub Pages path.

No SQL, Edge Function, or Webflow changes.
