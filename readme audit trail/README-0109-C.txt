0109-C Header & Navigation Manager — Visibility Rule Constraint / Debug Hotfix

Purpose
- Fixes the core_navigation_rows_visibility_rule_check error caused by enum normalization changing values like authenticated_user into authenticated-user.
- Adds a real debug block to Header & Navigation Manager so future backend/schema mismatches show useful context.

Install
1. Upload to GitHub:
   - assets/admin/ADMIN-PAGE-header-navigation-setup-current.js

2. Redeploy Supabase Edge Function:
   - core-admin-action

Do not run SQL.
Do not redeploy core-access-action or core-public-render.

Expected versions
- ADMIN-PAGE-header-navigation-setup-current.js: 2026-06-12-109-C
- core-admin-action: 2026-06-12-109-C

Notes
- The issue was not a data/security problem. It was a code normalization mismatch. The database check constraint wants underscore-style values such as authenticated_user / organization_admin, but the generic slug normalizer converted them to hyphen-style values.
- Page access levels are now also normalized with underscore-safe logic to avoid a similar issue later.
- Platform admin nav remains protected/hard-coded.
