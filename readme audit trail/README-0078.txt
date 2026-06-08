README-0078 - Member/Internal Documents Bootstrap Repair

Purpose:
- Repair Member Documents and Internal Documents pages that showed raw login UI while a valid Supabase session was present.
- Preserve portal shell/header/style work.

Changed files:
- assets/user/USER-PAGE-documents-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-internal-documents-current.js

Version:
- 2026-06-08-026-D

Notes:
- Adds a conservative Supabase session fallback read from the normal project auth storage key when getSession is slow/inconsistent.
- Keeps document roots hidden during bootstrap.
- Does not change Edge Functions, SQL, Webflow embeds, portal shell, or header engine.
