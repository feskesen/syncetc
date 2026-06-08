README-0023 — FAQ Import Help and Reorder Controls

Purpose
This patch improves the Info/FAQ admin workflow inside Page Editor. It adds clearer CSV import instructions and adds FAQ reorder controls without changing database schema, Edge Functions, or public embeds.

Problem addressed
The CSV import section did not explain the expected columns clearly enough. FAQ ordering also required manually editing sort_order, which is error-prone when entering many FAQs.

Changes included
- Added CSV helper text showing required and optional columns.
- Added a short CSV example directly inside the import section.
- Added grouped FAQ display by category.
- Added drag-to-reorder within the same FAQ category.
- Added Move Up / Move Down buttons as a fallback when drag is awkward in a scroll box.
- Reorder actions automatically renumber sort_order in 100-point increments within the affected category.
- Reorder does not move FAQs between categories. To move a FAQ to another category, edit its Category field.
- Bumped the Page Editor internal version to 2026-06-05-004-A to mark this as a minor patch.

Expected next
Test FAQ CSV help text, FAQ save behavior, drag reorder, Move Up / Move Down, and public /info FAQ order.
