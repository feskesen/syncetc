README-0008

Purpose
This package corrects the first public Aircraft page image-optimization patch.

Problem
The prior patch generated Supabase transformed image URLs with only a width value. Supabase image transformations can crop when only one dimension is supplied. On the Aircraft page, this made images look zoomed/cropped instead of simply reduced for web delivery.

Resolution
1. The public render Edge Function now requests transformed image URLs with a square bounding box: width=max, height=max, resize=contain, quality=72.
2. This makes the transformation behave like a maximum image size rather than a forced crop.
3. The Aircraft public renderer now defaults aircraft photo display to object-fit: contain unless a future style/template option explicitly asks for cover/crop behavior.

Files
- index.ts: replace supabase/functions/core-public-render/index.ts and redeploy core-public-render with JWT verification OFF.
- PUBLIC-PAGE-aircraft-current.js: replace assets/public/PUBLIC-PAGE-aircraft-current.js in GitHub.
- README-0008.txt: keep in the readme audit trail folder.

Expected Result
The Aircraft page should keep the same general layout, but aircraft images should no longer appear zoomed/cropped by the transformation URL. Image URLs should still use Supabase's render/image/public endpoint and should include width, height, resize=contain, and quality parameters.

Next Expected Step
After this patch is verified, continue testing Page Editor history/default restore and the public Aircraft page content/style rendering loop.
