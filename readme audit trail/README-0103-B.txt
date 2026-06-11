0103-B Applicant Tracker Filter Counts

Purpose:
- Add visible applicant counts to the Applicant Tracker status filter without changing backend behavior.

Changes:
- Status dropdown options now include counts, e.g. New (2), Waitlist (5), Archived (1).
- The selected status filter also shows a red count pill next to the dropdown.
- Counts are calculated locally from the already-loaded applicant list.
- No SQL or Edge Function changes.

Safety checks:
- JS syntax checked with node --check.
- Existing nav-away protection code path remains present.
