README-0109-B
Package: Header & Navigation Manager backend error/legacy-layout hotfix
Version: 2026-06-12-109-B

Purpose:
Fix the first 0109-A test failure where the admin UI displayed only [object Object].

Changes:
- core-admin-action now returns readable Supabase/PostgREST error messages instead of [object Object].
- Header recipe saves keep legacy-compatible header_layout_key values while storing the new header_recipe_key.
- Profile/item/row/access insert and update operations use fallbacks for older navigation table schemas.
- Header & Navigation Manager frontend displays backend detail when a save/load fails.

Install:
- Upload assets/admin/ADMIN-PAGE-header-navigation-setup-current.js
- Upload assets/core/CORE-COMPONENT-admin-shell-current.js
- Redeploy supabase/functions/core-admin-action

Do not run SQL.
Do not redeploy core-access-action or core-public-render.

Expected versions:
- ADMIN-PAGE-header-navigation-setup-current.js: 2026-06-12-109-B
- CORE-COMPONENT-admin-shell-current.js: 2026-06-12-109-B
- core-admin-action: 2026-06-12-109-B
