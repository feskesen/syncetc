README-0019
Package: info_faq_public_page_package
Date: 2026-06-05

Purpose
- Add the public Info / FAQ page as the next customer-facing page.
- Patch Aircraft public body width so it fills the shared public site shell consistently.
- Add structured FAQ records instead of storing FAQs as one large text block.
- Add planned dynamic/manual/hybrid officer support: dynamic officer records can later come from people + memberships + roles, while manual rows are available now through Page Editor.

Problem Addressed
- Aircraft was now using the shared header/footer, but its page body still used an older self-contained max-width layout.
- Info/FAQ needed to support two-column informational content, FAQ accordion behavior, broad/non-aviation FAQ categories, and dynamic website behavior instead of hardcoded 150th-specific page content.
- Board/officer display should ultimately update from the roster/role system, but the product still needs a manual fallback while the roster/member module matures.

What Changed
- SQL creates public.core_info_faq_items for structured FAQ records.
- SQL creates public.core_info_faq_public_v1 for public-safe FAQ retrieval.
- SQL creates public.core_public_officers_v1 as the future dynamic officer source.
- SQL registers/updates the info template and seeds generic Info page defaults.
- core-admin-action adds actions to list, create/update, archive, and restore Info FAQ rows.
- core-public-render adds get_info_page.
- Page Editor adds Info/FAQ fields and an embedded FAQ manager.
- Public Info renderer adds hero, two-tone/two-column content, board/officer card, FAQ accordion, contact card, and page note.
- Aircraft public JS is patched so the body width fits the shared public shell.

Expected Next
- Run SQL, deploy Edge Functions, upload GitHub files, create /info Webflow page, enable/publish Info in Page Setup/Page Editor, then test /info.
- After Info/FAQ works, likely next public pages are Documents or Calendar/Events depending on whether we want to tackle permissions/doc visibility or RSVP workflow first.
