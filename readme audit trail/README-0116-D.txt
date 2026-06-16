SYNCETC 0116-D — People Definition Modules Foundation
Date: 2026-06-16

Purpose
- Adds People definition maintenance modules inside Organization Management.
- Provides customer-admin workbench screens for Lifecycle Statuses and Membership Classes before Members / People records.
- Keeps the unified People data model: one People/Membership system with definition rows for lifecycle statuses and membership classes.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-D
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-D
- core-access-action/index.ts: 2026-06-16-116-D

Functional changes
- Adds People > Lifecycle Statuses as an active Organization Management module.
- Adds People > Membership Classes as an active Organization Management module.
- Definition modules use the same maintenance-screen pattern:
  - top-right New button;
  - left search/filter/list panel;
  - right editor panel;
  - status filter defaulting to All;
  - archive/restore instead of destructive delete;
  - drag/drop and up/down reorder for active rows;
  - archived rows muted and pushed to the bottom;
  - bottom Save/Reset/Archive action row.
- Members / People remains the same unified people editor and continues to use the same definition tables for dropdown options.
- Administrators & Access remains a filtered People view; no separate administrator table/database was introduced.

Backend/API changes
- Adds core-access-action organization-admin actions:
  - organization_list_people_definitions
  - organization_save_lifecycle_status
  - organization_archive_lifecycle_status
  - organization_restore_lifecycle_status
  - organization_reorder_lifecycle_statuses
  - organization_save_membership_class
  - organization_archive_membership_class
  - organization_restore_membership_class
  - organization_reorder_membership_classes
- Actions require People/access/settings-level organization admin permissions or platform admin access.
- Audit log entries are written for save/archive/restore/reorder actions.

SQL changes
- None.
- Uses existing tables:
  - core_membership_status_definitions
  - core_membership_class_definitions
  - core_application_stage_definitions for vocabulary loading only.

Deploy order
1. Deploy Supabase Edge Function: supabase/functions/core-access-action/index.ts
2. Commit/publish GitHub assets:
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
3. No Webflow embed changes are required.

First tests
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-lifecycle-statuses
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-membership-classes
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members

Acceptance checks
- Lifecycle Statuses loads inside Organization Management.
- Membership Classes loads inside Organization Management.
- New/save/reset/archive/restore work.
- Reorder works with arrows and drag/drop for active rows.
- Archived rows are muted and remain at the bottom.
- Members / People still loads quickly and still uses lifecycle/status/class options.
- Normal UI does not show internal build/version/schema text.
- Debug mode shows version 2026-06-16-116-D.

Validation performed
- JavaScript syntax check passed for both changed frontend files using node --check.
- TypeScript file was parsed for syntax with the TypeScript compiler API; syntax passed. Full type-checking is not conclusive in this container because Supabase/Deno URL imports are not resolved here.
