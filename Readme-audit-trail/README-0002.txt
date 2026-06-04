README-0002 — Admin UI Gating Retrofit

Purpose
- Apply the same logged-in/logged-out admin UI gating pattern used on Aircraft Admin to the older platform-admin pages.

Problem observed
- The backend correctly required a Supabase session and platform-admin authorization before returning data or saving changes.
- However, when logged out, the browser could still show admin form fields and page controls on several Webflow-hosted admin pages.
- This created confusion and made the admin area look less protected than it actually was.

What changed
- The older admin page files now hide their main work areas while logged out.
- Each page shows a Login Required notice until a valid Supabase Auth session is detected.
- Each page calls the shared admin shell auth-state hook so the shell can know whether the page requires admin authentication.
- Backend security remains unchanged: real access control still comes from Supabase Auth, JWT verification, Edge Function platform-admin checks, RLS policies, and Storage policies.

Important security note
- This is not server-side route protection. These are static Webflow/GitHub-loaded pages, so their HTML/JS can still be loaded by a browser.
- The true security boundary is the backend: no protected data or write action should be allowed without a valid authenticated, authorized user.
- This patch is still useful because it prevents logged-out users from casually viewing/editing form interfaces in the page UI.

Files to upload
- Put all ADMIN-PAGE-*.js files in assets/admin/.
- Put CORE-COMPONENT-admin-shell-current.js in assets/core/.
- Put this README-0002.txt file in your readme audit trail folder.

Expected result
- When logged out, each patched admin page should show login/status plus a Login Required notice.
- Main editing/list/detail controls should be hidden until login.
- After login, each page should load and behave as it did before.

Next expected work
- If these older admin pages test cleanly, the next major step is to build the first public/customer-facing Aircraft page renderer using the records created in Aircraft Admin.
