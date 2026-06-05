README-0011
Package: public Home page + public site shell foundation
Date: 2026-06-05

Purpose
This package creates the first shared public site shell and the first public Home page renderer. It also adds storage for contact form submissions so public inquiries are saved in Supabase before any future email notification is attempted.

Problem addressed
The Aircraft page proved that a public page renderer can pull page content, layout/style settings, and module data from Supabase. The next shared requirement is a reusable public shell/header/footer and a Home renderer that uses Page Editor content instead of hardcoded 150th Aero copy. The old Webflow Home page also used Make.com for contact form delivery and hardcoded fallback image behavior; this package replaces that pattern with Supabase-backed storage and optional featured media.

What changed
1. Added core_contact_inquiries for public Contact Us submissions.
2. Added core_gallery_media as a lightweight future Gallery/featured-photo foundation.
3. Added public-safe views for navigation and featured gallery images.
4. Updated the Home template contract and seeded generic Home Page Editor fields.
5. Added a reusable public site shell JavaScript component for header/nav/footer.
6. Added a public Home page renderer JavaScript file.
7. Updated the Page Editor so Home fields are editable through the admin UI.
8. Extended core-public-render with get_home_page and submit_contact_inquiry actions.

Important design decisions
- No 150th-specific content is hardcoded into the SaaS renderer.
- Blank optional Home fields are omitted publicly.
- Featured photo disappears publicly if no public featured gallery image exists.
- Contact inquiries are stored in Supabase first; email notification is deferred.
- The public shell/header/footer is a shared component, not owned by the Home page template.
- The marquee/banner-tow component is page-controlled and can be reused on other public pages later.

Expected next step
After this passes, test /home with a published Home page. Then we should decide whether to retrofit the existing Aircraft public page to use the shared site shell or move next to Info/FAQ.
