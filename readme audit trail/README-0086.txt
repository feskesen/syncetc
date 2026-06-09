README-0086 Contact Template Editor UI Cleanup

Purpose
- Clean up Contact Tracker prefab template editor UI after 0085 testing.

Changes
- Updated CUSTOMER-ADMIN-PAGE-contact-tracker-current.js to version 2026-06-08-086-A.
- Removed the normal editable Template Key field from the main form.
- Kept Template Key as read-only Advanced information.
- Renamed "Rich-text-lite message" to "Message".
- Changed placeholder button from "first name" / {{first_name}} to "contact name" / {{name}}.
- Removed the info URL placeholder button so organizations can manually type links they want included.
- Added sender email placeholder button.
- Reduced modal nested scrolling by making modal body the single scroll area.
- Updated core-access-action to version 2026-06-08-086-A and added {{name}} token support while preserving {{first_name}} compatibility.
- Added SQL to update the seeded application-info template if it still contains old {{first_name}} or {{info_url}} placeholders.

Files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-contact-tracker-current.js
- supabase/functions/core-access-action/index.ts
- supabase/sql/0086-contact-template-editor-ui-cleanup.sql

Install
1. Run the SQL file.
2. Deploy core-access-action.
3. Upload the customer-admin JS file to GitHub Pages.
4. Hard refresh https://syncetc.webflow.io/contact-tracker?syncetc_debug=1

Notes
- No Webflow embed changes required.
- No public page changes required.
- This is a UI cleanup/security-safe patch only.
