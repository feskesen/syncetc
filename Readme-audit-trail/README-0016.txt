README-0016 — Aircraft Shell + Media Library Pagination Patch

Purpose
This package fixes two usability/consistency issues discovered after Home, Aircraft, and Gallery were all online:
1. The public Aircraft page was built before the shared public site shell existed, so it did not show the shared header/footer/nav used by Home and Gallery.
2. The Media Library list can become too long for real customers, especially organizations with hundreds of gallery records.

What changed
- WEBFLOW-aircraft-public-embed.txt now loads PUBLIC-COMPONENT-site-shell-current.js before PUBLIC-PAGE-aircraft-current.js so the Aircraft page uses the shared public header/footer like Home and Gallery.
- ADMIN-PAGE-media-library-current.js now paginates the Media Records list client-side with 10/25/50/100 row options, Prev/Next controls, visible count text, and a scroll-bounded records panel.
- Media filtering now resets to page 1 so the interface does not land on an empty later page after a filter change.

What did not change
- No SQL changes.
- No Edge Function changes.
- No public Gallery renderer changes.
- No YouTube API upload integration was added. Video remains YouTube/external-link based for now.

Expected next
After testing, the public Aircraft page should visually match the Home/Gallery shell behavior, and the Media Library should remain manageable with hundreds of records.
