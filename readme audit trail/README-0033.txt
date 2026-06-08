README-0033.txt

Purpose
- Patch Documents Admin validation so a new document cannot be saved with only a title and no attached viewable document.

Problem
- The title-required validation worked, but a platform admin could still save a brand-new document record with no uploaded PDF/version attached. That created an empty document record with no usable live/viewable file.

Change
- Documents Admin now requires a Viewable PDF / Live File before saving a new document that has no existing versions.
- The PDF upload area is highlighted red and an inline warning appears near Save Document if the user tries to save a new document without a PDF.
- Existing document records that already have versions can still be edited without uploading a new file.

Files
- assets/admin/ADMIN-PAGE-documents-current.js

Version
- Documents Admin version badge: 2026-06-05-003-D

No SQL. No Edge Function. No Webflow embed change.
