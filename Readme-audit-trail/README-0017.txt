README-0017 — Aircraft Public Shell Mount Patch

Purpose
This patch fixes the public Aircraft page so it uses the shared public site shell/header/footer, matching Home and Gallery.

Problem
The Webflow embed already loaded PUBLIC-COMPONENT-site-shell-current.js, but the Aircraft renderer was older and rendered directly into #syncetc-aircraft-page-root instead of mounting through the shared shell. The result was a body-only Aircraft page with no shared header/footer.

What changed
- PUBLIC-PAGE-aircraft-current.js now checks for window.SyncEtcPublicShell.
- If the shell is available, Aircraft renders through the shell with activePageKey = aircraft.
- If the shell is unavailable, Aircraft still falls back to standalone rendering.
- No SQL, Edge Function, or Webflow embed change is required.

Expected next
Replace the GitHub public Aircraft JS file, hard refresh /aircraft, and confirm the shared header/footer appears. If it does, continue with the next public page build.
