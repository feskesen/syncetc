README-0068 — Organization People Finder Layout Patch

Version: 2026-06-08-023-A
Package: organization_people_finder_layout_package_0068.zip

Purpose:
- Improve Organization Admin → People & Access finder UX.
- Reduce vertical space used before the editor.
- Reduce nested-scroll / scroll-trap behavior.

Changed file:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Changes:
- Reorganized Find a person into a two-column finder section.
- Left side: title, search, filters, export/print/refresh/new buttons.
- Right side: compact person picker list.
- Replaced three-column person cards with compact name-only rows.
- Kept full selected-person editor below the finder.
- Preserved existing People editor functionality, including photo upload, save, archive/restore, filters, export, printable list, and nav-away protection.

Not changed:
- No SQL.
- No Edge Function.
- No Webflow embed.
- No shared header, portal shell, or public shell changes.

Testing:
- Confirm version 2026-06-08-023-A.
- Open /organization-people.
- Confirm finder uses left controls + right compact list.
- Confirm selecting a person opens the full-width editor below.
- Confirm filters/search still work.
- Confirm photo upload still works.
- Confirm save/archive/restore still work.
