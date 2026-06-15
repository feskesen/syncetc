# SyncEtc 0114-B — Organization Management Console Module Runtime

Internal version: 2026-06-14-114-B

## Purpose

Converts the customer/organization-side Organization Management page from a simple launchpad into the first version of a unified admin workbench.

This is not a SyncEtc platform-only page. It is intended for organization/customer admins in the customer context. Platform admins may access it only through the same customer-support/backdoor context, not as a duplicate platform admin page.

## Changed files

- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

## Install

Upload the three changed GitHub assets.

Do not run SQL.
Do not redeploy Edge Functions.
Do not redeploy core-access-action, core-public-render, or core-admin-action.

## Expected versions

- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-14-114-B
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-B
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-B

## Behavior

Organization Management now acts as a module runtime:

- Full-width immutable SyncEtc admin/workbench layout.
- Customer organization colors/logo/context may be used as accents, but the console structure is fixed.
- Left navigation shows major management systems and module statuses.
- Right work area changes based on the selected module.
- URL query routing supports module selection, for example:
  - /organization-management?module=overview
  - /organization-management?module=assets-aircraft
  - /organization-management?module=assets-locations
- Module status meanings:
  - Active = embedded and operational inside this console.
  - Existing = standalone page exists elsewhere and is not yet embedded.
  - Placeholder = planned/future module.
- Existing direct URLs are preserved.

## First embedded module

Aircraft Admin is the first embedded module.

- Assets / Aircraft opens the Aircraft Admin editor inside the right panel.
- Spaces & Locations opens the same embedded Aircraft Admin module, focused on the bases/locations workflow.
- Standalone /aircraft-admin remains available for testing and backup during migration.
- Aircraft Admin now exposes a reusable mount API while preserving standalone auto-load behavior.

## Not changed

- No Supabase schema/RLS/storage/auth changes.
- No Edge Function changes.
- No migration of all admin pages yet.
- No scheduler, squawk system, billing/finance, store, forum category manager, or full settings system in this pass.

## Test

1. Open /organization-management?syncetc_debug=1.
2. Confirm the left navigation appears with Active, Existing and Placeholder statuses.
3. Click Assets / Aircraft.
4. Confirm Aircraft Admin loads inside the right panel.
5. Make an unsaved aircraft change and try switching modules; a nav-away warning should appear.
6. Confirm /aircraft-admin still works directly.
