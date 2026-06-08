README-0066-O — Portal Root Early Hide

Purpose:
Prevent the portal pages from visibly painting the old/default blue shell before organization style, shared header, and access context are ready.

Files changed:
- assets/core/CORE-COMPONENT-portal-shell-current.js

Notes:
- Keeps portal root/container structure.
- Hides portal roots immediately at boot.
- Removes the early loading/default shell from view.
- Reveals only after final styled header render.
- Leaves diagnostics available behind ?syncetc_debug=1.

No SQL.
No Edge Function deploy.
No Webflow changes.
