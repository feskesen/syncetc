README-0013 — Home Marquee Entry/Pause Patch

Purpose
This package adjusts the Home page announcement marquee/banner-tow behavior after testing showed that the airplane/banner appeared partway across the content area instead of entering from offscreen right.

Problem Addressed
The prior marquee patch intentionally started the banner already visible near the right side to avoid a long delay. In practice, that made the plane/banner pop into the page rather than scroll in naturally. The center pause was also too short for easy reading.

Changes Made
- Updated PUBLIC-PAGE-home-current.js only.
- The marquee now starts just beyond the right edge of the marquee viewport.
- The first part of the airplane/banner should appear almost immediately after page load, then move naturally into the content area.
- The banner now pauses longer in the center.
- The banner scrolls off the left side, pauses offscreen briefly, and repeats.
- No database changes.
- No Edge Function changes.
- No Webflow embed changes.

Expected Test Result
On /home, the marquee should:
1. enter from the right edge instead of popping into the middle/right side;
2. pause in the center long enough to read;
3. scroll off the left edge;
4. wait briefly offscreen;
5. repeat.

Next Expected Work
If the motion feels right, the next improvement should be a shared media picker/uploader for reusable images such as marquee tow-plane images, page images, logos, gallery items, and other customer media.
