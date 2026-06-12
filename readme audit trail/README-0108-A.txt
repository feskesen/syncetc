README-0108-A
Package: Header / Nav Recipes Foundation
Version: 2026-06-12-108-A

Purpose:
Add a controlled "recipe cookbook" layer for SyncEtc headers/navigation. This lets future platform/customer settings choose safe layout modes like standard horizontal, compact, two-row, dropdown groups, minimal login-only, side menu, and hybrid top/side without allowing arbitrary customer code or fragile one-off CSS.

Scope:
- Foundation only. This is not the final full customer-facing visual editor.
- Navigation content/security remains separate from header presentation.
- No applicant/member/admin access permissions are expanded.
- Existing navigation rows/items continue to work as before.
- Existing old layout keys such as pill-rows and compact-pill-rows are mapped to recipe keys.

Files changed / added:
- supabase/sql/0108-A-header-nav-recipes-foundation.sql
- assets/core/CORE-COMPONENT-organization-header-current.js
- assets/admin/ADMIN-PAGE-header-navigation-setup-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-public-render/index.ts

SQL added:
- public.core_header_recipe_definitions
- public.core_header_recipe_cookbook_v1
- Optional profile columns on public.core_navigation_profiles:
  - header_recipe_key
  - nav_display_mode
  - header_settings_json
  - header_recipe_version

Default recipes seeded:
- standard_horizontal
- compact_horizontal
- two_row
- dropdowns
- minimal_login_only
- side_menu
- hybrid_top_and_side

Header engine changes:
- Shared organization header now resolves a header recipe from navigation_profile.header_recipe_key, navigation_profile.header_layout_key, or settings_json.
- Supports controlled rendering modes:
  - inline rows
  - dropdown groups
  - side drawer / menu button
- Adds recipe-specific CSS classes and data attributes:
  - data-header-recipe
  - data-nav-display-mode
- Adds controlled flags for show_logo, show_organization_name, show_login_button, show_logout_button, show_user_badge, compact_spacing, sticky_header, alignment, and menu_label.
- Keeps the old pill-row design as the standard fallback.

Backend changes:
- core-access-action and core-public-render include recipe/profile fields in navigation_profile when views expose them.
- Defaults now prefer standard_horizontal rather than old pill-rows, while the header engine still maps pill-rows to the same standard recipe.

Admin UI change:
- Header / Navigation Setup page now labels the selector as Header recipe and lists the cookbook recipe keys.
- The final full editor remains deferred.

Install order:
1. Run supabase/sql/0108-A-header-nav-recipes-foundation.sql in Supabase SQL Editor.
2. Deploy Supabase Edge Functions:
   - core-access-action
   - core-public-render
3. Upload GitHub assets:
   - assets/core/CORE-COMPONENT-organization-header-current.js
   - assets/admin/ADMIN-PAGE-header-navigation-setup-current.js

Do not redeploy:
- core-admin-action

Do not upload unless intentionally changed elsewhere:
- public page JS files
- applicant portal JS
- portal shell
- admin shell

Expected versions:
- CORE-COMPONENT-organization-header-current.js: 2026-06-12-108-A
- ADMIN-PAGE-header-navigation-setup-current.js: 2026-06-12-108-A
- core-access-action: 2026-06-12-108-A
- core-public-render: 2026-06-12-108-A

Suggested tests:
- Public home: https://syncetc.webflow.io/?syncetc_debug=1
- Public calendar: https://syncetc.webflow.io/calendar?syncetc_debug=1
- Applicant portal: https://syncetc.webflow.io/applicant-portal?syncetc_debug=1
- Member/user profile page if available.
- Customer admin dashboard if available.
- Header/Nav Setup page if available.

Expected behavior:
- Existing header still renders with current/standard layout.
- No access behavior changes.
- Debug/header DOM should show data-header-recipe="standard-horizontal" or a mapped recipe.
- If a profile is later set to dropdowns, side_menu, compact_horizontal, etc., the same shared header engine renders the matching controlled recipe.

Deferred:
- Full customer-admin limited editor.
- Rich preview of all recipes.
- Per-customer cookbook extension UI.
- Nested/custom dropdown hierarchy beyond row-group dropdowns.
