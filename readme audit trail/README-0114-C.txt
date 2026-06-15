# 0114-C Organization Management Console Layout / Module Boundary / Location Fields Fix

Internal versions:
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-14-114-C
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-C
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-114-C
- core-access-action: 2026-06-14-114-C

Purpose:
- Tighten the Organization Management console into a fixed customer-admin workbench.
- Remove customer-facing migration/debug/embedded-module language from normal UI.
- Improve module boundaries so Spaces & Locations and Assets / Aircraft do not show the same combined editor when embedded.
- Add proper location address fields and a broader customer-admin location-type vocabulary.

Install:
1. Run supabase/sql/0114-C-organization-management-location-fields.sql.
2. Upload GitHub assets:
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
   - assets/admin/ADMIN-PAGE-aircraft-admin-current.js
3. Redeploy Supabase Edge Function:
   - core-access-action

Do not redeploy:
- core-public-render
- core-admin-action

What changed:
- Organization Management uses a more compact top management header instead of a large public-style hero.
- Left management nav can collapse to a compact rail.
- Normal UI no longer mentions active embedded modules, migration, standalone test URLs, or backend mechanics.
- Debug information remains gated behind syncetc_debug.
- Spaces & Locations opens only the locations editor when embedded in Organization Management.
- Assets / Aircraft opens only the aircraft list/editor when embedded in Organization Management.
- Standalone /aircraft-admin still works and still shows both locations and aircraft.
- Locations now include address line 1, address line 2, city, state/region, postal code, country, and notes.
- Location required fields are display name and location type only.
- Location types now include airport, hangar, meeting room, office, dock, storage, base, and other.
- Nav-away/dirty protection is preserved.

First test:
- Open /organization-management?syncetc_debug=1&module=assets-locations.
- Confirm the console loads, the left nav can collapse, and only Spaces & Locations appears in the work area.
- Save a harmless location address update.
- Then open /organization-management?syncetc_debug=1&module=assets-aircraft.
- Confirm only aircraft list/editor appears, with no full locations editor above it.
