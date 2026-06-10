README-0096 - Event Copy / Recurrence + Online/Hybrid Support

Purpose:
- Add final calendar-management features deferred from prior passes: event copy/repeat and online/hybrid event support.

Changes:
- Customer Admin Events Manager now has Copy / Repeat for existing events.
- One-time copy and monthly repeat patterns are supported.
- Copies are saved as separate draft events so each can be reviewed and published independently.
- Event copy preserves event type, image, location, RSVP rules, and checklist/bring-items definitions.
- Location editor supports In-person, Online, and Hybrid location types.
- Online platform and private join URL fields are stored server-side.
- Public calendar receives only public-safe online metadata; private join URL is not exposed publicly.
- RSVP page can show online/hybrid event context where the event payload includes an eligible join link.

Safeguards:
- Private online join URLs are not returned by core-public-render.
- Event copies default to Draft.
- No changes to Contact Tracker, header, or Customer Admin Events Manager routing.

Deferred:
- Full recurring-series master records.
- Editing an entire recurring series after creation.
- Online join-link visibility enforcement beyond stored visibility metadata.
- Calendar overlay RSVP behavior.
