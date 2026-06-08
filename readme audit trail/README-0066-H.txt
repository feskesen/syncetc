README-0066-H
Package: Completion-Based Public Header Initialization
Version: 2026-06-07-021-H

Changed:
- PUBLIC-COMPONENT-site-shell-current.js only.
- Added early public root visibility gate before page-specific loading messages can flash.
- Removed timer fallback to logged-out/public-only state for initial public header rendering.
- Public shell now waits for style + Supabase session check + access context when logged in before rendering final header.
- If required context fails, the page shows a visible error instead of guessing a default style or login state.

No SQL.
No Edge Function deploy.
No Webflow embed changes.
