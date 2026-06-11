0104 Applicant Checklist Editor + Stage Enforcement

Files included:
- supabase/sql/0104-applicant-checklist-editor-stage-enforcement.sql
- supabase/functions/core-access-action/index.ts
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js

Purpose:
- Adds applicant checklist editing by workflow stage in Applicant Settings.
- Enforces required checklist tasks before advancing applicant stages.
- Updates Applicant Tracker badge logic to count New applicants plus required/admin-review items.

Install:
1. Run SQL.
2. Deploy core-access-action.
3. Upload Applicant Tracker JS.
4. Test /applicant-tracker?syncetc_debug=1.

Notes:
- No public Apply Now, Applicant Portal, Calendar, RSVP, Contact Tracker, People page, or Webflow embed changes are included.
- Nav-away protection remains present in the Applicant Tracker JS beforeunload path.
