README-0093 — Public Calendar UI / Month View Patch

Date: 2026-06-09
Package: syncetc-public-calendar-ui-month-view-0093.zip

Purpose
- Update the public Calendar / Events page after the event-admin image/type/accent work.
- Add Month view while preserving List and Compact.
- Make calendar controls visibly active and interactive.
- Display public-safe event images, summaries, descriptions, and accent colors.

Important behavior
- Public calendar JS internal version: 2026-06-09-093-A.
- core-public-render internal version: 2026-06-09-093-A.
- List and Compact now render different card densities.
- Month view has a standard month grid and event chips.
- Month event chip accents create a bracket effect:
  - single-day event: left + bottom + right accent
  - multi-day start: left + bottom accent
  - multi-day middle: bottom accent
  - multi-day end: bottom + right accent
- Event-specific accent color is used first; event type color is fallback.
- Event image is used where available.
- Short summary is used on cards; full description is used in modal.
- RSVP links are preserved.

Files changed
- assets/public/PUBLIC-PAGE-calendar-current.js
- supabase/functions/core-public-render/index.ts

Files intentionally not changed
- Customer Admin Events Manager JS
- RSVP page JS
- Contact Tracker JS
- Public shell/header JS
- SQL schema

Deferred
- RSVP checklist/bring-items claiming.
- Event copy and recurrence builder.
- Online/hybrid private join-link support.
