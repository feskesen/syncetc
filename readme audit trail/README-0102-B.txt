0102-B Applicant Conversion Modal Simplification

Purpose:
- Simplify the Add Applicant as Member conversion modal.
- Keep applicant portal access separate from membership conversion.
- Add helper info text for Create New Person and Link Existing Person choices.

Changes:
- Hides confusing lifecycle/onboarding dropdowns from the conversion modal.
- Shows applicant as read-only context.
- Keeps Starting Member Class and optional Conversion Note.
- Keeps create/link person logic, but only makes link useful when matches exist.
- Adds helper info icons/tooltips for the create/link choices.
- Adds clear language that applicant portal access is separate and should be handled as Invite to onboarding portal / workflow setting, not membership conversion.
- Keeps archive reason Added as Member behavior.

Validation:
- JS syntax checked with node --check.
- Nav-away protection code path remains present in applicant tracker JS.

Files:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js
