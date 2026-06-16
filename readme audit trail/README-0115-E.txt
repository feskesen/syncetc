# 0115-E Assets / Aircraft Module Proper Polish

Date: 2026-06-15

## Scope

Focused Organization Management / Aircraft Admin polish for the real Assets / Aircraft module.

## Changed files

- `assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js`
- `assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js`
- `assets/admin/ADMIN-PAGE-aircraft-admin-current.js`

## Changes

- Removed the separate `Rates` module from the Organization Management left nav because rate/usage groundwork currently lives on each asset record under the `Rates / Usage` tab.
- Updated Organization Management to cache-bust the embedded Aircraft Admin module at version `2026-06-15-115-E`.
- Assets / Aircraft now follows the same maintenance-screen conventions as Asset Types and Spaces & Locations:
  - status filter defaults to `All`;
  - archived records are visible in All but muted and sorted to the bottom;
  - no separate `Include archived` checkbox;
  - debounced search that keeps focus;
  - drag/drop and up/down sort controls;
  - optimistic order save;
  - no manual Sort Order field in the Identity tab.
- Preserved standalone `/aircraft-admin` behavior.

## Not changed

- No SQL.
- No Edge Function changes.
- No scheduler, squawk, full rates, or billing engine added.
- Asset Type identity/default-field behavior is left for a future planning pass.

## Install

Upload to GitHub:

- `assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js`
- `assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js`
- `assets/admin/ADMIN-PAGE-aircraft-admin-current.js`

No SQL or Edge Function redeploy is required.

## Expected versions

- `CUSTOMER-ADMIN-PAGE-organization-management-current.js`: `2026-06-15-115-E`
- `CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js`: `2026-06-15-115-E`
- `ADMIN-PAGE-aircraft-admin-current.js`: `2026-06-15-115-E`
