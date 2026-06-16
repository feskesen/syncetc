SyncEtc 0116-A — People Workbench Foundation

Purpose
- Bring the existing customer-admin People / Members page into the Organization Management workbench.
- Preserve the current one-person data model and existing People backend actions.
- Convert the UI to the same left-list / right-editor maintenance pattern used by Asset Types, Spaces & Locations, and Assets / Aircraft.

Files changed
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Version strings
- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-A
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-A

Functional changes
- Organization Management now treats People -> Members / People as an active embedded module.
- Organization Management dynamically loads the People module with a cache-busted 0116-A URL.
- Organization Management now checks the embedded People module for unsaved changes before switching modules.
- People / Members now supports embedded mounting through window.SyncEtcPeopleAdmin / window.SyncEtcPeopleAdminPage.
- The standalone organization People page continues to use the same production filename and root.
- People UI now uses a workbench structure:
  - module header with New person, Refresh, Export, and Print actions;
  - left list panel with status/view filter, search, archived/restricted visual cues, and compact person rows;
  - right editor panel with tabs;
  - bottom action row with Saved / Unsaved changes, Reset, Archive/Restore, and Save.
- Editor tabs added:
  - Identity;
  - Membership;
  - Contact;
  - Access & Roles;
  - Aviation / Qualifications;
  - Notes / Timeline.
- Existing backend actions are retained:
  - organization_list_people;
  - organization_get_person;
  - organization_save_person;
  - organization_add_person_note;
  - organization_send_invite;
  - organization_send_password_reset;
  - organization_archive_membership;
  - organization_restore_membership;
  - organization_upload_person_photo;
  - organization_remove_person_photo.
- Search preserves focus while typing.
- Switching tabs does not discard unsaved form edits.
- Search/list re-render preserves the selected person draft while unsaved changes exist.
- Normal UI no longer exposes version/build diagnostics; diagnostics remain debug-only.

Architecture notes
- No database redesign in this package.
- No split administrators table.
- Administrators, members, applicants, instructors, and other roles remain filtered views/lenses over the same people/membership/role data.
- A later 0116-B package can add a dedicated Administrators & Access lens using the same People module and same underlying records.

No SQL changes.
No Supabase Edge Function changes.
No Webflow embed changes required.
No TypeScript Edge Function .txt copies required because no Edge Function changed.

Install
1. Upload these two files to GitHub:
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
   - assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
2. Do not run SQL.
3. Do not redeploy Supabase Edge Functions.
4. Do not change Webflow embeds.

First test URL
https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members

Expected
- People -> Members / People opens inside Organization Management.
- The left panel shows search, status/view filter, and compact person rows.
- Archived/restricted records are visually muted/cued and archived records sort to the bottom in All.
- Selecting a person opens the right editor.
- Tabs switch without losing unsaved edits.
- Save, Reset, Archive/Restore, and Saved/Unsaved status appear in the bottom action row.
- Invite and Password reset appear inside Access & Roles.
- New person appears in the module header as an outline/accent button.
- Normal UI does not show version/build/cache/migration text.
- Debug mode shows 2026-06-16-116-A for Organization Management and People diagnostics.
