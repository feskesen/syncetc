README-0040.txt
Purpose: Initial Events / Calendar / RSVP foundation.

This package adds the next major club-operations module after Documents:
- platform/corporate Events Admin page;
- organization-scoped event records;
- RSVP table groundwork;
- public Calendar renderer;
- test/public RSVP renderer for events that explicitly enable public RSVP;
- public Edge Function actions for public calendar/event RSVP data;
- admin Edge Function actions for event management and RSVP viewing.

Important design notes:
- Events are organization records, not hardcoded page content.
- Public Calendar returns only events that are status=published, visibility=public, and not archived.
- Member-only/private event visibility is scaffolded in the data model but not rendered publicly yet.
- Full member-gated RSVP should wait for the member portal/auth layer.
- The RSVP page included here is a groundwork/test public RSVP flow and only works when an event explicitly enables public RSVP.
- The corporate/platform admin page includes debug/backend panels by design.
- Customer-facing event management should be built later as a cleaner organization-admin interface.

Files:
- apply_events_calendar_rsvp_support.sql: additive database migration.
- verify_events_calendar_rsvp_support.sql: migration verification.
- core-admin-action/index.ts: deploy to Supabase function core-admin-action, JWT ON.
- core-public-render/index.ts: deploy to Supabase function core-public-render, JWT OFF.
- ADMIN-PAGE-events-current.js: upload to assets/admin/.
- CORE-COMPONENT-admin-shell-current.js: upload to assets/core/ to add Events admin nav.
- PUBLIC-PAGE-calendar-current.js: upload to assets/public/.
- PUBLIC-PAGE-event-rsvp-current.js: upload to assets/public/.
- WEBFLOW-events-admin-embed.txt: paste into /events-admin.
- WEBFLOW-calendar-public-embed.txt: paste into /calendar.
- WEBFLOW-event-rsvp-public-embed.txt: paste into /event-rsvp.

Expected next after this works:
1. Test Events Admin create/edit/archive/restore.
2. Test public Calendar shell/rendering.
3. Decide how much RSVP should wait for member portal.
4. Build member portal shell before private/member-only event RSVPs.
