README-0085 — Contact Tracker Prefab Template Manager

Package: syncetc-contact-prefab-template-manager-0085.zip
Date: 2026-06-08

Purpose
- Adds Contact Tracker prefab reply template management.
- Admins can add, edit, archive, preview, and select prefab reply templates.
- Adds a rich-text-lite editor for prefab email bodies.
- Adds placeholder insertion for {{first_name}}, {{organization_name}}, {{info_url}}, and {{sender_name}}.
- Sends selected prefab template instead of relying on one hardcoded/default response.

Files changed
- supabase/sql/0085-contact-prefab-template-manager.sql
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-contact-tracker-current.js

Important behavior
- Templates are archived, not hard-deleted.
- The last active prefab template cannot be archived.
- Template email bodies are sanitized to a small safe HTML subset.
- Plain-text fallback is also saved/sent.
- Existing custom reply behavior remains intact.
- No customer-domain spoofing is introduced.

Testing
- Open https://syncetc.webflow.io/contact-tracker?syncetc_debug=1
- Add a template.
- Preview it.
- Edit it.
- Send selected prefab reply.
- Archive a non-last template.
- Confirm Custom Reply still works.
