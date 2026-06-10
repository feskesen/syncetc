SyncEtc Customer Admin Events Editor Cleanup 0094-G
Internal Version: 2026-06-09-094-G

Scope:
- JS-only layout micro-patch.
- Doubles the left event-list scroll area height from about three cards to about five cards.
- Leaves the rest of the Events Manager behavior untouched.

Install:
- Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js to the stable GitHub Pages path.

No SQL changes.
No Edge Function deploy.
No Webflow changes.

Test:
https://syncetc.webflow.io/organization-events?syncetc_debug=1

Expected diagnostic/version text:
2026-06-09-094-G
