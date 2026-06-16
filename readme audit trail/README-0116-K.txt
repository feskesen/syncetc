SYNCETC 0116-K — People Single-Result Card Height Fix

Purpose
- Fix a People list UI issue where a single filtered result stretched vertically to fill the list area.
- Keep person cards compact whether the list shows one person or many people.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js

Expected versions
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-K
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-K

Implementation notes
- Added align-content:start and grid-auto-rows:max-content to the People compact list.
- Added align-self:start to person cards.
- Added badge alignment guards so role/status pills do not stretch when only one card is visible.
- Updated Organization Management's expected People module version for cache-busting.

No SQL changes.
No Edge Function changes.
No Webflow embed changes.

First test
- Open Organization Management People/Members.
- Open Advanced filters and filter to a role/group with one matching person.
- Confirm the one visible person card remains compact and badge pills remain normal height.
- Clear filters and confirm the multi-person list still looks unchanged.
