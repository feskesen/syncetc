0103-C Applicant Tracker Filter Layout Cleanup

Purpose:
- Remove the red count pill graphic added in 0103-B.
- Keep count text inside the status filter dropdown options.
- Put the status filter dropdown on its own row.
- Put the sort dropdown on its own row below the status filter.

Files changed:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js

Checks:
- node --check passed.
- Confirmed no at-filter-count-pill / red filter-count wrapper remains.
- Confirmed the applicant tracker nav-away/beforeunload path remains present.

No SQL. No Edge Function deploy. No Webflow changes.
