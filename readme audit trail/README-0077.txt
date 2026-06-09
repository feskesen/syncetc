README-0077 — Member/Internal Documents Portal Bootstrap Repair

Purpose:
- Fix member-documents and internal-documents pages that showed a raw login screen or hung with no organization style while a user session existed.
- Keep this patch narrow: only the two protected documents page scripts were changed.

Files changed:
- assets/user/USER-PAGE-documents-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-internal-documents-current.js

Key changes:
- Added stable Supabase session detection before deciding whether to show login.
- Added both organizationOptions and organizations to portal shell state for compatibility with the unified portal shell.
- Preserved style-gated rendering for logged-in users.
- No SQL, no Edge Function, no header/shell changes, no Webflow changes.

Expected version:
- 2026-06-08-026-C
