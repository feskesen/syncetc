README-0021
Package: Info/FAQ corporate-admin regression patch
Date: 2026-06-05

Purpose
This package fixes the Info/FAQ admin workflow after the FAQ item editor was separated too aggressively from the Page Editor. The public Info page already looked acceptable, so this package focuses on restoring a clear corporate-admin workflow without starting the larger Documents module.

Problem Addressed
- Page Editor showed Info page copy fields but no obvious way to manage the actual FAQ question/answer records.
- FAQ item editing needed clearer labels and dirty-state protection.
- Manual officer rows needed clearer helper text using Role | Name only, with no suggestion to publish officer emails.
- FAQ seeding/import should support CSV so existing FAQ lists can be loaded without hand-entering every item.
- Documents/versioning/checkout workflow is intentionally not included here; that should be its own protected-storage package.

Files in This Package
1. ADMIN-PAGE-page-editor-current.js
   - Restores an inline Structured FAQ Items manager inside Page Editor when the Info page is selected.
   - Adds FAQ Save/New/Archive/Restore workflow with unsaved-change warnings.
   - Adds CSV paste/upload preview and import for FAQ rows.
   - Keeps FAQ item dirty state separate from normal page-copy dirty state.
   - Uses helper text for manual officer rows: Role | Name.

2. PUBLIC-PAGE-info-current.js
   - Small compatibility patch.
   - Continues to suppress public officer emails.
   - Supports manual_officers_json or legacy manual_officers_text.
   - Supports FAQ category or category_label display.

Expected Result
- Page Editor > Info shows page copy fields plus a visible Structured FAQ Items section.
- FAQ items can be created, edited, archived/restored, and CSV-imported from the same corporate-admin workflow.
- FAQ item edits do not falsely mark the page-copy editor dirty.
- Public Info page continues to render correctly.

Not Included
- No SQL changes.
- No Edge Function changes.
- No Webflow embed changes.
- No Documents module yet.
