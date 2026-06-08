README-0066-I — Public Shell Timing Diagnostics

Purpose:
- Add temporary diagnostics to the public shell so we can see exactly where the 12-15 second delay occurs.

Files to upload:
- assets/public/PUBLIC-COMPONENT-site-shell-current.js

Version:
- 2026-06-07-021-I

Notes:
- Diagnostics are visible only when using ?syncetc_debug=1 or localStorage syncetc_public_debug=1.
- This patch is for diagnosis, not final product polish.
- No SQL, Edge Function, or Webflow changes.
