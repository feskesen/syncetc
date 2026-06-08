README-0061 — Portal UX / Auth / Roster Repair

Version: 2026-06-07-016-A

Scope:
- Added real /login page asset/embed.
- Portal header now checks actual Supabase auth session for login/logout state.
- Header login points to /login with redirect back to the current page.
- Header logout signs out even if the page has no organization access.
- Platform admin override path preserved through core-access-action.
- Roster export remains tab-separated but is explained as “Export for Excel.”
- Roster printable view opens a clean printable roster, not diagnostics.
- People filter label changed from “Non-members” to “Non-member users.”
- Page roots now self-create if Webflow root div is missing, reducing blank-page failures.
- Page Setup left/right panel scroll behavior retained from 0060.

Install summary:
1. Deploy core-access-action.
2. Upload included JS files to GitHub.
3. Create /login Webflow page using the provided embed.
4. Publish Webflow and hard refresh test pages.

No SQL.
No core-admin-action deploy.
