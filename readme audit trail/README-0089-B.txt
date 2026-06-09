SyncEtc Audit Trail README-0089-B
Package: Calendar RSVP Visibility / Accent Cleanup
Date: 2026-06-09

Purpose
- Clean up the public/member calendar event card display after the event modal polish.
- Keep organization theme as the dominant visual style while using event-type color only as a subtle accent.
- Hide RSVP counts from logged-out public visitors by default.
- Show RSVP summary and personal RSVP state to logged-in users/admins.

Files changed
- assets/public/PUBLIC-PAGE-calendar-current.js
- supabase/functions/core-access-action/index.ts

Behavior changes
- Event color now appears as a subtle left accent and pill accent; it no longer controls the full date block or modal header.
- Event modal keeps organization theme and uses event color as a top accent border.
- Logged-out public users see RSVP status as a simple availability cue and Click for details.
- Logged-in users see RSVP counts and a personal status cue:
  - RSVP needed
  - You: Yes
  - You: Maybe
  - You: No
  - You: Waitlist
- Admin users see count summary with total.
- Logged-in calendar event payload now includes the viewer's RSVP status when available.

Privacy notes
- Public visitors do not receive personalized RSVP status.
- Public visitors do not see RSVP count summaries in the event card by default.
- Backend remains the source of truth for actual RSVP eligibility and saved RSVP status.

Future-compatible notes
- Event type/location management is not built here.
- Future event types can supply accent color and image.
- Future saved locations can supply written address, map query, coordinates, and preferred zoom.
- RSVP close/deadline support exists in the data model and will need fuller admin UI controls later.
