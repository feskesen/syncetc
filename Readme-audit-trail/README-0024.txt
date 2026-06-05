README-0024
Package: FAQ ordering UI redesign patch
Date: 2026-06-05

Purpose
This patch replaces the previous drag-and-scroll FAQ ordering interface with a clearer, full-width FAQ records section.

Problem addressed
The drag reorder interface inside a scroll panel was not intuitive. Rows visually shuffled around, archived records were not obvious enough, and the scroll area made ordering harder to understand.

What changed
- Removed drag-to-reorder behavior from the FAQ records list.
- Added category-grouped FAQ panels that expand/collapse.
- Added clear Move Up / Move Down buttons for reorder within a category.
- Removed the FAQ records scroll-box behavior so the list can breathe in the page layout.
- Added stronger visual status pills: green Active and red Archived.
- Added answer previews inside expandable FAQ rows.
- Kept CSV helper text/import behavior from README-0023.
- Updated the Page Editor version marker to 2026-06-05-004-B.

Files to upload
- assets/admin/ADMIN-PAGE-page-editor-current.js

Expected result
The Info page FAQ editor should be easier to understand: edit/new FAQ at the top, FAQ Order & Records below, grouped by category, with obvious Active/Archived states and Move Up / Move Down controls.

No SQL, Edge Function, or Webflow embed changes are included.
