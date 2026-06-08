README-0066-E
Package: Shared Header Required Style Gate
Version: 2026-06-07-021-E

Purpose:
- Stop the shared organization header from guessing customer styles.
- Require active organization style profile data before rendering the organization header.
- Show a large red STYLE CONFIGURATION ERROR if required organization style data is missing or incomplete.
- Remove the public shell's immediate public-only header render that caused public pages to flash or downgrade before auth/access was checked.

Files changed:
- assets/core/CORE-COMPONENT-organization-header-current.js
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/public/PUBLIC-COMPONENT-site-shell-current.js

Notes:
- This is a small forward-only patch.
- This does not finish the later public-page user/admin row repair.
- This prevents fake/default styling so the next failures are obvious instead of hidden by fallback colors.
