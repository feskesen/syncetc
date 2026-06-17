SYNCETC 0116-P — Qualifications Grid + Field Rules Polish

Purpose
- Polish the People qualifications single-source workflow after 0116-O.
- Make person qualifications read/edit like a structured grid rather than a stack of uneven mini-forms.
- Correct CFI/CFII/MEI wording so the UI tracks instructor privileges/currency rather than saying the FAA certificate expires.
- Keep qualification definitions as the source of truth for whether a field appears on person profiles.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt
- supabase/sql/0116-P-qualifications-grid-field-rules-polish.sql

Expected versions
- Organization Management: 2026-06-16-116-P
- People Workbench: 2026-06-16-116-P
- core-access-action: 2026-06-16-116-P

Install order
1. Run supabase/sql/0116-P-qualifications-grid-field-rules-polish.sql in Supabase SQL Editor.
2. Deploy supabase/functions/core-access-action/index.ts to the core-access-action Edge Function.
3. Upload the two GitHub asset files to their existing production paths.

Functional notes
- Members / People → Aviation / Qualifications now uses a table/grid-style editor with columns:
  Qualification, Status / value, Completed / issued, Expires / current through, Notes.
- The grid horizontally scrolls inside the qualifications panel when the available width is too small.
- CFI, CFII, and MEI default to "Privileges current through" instead of "Certificate expires".
- Club Instructor defaults to "Approval current through".
- People → Qualifications now includes a "Show on person profile" setting.
- Only active qualification definitions with Show on person profile enabled appear in the normal person qualification grid.
- Hidden/inactive qualification assignments are preserved when saving a person record; hiding a definition should not silently erase prior person data.

Validation performed
- JavaScript syntax check passed for Organization Management.
- JavaScript syntax check passed for People Workbench.
- Edge Function TypeScript transpile/parse check passed.
- index.ts and index.ts.txt copies match.
