README-0066-K — Public Access Context Cache

Purpose:
- Reduce public-page header delay after the first logged-in access lookup.
- Preserve no-fallback-style rule and completion-based rendering.

Changed files:
- assets/public/PUBLIC-COMPONENT-site-shell-current.js

Behavior:
- Caches get_user_dashboard access context per logged-in user + organization in sessionStorage.
- Uses fresh cache immediately when available.
- Refreshes access context in the background.
- Backend permission checks remain authoritative.

No SQL.
No Edge Function deploy.
No Webflow change.
