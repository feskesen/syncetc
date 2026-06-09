README-0089-I
SyncEtc RSVP Page Layout Tuning

Purpose:
- Correct desktop RSVP button sizing after 0089-H made Yes/Maybe/No too narrow.
- Keep mobile stacked layout from 0089-H.

Changed:
- assets/public/PUBLIC-PAGE-event-rsvp-current.js

Notes:
- Desktop RSVP choices now receive enough width to display Yes, Maybe, and No without truncation.
- Attending-personally box remains in the same row where screen width allows.
- Mobile behavior remains stacked/readable.

No SQL, Edge Function, or Webflow changes.
