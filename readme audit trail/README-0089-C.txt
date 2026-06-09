README-0089-C.txt
Package: Calendar RSVP Card Wording / Click Behavior Cleanup
Date: 2026-06-09

Purpose
- Small follow-up patch to the public Calendar / Events page after RSVP People Integration 0088 and modal polish 0089-A/B.
- Keeps RSVP totals off the calendar event card and reserves totals/summaries for the RSVP page.
- Makes the personal RSVP state clearer for logged-in users.

Files changed
- assets/public/PUBLIC-PAGE-calendar-current.js

Internal version
- PUBLIC-PAGE-calendar-current.js: 2026-06-09-089-C

Behavior changes
- Event cards now show personal RSVP state as:
  - Your RSVP: Needed
  - Your RSVP: Yes
  - Your RSVP: Yes · Party of N
  - Your RSVP: Maybe
  - Your RSVP: No
  - Your RSVP: Waitlist · Party of N
- Logged-out/public users see an RSVP availability pill only when applicable.
- RSVP totals such as Yes/Maybe/No/Total are no longer shown on the calendar card.
- Clicking the RSVP/personal-status pill goes directly to the RSVP page.
- Clicking the rest of the event card still opens the event detail modal.
- The event card action hint remains “Click for details.”

Notes
- No database changes.
- No Edge Function changes.
- No Webflow changes.
- This patch does not change RSVP eligibility or access rules; it only changes front-end display and click behavior.

Test URL
- https://syncetc.webflow.io/calendar?syncetc_debug=1
