# 0114-E Organization Management Console Header / Full-Width Workbench / Accordion Standardization

Internal versions:
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-14-114-E
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-E
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-E

Scope:
- Focused frontend-only console/workbench layout pass.
- No SQL changes.
- No Edge Function changes.
- No Webflow root/script path changes.

Changes:
- Organization Management now marks the page as a management-console page and forces the console root to break out to full available viewport width.
- Adds page-specific CSS so the shared organization header is full-width and more compact while Organization Management is open.
- Keeps the management console body as an immutable SyncEtc admin/workbench layout; customer styling only supplies identity/accent colors.
- Replaces plus/minus left-nav accordion controls with disclosure triangles/carets:
  - ▸ closed
  - ▾ open
- Fixes left navigation accordion behavior so child module rows visibly show/hide.
- Home remains available; major sections collapse/expand with one visible section at a time unless the active module requires a section to be open.
- Adds debounced Spaces & Locations search behavior so typing is not interrupted by immediate re-rendering.
- Preserves strict module boundaries:
  - Spaces & Locations remains locations-only.
  - Assets / Aircraft remains aircraft-only.
- Keeps standalone /aircraft-admin available.

Install:
Upload to GitHub:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

Do not run SQL.
Do not redeploy Edge Functions.
Do not redeploy core-access-action, core-public-render, or core-admin-action.

First test:
Open:
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=assets-locations

Expected:
- Organization Management uses a wider/full-width console body.
- Shared header appears more compact/full width on this page.
- Left nav uses ▸ / ▾ disclosure triangles.
- Opening a section shows child rows; closing it hides child rows.
- Spaces & Locations search does not interrupt typing.
- Spaces & Locations shows only location management.
