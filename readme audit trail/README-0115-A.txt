# 0115-A Asset Types Foundation

Purpose: add the first working Asset Types module inside the customer-facing Organization Management workbench.

Install order:
1. Run SQL:
   supabase/sql/0115-A-asset-types-foundation.sql

2. Upload GitHub assets:
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
   assets/admin/ADMIN-PAGE-aircraft-admin-current.js

3. Redeploy Supabase Edge Function:
   core-access-action

Do not redeploy:
- core-public-render
- core-admin-action

Expected versions:
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-15-115-A
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-A
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-15-115-A
- core-access-action: 2026-06-15-115-A

What changed:
- Added public.core_organization_asset_types.
- Seeded simple per-organization defaults: Aircraft, Vehicle, Simulator, Equipment, Other.
- Added core-access-action CRUD/archive/reorder support for asset types through organization_save_asset_type and related actions.
- Organization Management now treats Asset Types as an Active embedded module.
- Asset Types uses the same maintenance-screen pattern as Spaces & Locations:
  - left list / right editor
  - debounced search
  - drag/drop ordering
  - up/down order buttons
  - optimistic order save
  - no manual sort-order field
  - saved/unsaved status near Save button
- Asset Types are simple classifications only. Rates, meters, maintenance, reservations, scheduler rules, and billing remain on asset records or future modules.

First test:
Open:
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=assets-types

Expected:
- Asset Types module opens inside Organization Management.
- It shows default types.
- You can create/edit/search/reorder asset types.
- Reordering auto-saves without pressing Save Asset Type.
