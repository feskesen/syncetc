README-0055 — Organization People Header + Affiliation Layout Patch

Package: organization_people_header_affiliation_patch_0055.zip
Date: 2026-06-07

Files to upload:
- assets/core/CORE-COMPONENT-portal-shell-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Changes:
- Portal header now uses selected organization layout width.
- Portal header reorganized to avoid overlap between organization selector, nav, and auth controls.
- Login/logout/account controls remain in the header, not the hero.
- Organization selector is presented as the full clickable selector control.
- Shared portal footer added through the portal shell.
- People page removes its own duplicate page footer so the shared shell footer is the footer source.
- People Membership / access section splits status/class/stage and affiliation dates into separate aligned grids.
- Affiliation end date auto-fills today's date when status changes to inactive/former/expelled/archived/blocked and the date is blank.
- Suspended no longer auto-fills an affiliation end date.
- End reason helper text updated to direct admins to internal notes for details.

Notes:
- No SQL changes.
- No Edge Function changes.
- No Webflow embed changes.
- Customer organization colors/layout settings remain inherited from the selected organization.
