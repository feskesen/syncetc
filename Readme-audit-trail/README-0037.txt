README-0037 — Documents public card layout patch

Purpose
- Repair the public Documents/Resources page layout so document text never escapes the card.
- Reorganize cards into a cleaner vertical structure: title, PDF preview, description/meta, then actions.
- Rename public action buttons to simple labels: View and Download.
- Keep category groups open/collapsible with no SQL, Edge Function, or Webflow embed changes.

Files
- PUBLIC-PAGE-documents-current.js
  Upload to: assets/public/PUBLIC-PAGE-documents-current.js

Expected result
- Public document cards wrap into a responsive grid.
- Each card contains its own title, preview, metadata, and buttons without horizontal overflow.
- PDF preview remains embedded using the browser PDF viewer.
- View opens the larger modal preview.
- Download opens/downloads the PDF.

Version
- PUBLIC-PAGE-documents-current.js internal version: 2026-06-05-004-A
