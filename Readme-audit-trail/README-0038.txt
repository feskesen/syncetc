README-0038.txt

Purpose:
- Minor public Documents page layout patch after testing showed PDF previews were too square and caused scrolling even for one-page portrait documents.

Changed:
- Updated assets/public/PUBLIC-PAGE-documents-current.js to version 2026-06-05-004-B.
- Changed public document preview boxes to use a portrait page aspect ratio instead of fixed square-ish height.
- Changed inline PDF preview request from FitH to Fit so the browser PDF viewer is more likely to show the full first page in the preview panel.

Expected result:
- One-page portrait PDFs should display much more like a full page preview.
- Multi-page PDFs may still show a scrollbar, which is acceptable and useful.
- View and Download buttons remain unchanged.

No SQL, Edge Function, Webflow embed, or admin page changes.
