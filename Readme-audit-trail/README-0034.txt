README-0034.txt — Documents required-fields plural validation patch

Purpose
- Fix Documents Admin validation order so all missing required fields are shown before the Make Live / Save Draft prompt.
- Add red warnings near each problem field, plural: Title and PDF/source upload areas can all show errors at the same time.
- Restore tighter two-column input alignment for Title/System Slug and Category/Visibility fields.

Changed files
- assets/admin/ADMIN-PAGE-documents-current.js

Version
- ADMIN-PAGE-documents-current.js now reports 2026-06-05-003-E.

No SQL, Edge Function, public renderer, or Webflow embed changes.

Expected test
1. Create New Document.
2. Click Save Document with no title and no PDF.
3. The title field should be red and show a title warning.
4. The PDF upload area should be red and show a PDF warning.
5. The Save area should show a combined red warning.
6. The Make Live / Save Draft prompt should not appear until required fields pass.
