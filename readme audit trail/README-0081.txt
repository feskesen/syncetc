README-0081
Package: Header / Navigation Setup Foundation
Version: 2026-06-08-081-A / 2026-06-08-027-A

Purpose:
Build the first data-backed Header / Navigation Setup system for SyncEtc. This package makes header labels, row labels, row assignment, link order, show/hide, and privacy-first page access settings configurable by platform admin while preserving the single shared organization header and no-blue-flash behavior.

Commercial privacy rule:
This package errs on privacy. Header placement and actual page access/security are separate. Sensitive pages cannot become truly public unless a public-safe renderer is explicitly enabled and dangerous-public approval is present. Sensitive admin/platform pages are blocked from public exposure.

Files changed / added:
- supabase/sql/0081-header-navigation-setup-foundation.sql
- supabase/functions/core-admin-action/index.ts
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-public-render/index.ts
- assets/core/CORE-COMPONENT-organization-header-current.js
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/core/CORE-COMPONENT-admin-shell-current.js
- assets/public/PUBLIC-COMPONENT-site-shell-current.js
- assets/admin/ADMIN-PAGE-header-navigation-setup-current.js
- webflow embeds/header-navigation-setup-embed.txt

New database objects:
- core_navigation_profiles
- core_navigation_rows
- core_navigation_items
- core_page_access_settings
- core_navigation_settings_history
- core_navigation_default_row(...)
- core_navigation_default_access_level(...)
- core_navigation_default_risk_level(...)
- core_navigation_effective_v1
- core_public_navigation_v2
- core_portal_navigation_v1

Backend changes:
- core-admin-action adds platform-admin actions:
  - navigation_list_organizations
  - navigation_get_setup
  - navigation_save_setup
- core-access-action adds navigation_profile, navigation_rows, and navigation_items to access rows when the new views are present.
- core-public-render uses core_public_navigation_v2 when available and checks page access settings before public rendering.

Header/shell changes:
- Shared organization header now consumes explicit navigation rows/items when supplied.
- Existing hardcoded row assignment remains only as a compatibility fallback.
- The duplicate organization context row is hidden by default unless multiple organizations are available or the profile explicitly enables it.
- Portal shell passes configured navigation from core-access-action to the shared header.
- Public shell passes public-safe navigation from core-public-render and logged-in navigation from core-access-action to the shared header.
- Admin shell adds a Header / Nav Setup link.

New admin UI:
- ADMIN-PAGE-header-navigation-setup-current.js provides platform-admin UI for:
  - header layout options
  - row labels/order/visibility
  - link labels/row assignment/order/show-hide
  - actual page access/security settings
  - privacy warnings and dangerous confirmation field
  - simple live preview

Not included / intentionally deferred:
- Dropdown menu rendering is schema-supported but not activated in this first build.
- Customer-admin editing of header/nav is deferred. Platform admin only.
- True public roster/member/internal/admin data exposure is not enabled.
- Domain-based public organization auto-resolution is not included; existing data-organization-key embed behavior remains.

Install notes:
1. Run supabase/sql/0081-header-navigation-setup-foundation.sql in Supabase SQL Editor first.
2. Deploy updated Edge Functions.
3. Upload updated GitHub Pages assets using the stable production filenames.
4. Create a Webflow page for Header / Nav Setup if needed and use webflow embeds/header-navigation-setup-embed.txt.
5. Test with full debug URLs listed in INSTALL-0081.txt.
