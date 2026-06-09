README-0092-H

Customer Admin Events Manager guided accordion patch.

Scope:
- JS-only customer-admin event creator/editor update.
- No SQL changes.
- No Edge Function deploy.
- No public calendar, RSVP page, header, or Contact Tracker changes.

Changes:
- Keeps new events defaulting to Draft.
- Keeps loud Draft warning from 0092-G.
- Makes the event editor a guided accordion flow.
- Opens only Event details by default; later sections start collapsed.
- Adds Continue / Back navigation at the bottom of each section.
- Adds section badges: Missing, Complete, Optional.
- First four sections are treated as required:
  1. Event details
  2. Timing
  3. Event type
  4. Location
- Removes default General prefill for new events.
- Requires an event type before save.
- Requires a location before save.
- If validation fails, the matching section opens and typed data is preserved.
- Preserves 0092-F/0092-G failed-save form preservation behavior.

Expected version:
2026-06-09-092-H
