README-0099 — Applicant Workflow Settings + Notes Timeline

Internal versions:
- core-access-action: 2026-06-10-099-A
- CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js: 2026-06-10-099-A
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-10-099-A
- USER-PAGE-applicant-portal-current.js: 2026-06-10-099-A

Scope completed:
- Added organization-configurable applicant workflow stages.
- Added stage-based applicant checklist/task definitions.
- Added applicant/person lifecycle notes table for admin-visible timeline notes.
- Preserved legacy internal notes by migrating them once into timeline notes.
- Applicant Tracker now shows cleaner search/filter/sort left list.
- Applicant Tracker now uses stage-based current checklist display.
- Applicant Tracker settings panel now contains portal access and waitlist visibility settings.
- Applicant Tracker now includes notes/activity timeline and Add Note action.
- Applicant emails continue to log applicant events and also add timeline entries where possible.
- People / Organization People now has admin notes/activity timeline groundwork.
- Applicant Portal now prefers current-stage tasks when available.

Deferred:
- Automatic applicant-to-member conversion.
- Payment/e-signature/OAuth email sending.
- Flight scheduler access/check-out controls.
- Full applicant workflow/stage form-builder UI beyond seeded defaults.
