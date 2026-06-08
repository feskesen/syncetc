README-0066-N — Portal Shell Render Gate

Purpose:
- Stop visible portal shell/header rendering before organization style and the shared organization header are ready.
- Remove the visible loading/default shell that caused the blue/default flash on portal pages.
- Fix shared header script-load race by using one in-flight script promise.

Files:
- assets/core/CORE-COMPONENT-portal-shell-current.js

Install:
- Upload the JS file to GitHub at the same path.
- No SQL.
- No Edge Function deploy.
- No Webflow change.

Expected version:
- 2026-06-07-021-N
