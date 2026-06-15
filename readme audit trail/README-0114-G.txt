SyncEtc 0114-G Organization Management Accordion Overview Fallback

Purpose
- Small follow-up polish for the Organization Management left navigation.
- When the active major accordion section is closed, the main panel now returns to Overview so the left navigation and visible module state do not conflict.

Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js

No SQL
- No database changes.

No Edge Functions
- No Supabase Edge Function changes.

No Webflow embed changes
- Existing Organization Management embed remains unchanged.

Behavior after install
- Home / Overview remains always available.
- Only one major non-home section can be open at a time.
- Clicking a closed major section opens it and closes other major sections.
- Clicking the currently open major section closes it.
- If the visible module belongs to the section being closed, the main panel switches to Overview first, using the existing unsaved-change protection.

Version
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-14-114-G
