README-0014 — Media Library + Public Gallery Foundation

Purpose
This package adds the first reusable Media Library workflow and a public Gallery page renderer. It lets a platform admin upload gallery photos to structured Supabase Storage, save metadata in Supabase, mark photos as featured, and render those photos publicly through the site shell.

Problem addressed
Home can show a random featured photo, but there was no clean way to seed public featured/gallery media. The old Webflow/Make.com approach used Webflow CMS and hardcoded fallbacks. This package moves that workflow into Supabase and keeps public renderers from relying on hardcoded customer data.

What changed
- Added/confirmed core_gallery_media and public gallery views.
- Added Gallery template contract/defaults.
- Added Media Library admin page.
- Added admin backend actions for listing, saving, archiving, and restoring gallery media.
- Added public Gallery renderer.
- Added public Edge Function support for get_gallery_page.
- Added Media Library to the admin shell navigation.
- Added Gallery-specific Page Editor fields.

Expected next
1. Create a Webflow /media-library admin page and upload a few test photos.
2. Mark one or more photos as Featured.
3. Confirm /home randomly shows a featured photo.
4. Create/enable/publish the /gallery page and confirm the public Gallery renders.
5. After this proves out, we can build a fuller Gallery Admin approval workflow or move to Info/FAQ.

Security notes
Uploads are admin-only through Supabase Auth, storage policies, and core-admin-action authorization. Public pages only receive active/public image records from the public render Edge Function. Private/member media should later use a separate private bucket or stricter storage path rules.
