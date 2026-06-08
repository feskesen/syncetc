README-0067 — Person Photo Upload + Roster Photo Data

Package purpose:
- Add real person profile photo upload/remove support for Organization Admin -> People & Access.
- Store uploaded images in Supabase Storage bucket core-assets.
- Store photo references in core_people.profile_json.
- Return photo_url through organization people and roster data.
- Preserve the existing roster initials fallback when no photo exists.

Files included:
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Files intentionally not included:
- CORE-COMPONENT-portal-shell-current.js
- PUBLIC-COMPONENT-site-shell-current.js
- CORE-COMPONENT-organization-header-current.js
- USER-PAGE-roster-current.js

Notes:
- No SQL is required.
- No Webflow embed change is required.
- This package deliberately does not touch the unified header, portal shell, public shell, or roster render gate work.

Version:
- core-access-action: 2026-06-08-022-A
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-08-022-A

Security:
- Photo actions require organization people/access permissions or platform override.
- Only JPG, PNG, and WebP images are accepted.
- Maximum image size is 5 MB.
- Image data is redacted from audit logs.
- Password handling is not changed.
