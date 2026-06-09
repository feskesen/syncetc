README-0089-E
SyncEtc RSVP Page Interaction Polish

Purpose:
Small UI-only RSVP page polish after 0089-D.

Changed:
- Updated assets/public/PUBLIC-PAGE-event-rsvp-current.js to internal version 2026-06-09-089-E.
- Left-aligned Yes / Maybe / No RSVP choices.
- Adjusted I am attending personally checkbox to visually align with the RSVP choice row.
- Added unsaved-change tracking for RSVP fields.
- Added Unsaved changes / Saving... / Saved status next to Save Changes.
- Added save button hover/pressed/loading feedback.
- Added Return to Calendar unsaved-change confirmation.
- Added browser beforeunload warning where supported.

Not changed:
- No database changes.
- No Edge Function changes.
- No Webflow changes.
- No RSVP summary/audience/eligibility model changes.
- No event creator/customer-admin manager changes.

Install:
Upload assets/public/PUBLIC-PAGE-event-rsvp-current.js to GitHub Pages.

Test URL:
https://syncetc.webflow.io/event-rsvp?event=<EVENT_ID>&syncetc_debug=1
