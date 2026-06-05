README-0029 — Documents PDF/source pairing patch

Purpose
- Prevent Word/source documents from becoming the live/viewable document without a matching PDF rendition.
- Preserve the editable/source file for administrators while showing only the PDF rendition on public/member-facing document pages.
- Improve document preview behavior by making PDF preview the primary live-document preview path.

What changed
- Documents Admin now has two upload areas:
  1. Viewable PDF / Live File
  2. Editable Source File
- Uploading an editable/source file requires a matching PDF upload before saving.
- When a source file is uploaded, the admin must confirm that the PDF matches the source file.
- New document versions store the PDF as the primary version file and store the source file metadata in version metadata_json.
- Version History now distinguishes Viewable PDF from Editable Source.
- Admins can Preview PDF, Download PDF, and Download Source when a source file exists.
- Publishing is blocked unless the version has a PDF rendition.
- Public Documents renderer labels actions as Preview PDF / Download PDF.
- Public render payload filters out non-PDF published versions so public/member pages do not expose Word/source files.

Files changed
- assets/admin/ADMIN-PAGE-documents-current.js
- assets/public/PUBLIC-PAGE-documents-current.js
- supabase/functions/core-admin-action/index.ts
- supabase/functions/core-public-render/index.ts

No SQL changes
- This patch uses existing core_document_versions.metadata_json to store source-file metadata.
- The existing core-documents private storage bucket is reused.

Expected next
- Test PDF-only upload/publish.
- Test Word/source + matching PDF upload/publish.
- Confirm source-only save is blocked.
- Confirm public /documents shows only PDFs.
- After this passes, move to the next module rather than continuing to expand Documents unless a blocking issue appears.
