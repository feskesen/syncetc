SyncEtc Customer Admin Events Manager 0092-I
Internal Version: 2026-06-09-092-I

Scope:
- JS-only UI/UX patch for the customer-admin organization events manager.
- Supersedes 0092-H for the single JS asset only.

Changes:
- Merged Event details and Event type into one required Event Basics accordion section.
- Event type and event title now live together with helper text explaining the difference.
- Selecting a saved event type will suggest/fill the event title only when the title is blank.
- Featured checkbox moved into Event Basics and does not affect sort order.
- Sort order removed from the visible UI; events are expected to sort by date.
- Reusable event type controls now appear only when relevant:
  - custom/new type => Save this as reusable event type
  - changed selected type name => Save as new reusable event type
  - changed selected type defaults without name change => Update saved event type
- Reusable location controls now appear only when relevant:
  - custom/new location => Save this as reusable location
  - changed selected location name => Save as new reusable location
  - changed selected location address/map without name change => Update saved location
- Left event list is date-sorted and capped to the first 100 matching events with a note to use filters/search when there are more.
- Keeps the 092-F validation protection, 092-G draft warning, and 092-H accordion flow.

Install:
- Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js

No SQL.
No Edge Function deploy.
No Webflow changes.
