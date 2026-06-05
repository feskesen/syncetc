README-0018 — Aircraft Public Shell Navigation Patch

Purpose
This patch fixes a consistency bug on the public Aircraft page. The Aircraft page was loading the shared shell script, but its public render payload did not include the same site_shell/navigation data that Home and Gallery receive. As a result, the Aircraft header rendered with only the organization name/logo/login button and no shared navigation row.

Problem Addressed
Home and Gallery used the shared public site shell with navigation. Aircraft was retrofitted later and its frontend used the shell, but the core-public-render Edge Function's get_aircraft_page response did not include site_shell. The shell therefore had no nav_items to render.

What Changed
- Updated core-public-render get_aircraft_page payload to include site_shell.
- Uses the existing getPublicSiteShell helper already used by Home and Gallery.
- Uses the same public site settings normalization for the Aircraft site payload.

Expected Result
After deployment, /aircraft should use the same shared header/footer/nav behavior as /home and /gallery, including Home / Aircraft / Gallery nav links when those pages are enabled, published, and shown in nav.

Files in Package
- core-public-render/index.ts: deploy to supabase/functions/core-public-render/index.ts
- README-0018.txt: upload to readme audit trail/README-0018.txt

No SQL changes. No GitHub public JS changes. No Webflow embed changes.
