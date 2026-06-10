README-0093-B — Public Calendar Month Ribbon Polish

This is a JS-only follow-up to 0093-A.

Changes:
- Month-view multi-day events now render as connected horizontal ribbon segments.
- Ribbons visually continue across adjacent date cells and split at week-row boundaries.
- Start segments show the start time.
- Middle continuation segments show a continuation label rather than repeating the start time.
- End segments show the end time when available.
- Overlapping month events are assigned stable lanes so they stack without overlapping.
- The month grid keeps List and Compact view behavior unchanged.

Not changed:
- No SQL changes.
- No Edge Function changes.
- No RSVP page changes.
- No Customer Admin Events Manager changes.
- No Contact Tracker/header/public shell changes.
