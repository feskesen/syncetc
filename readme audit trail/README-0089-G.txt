README-0089-G
SyncEtc / OneSource Aviation Website Rebuild
Package: RSVP Page Alignment Fix 0089-G

Purpose:
- Correct the RSVP choice row after 0089-F did not fully left-align labels or align the personal attendance control.

Changes:
- PUBLIC-PAGE-event-rsvp-current.js internal version advanced to 2026-06-09-089-G.
- Forces the Yes / Maybe / No controls into a simple three-column row.
- Forces radio controls and labels left-aligned inside each button.
- Fixes selected-button label contrast on dark green/yellow/red backgrounds.
- Aligns the “I am attending personally” box with the RSVP buttons and restores its helper text.

Install:
- Upload only assets/public/PUBLIC-PAGE-event-rsvp-current.js.

No SQL, Edge Function, or Webflow changes.
