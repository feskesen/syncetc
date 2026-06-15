SyncEtc 0114-I — Location Drag/Drop Sort Polish

Purpose
- Replace customer-facing manual location sort order editing with UI-driven reorder controls.
- Add drag/drop sorting and up/down buttons to Spaces & Locations.
- Save location order automatically/optimistically without requiring the Save Location button.

Changed Files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

Install
1. Upload the two changed JavaScript files to their matching GitHub paths.
2. Do not run SQL.
3. Do not redeploy any Supabase Edge Functions.
4. Do not change Webflow embeds.

Expected Versions
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-I
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-I

Behavior
- Spaces & Locations list now shows a drag handle and up/down arrow buttons.
- Manual Sort Order is removed from the normal location form.
- Reordering updates the UI immediately.
- Reordering automatically saves the changed location order.
- A compact inline status near the list shows Saving order, Order saved, or failure.
- If the order save fails, the prior order is restored.
- If location or aircraft fields have unsaved edits, reordering is blocked until those edits are saved or discarded so field edits are not silently overwritten.

Notes
- This is a frontend-only pass using the existing location save action.
- No database schema, RLS, or Edge Function changes are included.
