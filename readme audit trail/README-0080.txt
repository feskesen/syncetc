README-0080
Package: Member/Internal Documents Supabase Race Repair
Version: 2026-06-08-026-F

Purpose:
Fix Member Documents and Internal Documents boot failure caused by the page script detecting an existing Supabase script tag before the global Supabase client was actually ready.

Files changed:
- assets/user/USER-PAGE-documents-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-internal-documents-current.js

Changes:
- Robust loadScript waits for an existing script's load event instead of treating existing script tags as ready.
- ensureSupabase now validates window.supabase.createClient before using it.
- Reuses window.syncetcSupabase when available.
- Preserves diagnostics and page bootstrap logic.

Not changed:
- No SQL.
- No Edge Function.
- No Webflow embed.
- No shared header/shell files.
