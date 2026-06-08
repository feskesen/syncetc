README-0025 — Info/FAQ FAQ Ordering UI Patch C

Purpose
- Minor UI-only patch for the Page Editor FAQ manager.
- This is version 2026-06-05-004-C.

Problem
- Archived FAQ rows still showed edit/reorder controls even though archived records should remain untouched.
- Drag reorder had been removed during the prior cleanup, making ordering less intuitive.

Changes
- Archived FAQ rows now show only Restore FAQ.
- Archived FAQ rows are not editable or reorderable until restored.
- Drag reorder is restored for active FAQ rows within the same category.
- Move Up / Move Down remain available for active FAQ rows as a fallback.
- Archived selected FAQ fields are disabled and show a read-only notice.

Files
- ADMIN-PAGE-page-editor-current.js

Deployment
- Upload ADMIN-PAGE-page-editor-current.js to assets/admin/
- Upload this README to readme audit trail/README-0025.txt

No SQL, Edge Function, public renderer, or Webflow embed changes.
