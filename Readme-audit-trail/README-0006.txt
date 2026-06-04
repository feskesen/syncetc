README-0006
Package: Public Aircraft image optimization patch

Purpose:
The first public Aircraft renderer worked, but aircraft images were being served as full public object URLs. That could force visitors to download large original uploads even when the images display inside smaller aircraft cards.

Problem addressed:
The public Aircraft page should request appropriately sized public image variants from Supabase Storage instead of downloading original image files for card-sized display. The transformation should act as a maximum delivered image size for the renderer, not as a forced crop or required fixed original size.

What changed:
1. The public Edge Function now converts Supabase Storage object URLs/paths into Supabase image-render URLs for aircraft photos.
2. Public aircraft card images are capped at 800px delivered width with quality 72.
3. The Edge Function also returns a responsive srcset with 320px, 480px, 640px, and 800px variants.
4. The public Aircraft page JavaScript now uses srcset and sizes so the browser can choose the smallest useful version.
5. The patch does not set a transformed height. Aspect ratio is preserved by the image service; visual fitting/cropping remains controlled by the page CSS/card layout.

Files in this package:
- index.ts: replace supabase/functions/core-public-render/index.ts and redeploy core-public-render with JWT verification OFF.
- PUBLIC-PAGE-aircraft-current.js: replace assets/public/PUBLIC-PAGE-aircraft-current.js in GitHub.
- README-0006.txt: upload to readme audit trail/README-0006.txt.

Expected result:
The public Aircraft page should look the same but download smaller image variants. In browser developer tools, aircraft image requests should use /storage/v1/render/image/public/... instead of /storage/v1/object/public/... and include width/quality query parameters.

Next expected work:
After this passes, the likely next major step is deciding whether to harden Renderer Preview for the public Aircraft renderer or start the next operational module/page.
