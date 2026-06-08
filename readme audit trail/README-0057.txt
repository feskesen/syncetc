README-0057 — Portal Page Activation + Roster Cleanup

Version: 2026-06-07-012-A

Purpose:
- Connect Organization People and User Roster pages to the existing template/page activation architecture.
- Stop portal navigation from showing pages that are not enabled for the selected organization.
- Block direct page use when the page is not enabled for that organization.
- Register Roster and People & Access in core_template_registry.
- Add active core_customer_pages rows for existing active customers/organizations when missing.
- Let Roster and People hero title/intro read from core_page_settings.
- Change roster summary label from Visible to Active Roster.
- Change roster and People exports from CSV to TSV / Export for Excel.
- Add simple roster filters for membership class, board/officers, and optional aviation pills.

Files changed:
- supabase/sql/PORTAL-PAGE-ACTIVATION-0057.sql
- supabase/functions/core-access-action/index.ts
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/user/USER-PAGE-dashboard-current.js
- assets/user/USER-PAGE-roster-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-dashboard-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Notes:
- No Webflow embed changes.
- SQL is idempotent for template registration and does not overwrite existing customer page rows.
- Existing disabled/archived customer page rows are not revived by this script.
