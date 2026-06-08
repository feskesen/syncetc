README-0005
Package: Public Aircraft Page Renderer

Purpose:
This package creates the first customer-facing/public page renderer for Aircraft. It proves the full SaaS loop: Aircraft Admin creates records, Supabase stores the data/images, Page Editor stores page copy/options, Layout Designer stores style, and the public renderer combines them without hardcoding 150th Aero or any customer-specific fallback data.

Problem addressed:
The old Webflow Aircraft page had useful structure and visual direction, but its content was hardcoded for 150th Aero. The SaaS renderer needs to pull page content, aircraft data, and style dynamically from Supabase. Public visitors should not see private/member/admin aircraft data, dispatch status, maintenance status, tach/Hobbs, or notes.

How this package addresses it:
1. apply_public_aircraft_renderer_support.sql creates a public-safe aircraft view and updates the Aircraft template metadata.
2. index.ts creates a new public Edge Function named core-public-render. This function uses server-side Supabase access but only returns public-safe page/style/aircraft payloads.
3. PUBLIC-PAGE-aircraft-current.js renders the Aircraft page body in Webflow/GitHub from dynamic payloads.
4. WEBFLOW-aircraft-public-embed.txt is the copy/paste Webflow embed.

Important security notes:
- The new Edge Function must be deployed with JWT verification OFF because it is for public pages.
- The function does not expose member roster data, dispatch status, maintenance status, tach/Hobbs, or admin notes.
- Static page shell/JS can still be viewed by the browser, but protected data is only returned by the backend when public rules pass.

Expected next step:
After testing this renderer with the test organization, the next likely work is either (a) improve public Aircraft layout/style behavior based on what you see on screen, or (b) build the next full module slice such as Info/FAQ or Documents.
