README-0032 — Documents Admin required-title validation patch

Purpose
- Fixes a confusing save failure on Documents Admin when the document title is missing.
- Previously, the backend/debug output showed the title requirement, but the visible form did not clearly indicate the problem.

Changes
- Bumped Documents Admin version to 2026-06-05-003-C.
- Added red inline validation on the Title field when missing.
- Added the same visible error near the Save Document button.
- Title input clears the title warning once the user starts typing.

Files
- assets/admin/ADMIN-PAGE-documents-current.js

No SQL, Edge Function, public page, or Webflow embed changes.
