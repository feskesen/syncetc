README 0098-B — Applicant Portal Upload Tasks Hotfix

Reason:
Original 0098 migration failed with:
ERROR 42P01: relation "public.core_applicant_applications" does not exist

Cause:
The package used planned alias table names instead of the actual 0097 foundation tables.

Fix:
- SQL now targets public.core_applications and public.core_applicant_tasks.
- SQL adds compatibility/enrichment columns to those existing tables.
- Edge Functions and JS now use core_applications/core_applicant_tasks and applicant_task_id.
- Public applicant submission now supplies required applicant_key and keeps 0097 compatibility fields in sync.
- Existing 0097 applicant data is backfilled into 0098 alias columns where needed.

No rollback needed if original 0098 failed before making changes. Run this replacement package.
