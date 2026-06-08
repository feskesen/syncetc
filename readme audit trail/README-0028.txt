README-0028 — Documents / Resources admin usability and preview patch

Purpose
- Repair and clarify the first-pass Documents / Resources workflow after testing.
- Keep the module focused on platform/corporate admin tooling while making create/edit state safer and clearer.

Problems addressed
- Duplicate organization display names were hard to distinguish in the Documents Admin organization selector.
- Loading the Documents Admin page could appear dirty even when no document was edited.
- The document key/slug was editable, which is not desirable for protected system identifiers.
- The editor appeared open by default, making it unclear whether the admin was creating a new document or editing an existing one.
- Version history controls were unclear, especially for making an older version live again.
- The public Documents page only offered a download-style experience and needed a better grouped/card layout.

Changes made
- Documents Admin now starts in an idle state: select a record to edit or click New Document.
- Save closes the editor and returns to the idle state.
- The editor header explicitly says Creating New Document, Editing: [title], or Archived: [title].
- Organization dropdown labels now include the organization/customer key in parentheses.
- Document key/slug is now readonly and auto-generated from title for new documents.
- Archived documents are locked for editing until restored.
- Version history now has clearer labels: Preview, Download, Approve, Publish / Make Live, Make Live Again.
- Admin Edge Function now returns both preview and download signed URLs for document versions.
- Public Edge Function now returns preview and download signed URLs for public documents.
- Public Documents renderer now groups documents by collapsible category and shows Open / Preview plus Download actions.

Files to upload/deploy
- assets/admin/ADMIN-PAGE-documents-current.js
- assets/public/PUBLIC-PAGE-documents-current.js
- supabase/functions/core-admin-action/index.ts
- supabase/functions/core-public-render/index.ts

Expected behavior
- Opening Documents Admin should remain Saved / clean until the admin chooses New Document or selects a record and changes something.
- Slug/key should be visible but not editable.
- Public documents should display in grouped cards with Open / Preview and Download actions.
- Private/member/admin/board/internal documents should remain hidden from the public renderer.

Notes
- No SQL changes are included in this patch.
- No Webflow embed changes are included in this patch.
- Member-only document rendering is still a later module.
