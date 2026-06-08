README-0066-D — Shared Header Public Shell Patch

Purpose:
Repair public pages so they call the single shared organization header engine and never show a blank header.

Files changed:
- assets/public/PUBLIC-COMPONENT-site-shell-current.js

Version:
- PUBLIC-COMPONENT-site-shell-current.js: 2026-06-07-021-D

Behavior:
- Public shell renders the shared header immediately with public navigation.
- Auth/access lookup then upgrades the same shared header with USER / ADMIN / PLATFORM rows if applicable.
- If auth lookup fails, the public row still remains visible.
- No portal shell changes.
- No SQL.
- No Edge Function deployment.
- No Webflow embed change.

Install:
Upload the single changed file to GitHub at the same path.
