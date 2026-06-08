README-0082 — Header/Nav Setup patch

Date: 2026-06-08
Package: syncetc-header-nav-setup-0082.zip

Files changed:
- assets/core/CORE-COMPONENT-portal-shell-current.js
  - Internal Version: 2026-06-08-027-B
- assets/admin/ADMIN-PAGE-header-navigation-setup-current.js
  - Internal Version: 2026-06-08-081-B

Reason:
After installing Header/Nav Setup package 0081, portal pages could hold hidden with diagnostics showing style missing / organization not selected. The cause was a browser-side initialization defect in the portal shell: state.navigationRows and state.navigationItems were not initialized before older page scripts called SyncEtcPortalShell.setState without navigation fields. That could throw inside setState and prevent the page script from completing its access/style handoff.

Fix:
- Initialize navigationProfile, navigationRows, and navigationItems in portal shell state.
- Make setState defensive by wrapping current navigation row/item reads with the existing arr() helper.
- Add additional portal root selectors for profile/document pages.
- Keep the existing no-blue-flash style gate intact.

Header/Nav Setup admin UX improvements:
- Logged-out state now renders a Log in link rather than only a red error.
- Renamed “Show logout button” to “Show login / logout button.”
- Renamed “Show duplicate organization context row” to “Show organization context sub-row (the duplicate org-name/key row).”
- Added unsaved-change / nav-away protection for edited setup forms.

No SQL changes.
No Edge Function changes.
