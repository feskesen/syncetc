README-0031 — Documents save/live prompt patch

Purpose
- Adjusted Documents Admin save flow so an uploaded PDF version is saved only after the admin chooses whether to make it live now or save it as draft.
- Removed the prior Publish Now dropdown from the editor to reduce confusion.

Changes
- ADMIN-PAGE-documents-current.js bumped to internal version 2026-06-05-003-B.
- When saving a document with a PDF upload, a modal now asks:
  - Make Live Now
  - Save as Draft
- Escape/clicking outside the modal defaults to Save as Draft.
- Existing live versions remain in version history when replaced.
- No SQL, Edge Function, public page, or Webflow embed changes.

Expected next test
- Upload a PDF and click Save Document.
- Choose Save as Draft and confirm it does not appear as live.
- Upload another PDF and choose Make Live Now.
- Confirm the document appears on the public Documents page if visibility is Public and the page is published.
