0101-C Applicant Tracker Filter + Header Badge Polish

Files changed:
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-applicant-tracker-current.js

Purpose:
- Remove the separate Open status filter.
- Default Applicant Tracker filter to New.
- Keep local search/filter/sort behavior from 0101-B.
- Best-effort local header badge update when New-applicant count changes, without hard refreshing the page.
- Preserve nav-away protection from 0101-B.

No SQL.
No Edge Function deploy.
No Webflow changes.

Expected internal version:
- 2026-06-10-101-C
