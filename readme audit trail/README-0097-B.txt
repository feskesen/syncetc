README-0097-B — Apply Now Shell Render Hotfix

Problem:
The /apply-now page could show a blank page even though PUBLIC-PAGE-apply-current.js booted successfully. The public shell early root gate hides public page roots until the shared shell marks them ready. The Apply Now page was rendering directly into its root instead of handing content to SyncEtcPublicShell.render(), so the root could remain hidden.

Fix:
- Updated PUBLIC-PAGE-apply-current.js to internal version 2026-06-10-097-B.
- Added shell-aware mounting through window.SyncEtcPublicShell.render().
- Kept a direct fallback if the public shell is unavailable.
- Success state now uses the same shell-aware mounting path.
- No database, Edge Function, Webflow, Applicant Tracker, or existing module changes.

Install:
Upload assets/public/PUBLIC-PAGE-apply-current.js.
