README-0109-A
Package: Header & Navigation Manager — Platform Admin Editor
Internal Version: 2026-06-12-109-A

Purpose
This package builds the first usable Platform Admin editor for SyncEtc header/navigation configuration. It uses the existing navigation tables and the 0108-A recipe cookbook foundation. It does not create a free-form visual design builder.

Decisions implemented
- First version is Platform Admin only.
- Page title is Header & Navigation Manager.
- Controlled editor first: no arbitrary CSS, no drag/drop mega-menu builder, no custom script injection.
- Exposes all seven recipe keys from the cookbook:
  - standard_horizontal
  - compact_horizontal
  - two_row
  - dropdowns
  - minimal_login_only
  - side_menu
  - hybrid_top_and_side
- Platform Admin nav remains hard-coded/protected.
- Home is locked on and cannot be hidden through this editor.
- Apply Now and other non-Home public links can be hidden.
- Links are hidden/shown, not deleted.
- Future customer-admin restrictions are anticipated, but this package is platform-admin only.
- Nav-away protection is active through the page and admin shell dirty-state integration.

Files changed
- assets/admin/ADMIN-PAGE-header-navigation-setup-current.js
- assets/core/CORE-COMPONENT-admin-shell-current.js
- supabase/functions/core-admin-action/index.ts

Backend actions added/restored in core-admin-action
- navigation_list_organizations
- navigation_get_setup
- navigation_save_setup
- navigation_reset_defaults

Editor capabilities
- Choose organization.
- Choose header recipe.
- Choose navigation display mode or recipe default.
- Toggle user badge and login/logout display.
- Edit non-platform row labels/order/visibility.
- Edit non-platform nav item labels, paths, row placement, sort order, show/hide, new-tab behavior, and status.
- View non-platform page access/security settings.
- Save with note.
- Reset visible labels/order/show-hide to safe defaults.
- Preserve Home as locked-on.
- Preserve platform admin nav as protected/hard-coded.

Not included / deferred
- Customer-admin editing.
- Drag/drop visual builder.
- Nested mega menus editor.
- Arbitrary custom CSS or icons per item.
- Making platform admin nav database-editable.
- Reworking the public/header recipe renderer itself.

Install notes
1. Upload these GitHub assets:
   - assets/admin/ADMIN-PAGE-header-navigation-setup-current.js
   - assets/core/CORE-COMPONENT-admin-shell-current.js

2. Redeploy this Supabase Edge Function:
   - core-admin-action

3. Do not run SQL for this package.

4. Do not redeploy:
   - core-access-action
   - core-public-render

5. Do not upload unless separately changed:
   - organization header
   - portal shell
   - public site shell
   - applicant portal
   - Apply Now

Expected versions
- ADMIN-PAGE-header-navigation-setup-current.js: 2026-06-12-109-A
- CORE-COMPONENT-admin-shell-current.js: 2026-06-12-109-A
- core-admin-action: 2026-06-12-109-A

Test URLs
- https://syncetc.webflow.io/header-navigation-setup?syncetc_debug=1
- https://syncetc.webflow.io/?syncetc_debug=1
- https://syncetc.webflow.io/apply-now?syncetc_debug=1
- https://syncetc.webflow.io/applicant-portal?syncetc_debug=1

Suggested first test
1. Open Header & Navigation Manager as a platform admin.
2. Confirm the organization list loads.
3. Confirm test-customer-1 setup loads.
4. Change a harmless label, for example rename Apply Now to Apply / Update.
5. Confirm unsaved-change indicator appears.
6. Save.
7. Open a public page with ?syncetc_debug=1 and confirm the public header uses the saved label.
8. Return to the manager and change the label back if desired.
9. Try to hide Home; it should be locked on.
10. Try hiding Apply Now; it should be hideable.

Rollback
- Restore the previous versions of the two GitHub assets.
- Redeploy the prior core-admin-action index.ts.
- No SQL rollback is required because this package does not run SQL.
