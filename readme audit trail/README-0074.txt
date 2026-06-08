README-0074 — Member/Internal Documents package

Version: 2026-06-08-025-A

Purpose:
- Add protected member-only and internal/admin-only document viewer pages.
- Keep public Documents page public-only.
- Keep member and internal document pages non-cumulative: each page returns only its own visibility scope.

Files:
- supabase/sql/MEMBER-INTERNAL-DOCUMENTS-0074.sql
- supabase/functions/core-access-action/index.ts
- assets/user/USER-PAGE-documents-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-internal-documents-current.js
- webflow embeds/WEBFLOW-user-member-documents.txt
- webflow embeds/WEBFLOW-organization-internal-documents.txt

Security notes:
- Protected document records are filtered in core-access-action before reaching the browser.
- Member Documents returns only member/user visibility documents.
- Internal Documents returns only board/internal/admin visibility documents.
- Public Documents remains separate and still returns public-only documents through core-public-render.
- Signed document URLs are generated server-side and expire.

Install order:
1. Run SQL.
2. Deploy core-access-action.
3. Upload GitHub JS files.
4. Create Webflow pages /member-documents and /internal-documents.
5. Enable/publish/show pages in Page Setup.
