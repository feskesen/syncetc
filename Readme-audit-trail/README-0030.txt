README-0030 — Documents inline validation and PDF/source upload clarity

Purpose
- Improve the Documents / Resources admin upload UX without changing schema, Edge Functions, public renderer behavior, or Webflow embeds.

Problem addressed
- Saving with an editable source file but no matching PDF could appear to do nothing or fail without making the problem obvious enough.
- The editable source upload accepted PDFs, which confused the intended paired-document workflow.
- Action buttons looked too much like static pills.

What changed
- Added red inline validation messages in two places: near the upload boxes and near the Save Document button.
- Missing/incorrect upload areas are highlighted red.
- The Viewable PDF / Live File box rejects non-PDF files.
- The Editable Source File box rejects PDFs and only accepts editable/source-like formats such as DOC, DOCX, ODT, RTF, TXT, CSV, XLS, XLSX, ODS, PPT, PPTX, and ODP.
- Existing local PDF preview behavior remains; PDF previews are embedded in-page where the browser supports it.
- Added stronger hover/active styling for document admin action buttons.

Expected behavior
- If an editable source file is selected without a matching PDF, Save Document shows a red inline warning and does not save.
- If a PDF is placed in Editable Source File, the source upload area turns red and explains that PDFs belong in Viewable PDF / Live File.
- If a non-PDF is placed in Viewable PDF / Live File, the PDF area turns red and explains that only PDFs are allowed there.
- No SQL, Edge Function, public page, or Webflow embed changes are required.

Files
- assets/admin/ADMIN-PAGE-documents-current.js

Version
- ADMIN-PAGE-documents-current.js internal version: 2026-06-05-003-A
