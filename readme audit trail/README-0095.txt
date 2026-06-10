README-0095
Package: RSVP Checklist / Bring-Items Claiming
Date: 2026-06-09

Purpose:
Adds RSVP-page claiming of event needed/checklist items created by the Customer Admin Events Manager.

Summary:
- RSVP users can see event needed items when RSVP is available.
- Users can claim quantities and add optional item notes.
- The RSVP page shows Still Needed and Already Claimed summaries.
- Logged-in member RSVP claims are tied to the saved RSVP, person, and membership where available.
- Public RSVP claims are supported only when the event allows public RSVP.
- Quantity claiming is bounded by remaining quantity, excluding the viewer's existing claim when updating.
- If RSVP status is not Yes/Maybe/Waitlist, existing item claims for that RSVP are archived.
- Public render returns public-safe checklist summaries for public RSVP events.

Files changed:
- supabase/sql/0095-rsvp-checklist-claiming.sql
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-public-render/index.ts
- assets/public/PUBLIC-PAGE-event-rsvp-current.js

Preserved:
- Public calendar 0093-B behavior.
- Customer Admin Events Manager 0094-G behavior.
- Header/public shell/no-blue-flash work.
- Contact Tracker behavior.

Deferred:
- Event copy / recurring event builder.
- Online/hybrid private join-link rules.
- Further public calendar display polish.
