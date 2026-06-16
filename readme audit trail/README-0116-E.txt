SYNCETC 0116-E — People Definitions Polish + Application / Onboarding Stages
Generated: 2026-06-16

Purpose
- Polish the People definition maintenance modules after 0116-D.
- Add Application / Onboarding Stages as the third People definition module.
- Keep the unified People database model. No separate people/admin/member tables were added.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt

Expected versions
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-E
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-E
- core-access-action/index.ts: 2026-06-16-116-E

What changed
1. Lifecycle Statuses polish
- Added the same visible drag handle used by the other maintenance modules.
- Kept drag/drop and up/down reorder behavior.
- Separated the up arrow at the top and the down arrow at the bottom of the row control.
- Removed the visible Key/debug field from the editor.
- Removed sausage-making helper copy.
- Status select now only shows Active and Inactive.
- Archive/Restore remains only in the bottom action row.
- Category guidance moved to a small information button instead of inline explanatory text.

2. Membership Classes polish
- Same row/drag/control/status/key/copy cleanup as Lifecycle Statuses.
- Dues behavior guidance moved to an information button.
- Archive/Restore remains only in the bottom action row.

3. Application / Onboarding Stages
- Added People → Application / Onboarding Stages as an active module in Organization Management.
- Added list/search/filter/reorder behavior.
- Added editor fields for display name, active/inactive, stage type, description/notes, suggested lifecycle status, login/portal/review flags, final step, and default stage.
- Uses the same maintenance pattern as Lifecycle Statuses and Membership Classes.
- No visible key/slug/system fields in normal UI.

4. Edge Function actions
- Added organization_save_application_stage.
- Added organization_archive_application_stage.
- Added organization_restore_application_stage.
- Added organization_reorder_application_stages.
- Existing organization_list_people_definitions already returns application_stages and is reused.

SQL / schema
- No SQL migration included.
- This package uses the existing core_application_stage_definitions table and existing organization membership reference to application_stage_definition_id.

Deploy order
1. Deploy supabase/functions/core-access-action/index.ts to the Supabase Edge Function named core-access-action.
2. Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js to GitHub Pages.
3. Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js to GitHub Pages.
4. Wait for GitHub Pages/cache to refresh.

First tests
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-lifecycle-statuses
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-membership-classes
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-stages
- https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members

Expected behavior
- Lifecycle Statuses and Membership Classes still load and save.
- The new Application / Onboarding Stages module loads, saves, archives/restores, and reorders.
- Drag handles are visible in the left list rows.
- Up/down arrows are separated top/bottom.
- Status select only contains Active and Inactive.
- Archive/Restore is only in the bottom action row.
- Key/slug/system fields do not appear in the normal editor.
- No inline text says safe/internal/mapping/future workflow logic.
- Debug mode should show 2026-06-16-116-E.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- .ts and .ts.txt copies match.
