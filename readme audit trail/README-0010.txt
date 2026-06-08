README-0010 — Public Aircraft Image Quality and Lightbox Patch

Purpose:
This patch improves the public Aircraft page image behavior after the 800 px transformed image version looked too soft/small on larger displays.

Problem:
The prior patch reduced bandwidth successfully, but the public aircraft cards only had transformed image variants up to 800 px. That was efficient, but not enough for large monitors, high-DPI screens, or panel detail review.

What changed:
1. The public Edge Function now returns transformed Supabase image URLs at larger, still-controlled sizes.
   - Card/default image: 1200 px max bounding box
   - Lightbox/enlarged image: 1600 px max bounding box
   - Responsive srcset: 480, 800, 1200, 1600
   - Still uses resize=contain to avoid cropping.

2. The public Aircraft renderer now supports click-to-enlarge image viewing.
   - Aircraft photos remain optimized on initial page load.
   - Clicking an image opens a modal/lightbox using the larger transformed image.
   - The original multi-megabyte upload is still not loaded by default.

3. The image card display area was made slightly taller so panels/exterior shots do not look as cramped.

4. A duplicated hero stat label render line was removed from the public renderer.

Expected next:
Test the public /aircraft page. Confirm:
- card images look clearer;
- clicking an image opens a larger view;
- closing works by clicking X, clicking outside the image, or pressing Escape;
- browser network requests use /storage/v1/render/image/public/ URLs, not raw original object URLs.

Files in this package:
- index.ts: replace supabase/functions/core-public-render/index.ts and redeploy core-public-render with JWT verification OFF.
- PUBLIC-PAGE-aircraft-current.js: replace assets/public/PUBLIC-PAGE-aircraft-current.js in GitHub.
- README-0010.txt: upload to readme audit trail/README-0010.txt.
