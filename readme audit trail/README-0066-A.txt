README-0066-A

Package: Shared Header Engine Foundation
Version: 2026-06-07-021-A

Purpose:
- Create the one shared organization header renderer that all organization-facing pages must use going forward.
- This package intentionally does not modify portal pages or public pages yet.
- This is Step 1 of removing the two-header architecture.

Files to upload:
- assets/core/CORE-COMPONENT-organization-header-current.js

What this does:
- Adds window.SyncEtcOrganizationHeader.render(container, context).
- Supports PUBLIC, USER, ADMIN, and PLATFORM rows from one renderer.
- Keeps Home first in the public row.
- Right-aligns clickable links while keeping row labels left.
- Uses passed organization style/profile data instead of hardcoded colors.
- Does not fetch data and does not decide security.

What this does not do yet:
- It does not change existing portal/public pages.
- It does not make the current pages call the new renderer.
- It does not change auth flow.
- It does not change page activation.

Next step after this passes:
- 0066-B: make CORE-COMPONENT-portal-shell-current.js call this shared renderer.
