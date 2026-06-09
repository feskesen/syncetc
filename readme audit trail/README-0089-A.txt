SyncEtc Website Rebuild — README-0089-A
Package: Calendar Event Modal Polish
Date: 2026-06-09

Purpose
- Polish the public Calendar / Events event-detail modal without changing RSVP rules, database schema, event admin tools, or shell behavior.

Files changed
- assets/public/PUBLIC-PAGE-calendar-current.js

Internal version
- PUBLIC-PAGE-calendar-current.js: 2026-06-09-089-A

Changes
- Reworked event detail modal toward the stronger 150th-style event card layout.
- Added event accent color support using future-compatible fields:
  accent_color, category_color, event_type_color, settings_json.accent_color, event_type_json.accent_color.
- Added event image fallback order:
  event image fields → event type/location image fields → organization logo → generic calendar icon.
- Added written Location and Address cards.
- Added embedded Google Maps block when location/address text exists.
- Added map placeholder when no address is available.
- Removed redundant "Return to calendar" button inside the modal; close/X handles return.
- Kept RSVP link behavior intact.

Scope intentionally not included
- No event type manager.
- No saved location manager.
- No image upload UI.
- No RSVP backend/rules changes.
- No Edge Function changes.
- No SQL migration.
- No shell/header changes.

Testing URLs
- https://syncetc.webflow.io/calendar?syncetc_debug=1
- https://syncetc.webflow.io/user-dashboard?syncetc_debug=1

Notes
- This is a small visual/front-end patch only.
- It anticipates future event types and saved locations without requiring those systems now.
