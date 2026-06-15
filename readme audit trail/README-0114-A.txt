# 0114-A Organization Management Console Shell

Internal version: 2026-06-14-114-A

## Purpose

Creates the first customer/organization-admin facing Organization Management console shell. This is not a SyncEtc platform-admin-only page. It is intended to become the structured customer admin workbench where organization administrators manage people, assets, website/portal settings, communications, documents, store placeholders, and organization settings.

## Changed files

- `assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js`
- `readme audit trail/README-0114-A.txt`

## Install

Upload to GitHub:

- `assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js`

No SQL is required.

No Edge Function redeploy is required.

Do not redeploy:

- `core-access-action`
- `core-public-render`
- `core-admin-action`

## Webflow embed

Recommended page slug:

- `/organization-management`

Embed:

```html
<div id="syncetc-organization-management-root"></div>
<script src="https://feskesen.github.io/syncetc/assets/core/CORE-COMPONENT-portal-shell-current.js"></script>
<script src="https://feskesen.github.io/syncetc/assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js"></script>
```

## What it adds

- Full-width customer-admin workbench layout.
- Left navigation panel with grouped modules.
- Main work area with overview and module-section views.
- Existing module links where available.
- Placeholders for future modules.
- Sections include:
  - Overview
  - People
  - Assets
  - Website & Portal
  - Communication
  - Documents
  - Store
  - Settings
- Organization selector for users with multiple organization-admin contexts.
- Uses `core-access-action` `get_my_access` only; no new backend actions.
- Sets portal shell organization/style context using the selected organization.
- Admin operations layout is fixed and utility-focused. It inherits customer color accents only.

## Notes

This page does not remove existing direct URLs. It links or points to them where available. It is a shell for future module consolidation, not a replacement for each module yet.

## Test URL

- `https://syncetc.webflow.io/organization-management?syncetc_debug=1`

Expected first test:

- Page loads for organization admins.
- Left navigation appears.
- Overview appears.
- Existing module links such as Aircraft Admin, Header & Navigation, Organization Settings, Forum, Contact Tracker, and Documents are visible.
- Public/member users without organization admin access should not be able to use the console.
