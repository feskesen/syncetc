Purpose
- This patch hardens Aircraft Admin after first live testing.

Problem observed
- Logged-out users could still see the Aircraft Admin form fields in the browser, even though backend calls still required authentication.
- Uploaded aircraft photos displayed in a narrow cropped band instead of being contained inside the preview box.
- The shared admin shell needs a small reusable auth-state hook so future admin pages can use the same logged-in/logged-out behavior.

What changed
- ADMIN-PAGE-aircraft-admin-current.js now hides the Aircraft Admin working area until a valid Supabase session is active.
- The page now shows a clear "Login required" notice while logged out.
- Aircraft image previews now use contained image sizing instead of cropping.
- CORE-COMPONENT-admin-shell-current.js now exposes setAuthState/getAuthState for future shared admin-page gating.

Security note
- This is a user-interface gate, not the main security layer. Real security still comes from Supabase Auth, Edge Function checks, RLS, and platform-admin permission checks.

Expected result
- When logged out, only the login/status area and login-required message should be visible.
- After login, the aircraft list/form/images/debug panel should appear.
- Uploaded photos should fit inside the preview box without being cropped into a narrow strip.

Next expected work
- If this pattern works on Aircraft Admin, retrofit the same shared auth gating into the older admin pages.
