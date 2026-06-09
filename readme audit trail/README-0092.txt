SyncEtc / OneSource Aviation Website Rebuild
Audit Trail README-0092
Package: Customer Admin Events Manager 0092
Internal Version: 2026-06-09-092-A

Purpose
- Adds a customer/organization-admin Events Manager page.
- Builds on existing calendar/RSVP structure; does not replace public calendar or RSVP pages.
- Supersedes the uninstalled 0090 draft package.

Included
- Database migration for reusable event types, reusable locations, and event-needed-items groundwork.
- Organization-admin actions in core-access-action.
- Customer-admin Events Manager JavaScript using the portal shell and organization style.
- Webflow embed for /organization-events.

Key safeguards
- Uses core-access-action organization-admin permissions, not platform-only admin shell.
- Requires events.manage or organization admin/settings permissions.
- Preserves public calendar, RSVP, Contact Tracker, shared header, and no-blue-flash behavior.
- Event needed-items are definition-only in this package; RSVP user claiming is intentionally left for a later package.

Main capabilities
- Create/edit/archive/restore events.
- Reuse event types with labels, accent colors, and image URL placeholders.
- Reuse locations with written address and map query/embed fields.
- Configure event visibility and RSVP audience.
- Configure RSVP close date, capacity, waitlist/block behavior, guests, attendee list visibility, membership classes, and roles.
- Define needed checklist items for future event supply/bring-item workflows.

Files
- supabase/sql/0092-customer-admin-events-manager.sql
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js
- webflow embeds/organization-events-embed.txt

Install notes
1. Run the SQL migration.
2. Deploy core-access-action.
3. Upload CUSTOMER-ADMIN-PAGE-events-current.js.
4. Create /organization-events in Webflow using the provided embed.
5. Test with ?syncetc_debug=1.
