README-0009 — History UI pagination, filters, and restore-safe audit behavior

Purpose
This update hardens the restore/history workflow for consequential admin pages. It makes Page Editor and Layout Designer history usable long-term by showing only 10 records at first, adding filters, collapsing details by default, and adding “Load 10 more.”

Problem addressed
The previous history sections worked, but they could grow into a long unmanageable list. Layout Designer also needed stronger before/after restore points for saves, saved-profile application, and restores.

What changed
1. Page Editor history is now scoped to the selected page, filtered, collapsed, scrollable, and paginated by tens.
2. Layout Designer history is now scoped to the selected customer style profile, filtered, collapsed, scrollable, and paginated by tens.
3. Restore confirmations now explain that the current fields will be overwritten and that a new restore point will be created.
4. The core-admin-action backend now supports history filters, limits, offsets, total counts, and has_more flags.
5. Layout Designer now records before-save, after-save, before-restore, after-restore, before-apply-saved-profile, and after-apply-saved-profile events where applicable.

Expected result
History stays complete in the database, but the UI stays manageable. Restores and defaults remain audit-safe because they add new history records rather than deleting or rewriting old ones.

Next expected step
After testing this package, continue building customer-facing renderers/module slices. The next likely product step is improving the public Aircraft renderer fields/layout or moving to the next core public page/module.
