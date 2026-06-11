README-0103 — Applicant lifecycle notes + first-load filter fix

Purpose:
- Show full applicant-origin timeline notes in People after applicant-to-member conversion.
- Fix Applicant Tracker first-load local filter initialization by loading the full applicant set and filtering locally.

Changed files:
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js

Notes:
- No SQL changes.
- No Webflow changes.
- No public-render changes.
- Person/member timeline now includes timeline notes tied to applications linked to the person, without duplicating notes into a second table.
- Applicant Tracker initial load now fetches the full applicant set and applies New/Waitlist/Archived filters locally, so changing the filter immediately after first load does not require Refresh.
- Nav-away protection path remains present in Applicant Tracker.
