README-0036 — Documents Admin validation and preview repair

Purpose
- Repair the Documents / Resources admin page after the 003-E/003-F validation patches introduced broken validation state, empty red alert bars, source-file false warnings, and field layout regressions.
- Add PDF preview panels to the document record list and public Documents page.

What changed
- Centralized document save validation so required-field errors are collected together before any Make Live / Save Draft prompt appears.
- Title, viewable PDF, editable source, and PDF/source confirmation now each show warnings only when that specific area actually has a problem.
- Removed empty red alert strips by hiding alert containers unless they have text.
- Fixed the source-file logic so a valid DOCX/source file is not marked invalid merely because the matching PDF is missing. In that case, only the PDF/live-file area is marked as the missing required field.
- Repaired the two-column field alignment for Title/System Slug and Category/Visibility.
- Kept the live/viewable file restricted to PDF for now. Public/member document viewing expects reliable PDF preview/download behavior. Images or other viewable file types can be added later as a separate feature.
- Added small live PDF preview panels in the Documents Admin record list for documents that have a current live version.
- Added embedded PDF preview panels to public document cards, while preserving the larger modal preview and Download PDF button.

Expected behavior
- Saving with no title and no PDF shows warnings near Title, the PDF drop area, and the Save area.
- Uploading a DOCX/source file without a matching PDF shows the PDF area as missing, not the source area as invalid.
- Uploading a PDF into Editable Source File is rejected.
- Uploading a non-PDF into Viewable PDF / Live File is rejected.
- The Make Live / Save Draft prompt appears only after required fields and file-pairing rules pass.
- Admin record previews may show a small embedded PDF preview for live documents. If a preview cannot load, use Version History preview/download.

Files in this package
- ADMIN-PAGE-documents-current.js
- PUBLIC-PAGE-documents-current.js
- README-0036.txt

No SQL changes.
No Edge Function changes.
No Webflow embed changes.
