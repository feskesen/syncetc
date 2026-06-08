README-0065 - True Unified Organization Header

Version: 2026-06-07-020-A

Purpose:
- Remove the concept of separate public and portal headers.
- Public pages and portal pages now use one organization header engine.

Files changed:
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/public/PUBLIC-COMPONENT-site-shell-current.js

Key changes:
- The portal shell is the single organization header engine.
- The public shell no longer renders its own header.
- The public shell feeds organization, style, public nav, auth, and access context into the one header engine.
- Header rows are based on login/access state:
  - Public
  - User
  - Admin
  - Platform
- Home is forced first in the Public row.
- Link groups are right-aligned; row labels remain left-aligned.
- The header inherits organization styling and width.
- Public pages can show User/Admin rows when the logged-in user has access.

Deployment notes:
- Upload only the two files listed above.
- Hard refresh after GitHub Pages updates.
- Direct public pages should no longer show a different header from portal pages.
