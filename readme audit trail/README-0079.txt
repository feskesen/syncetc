README-0079 - Member/Internal Documents Diagnostics

Purpose:
Add page-level diagnostics to the protected Member Documents and Internal Documents pages.

Reason:
The portal shell sees a logged-in session but no organization/style context on these pages. Prior shell diagnostics did not show whether the page script loaded, found its root, called access context, selected an organization, called document actions, or sent portal shell state.

Files changed:
- assets/user/USER-PAGE-documents-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-internal-documents-current.js

Version:
2026-06-08-026-E

Notes:
This is diagnostic only. It does not change SQL, Edge Functions, Webflow embeds, or header/shell logic.
Diagnostics appear only when URL contains ?syncetc_debug=1.
