README-0027 — Documents / Resources foundation

Purpose
- Added the first Documents / Resources module for platform-admin management and public document display.
- The module is designed around permanent document records plus uploaded versions. New uploads create new versions; prior versions are preserved.
- This avoids trying to build a word processor. Admins download/edit externally, then upload a new version and publish it.

Problem addressed
- Clubs need public, member, admin, and board/internal documents, but Webflow/drive-style replacement is unsafe and weak for audit/history.
- The system needs a live/published version while retaining draft/superseded/rejected versions.
- Public pages must never expose private/member/admin documents.

What changed
- Added private Supabase Storage bucket: core-documents.
- Added tables: core_documents, core_document_versions, core_document_events.
- Added views: core_documents_admin_v1 and core_documents_public_v1.
- Added Documents template registry entry.
- Added Edge Function actions to core-admin-action for documents, versions, publish/approve/reject, archive/restore, and signed downloads.
- Added public renderer action to core-public-render: get_documents_page.
- Added admin page: ADMIN-PAGE-documents-current.js.
- Added public page renderer: PUBLIC-PAGE-documents-current.js.
- Added Page Editor fields for Documents page copy.
- Added Documents nav item to the platform admin shell.

Security / access notes
- Non-public documents are stored in the private core-documents bucket.
- Public renderer only returns documents with visibility=public and a published version.
- Public downloads use signed URLs from the public Edge Function only for public published documents.
- Member/admin/board documents are not publicly rendered yet. Member-gated document display will be a later module after member portal gating is complete.

Known limitations / future work
- No in-browser word processor, redline/compare, Google Docs sync, or e-signature yet.
- No customer-facing document admin yet; this is platform-admin tooling.
- No checkout lock in v1. Version history is the main protection against destructive overwrite.
- Member/private document renderer will come after member portal/auth gating is in place.

Expected next step
- Run SQL, deploy Edge Functions, upload GitHub files, create /documents-admin and /documents test pages, then verify: upload public document -> publish -> appears on /documents; upload member/admin document -> does not appear publicly; upload new version -> prior version remains in history.
