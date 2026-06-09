README-0087 — Contact Tracker sender name and style-load cleanup

Purpose:
- Fix prefab template sender placeholder behavior.
- Prevent Contact Tracker from rendering a default hardcoded-blue styled screen before organization style is available.

Changes:
- core-access-action now resolves {{sender_name}} from the actor's organization person/display record when possible.
- {{sender_email}} remains the authenticated user's email address.
- Contact Tracker client preview now uses actor/person display name returned by the backend.
- Contact Tracker no longer renders the full styled page during initial load before access/style data arrives.
- Removed hardcoded blue gradient/focus accents from Contact Tracker styling and replaced them with organization-derived colors.

Files:
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-contact-tracker-current.js

No SQL changes.
No Webflow changes.

Test URLs:
- https://syncetc.webflow.io/contact-tracker?syncetc_debug=1
- https://syncetc.webflow.io/user-dashboard?syncetc_debug=1
- https://syncetc.webflow.io/organization-people?syncetc_debug=1
