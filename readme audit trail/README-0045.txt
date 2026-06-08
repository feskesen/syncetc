README-0045 — Lifecycle Check Constraint Hotfix
SyncEtc / OneSource Aviation
Internal Version: 2026-06-06-004-B

Purpose
- Corrects the Phase 1 access-foundation SQL preflight order.
- The original Phase 1 SQL attempted to seed new lifecycle_category values such as applicant/invited/pending before widening the existing core_membership_status_definitions_lifecycle_check constraint.
- Supabase correctly rejected the applicant row because the old constraint still allowed only the earlier lifecycle buckets.

Change
- Added a compatibility preflight section at the top of ACCESS-MODEL-SEPARATION-FOUNDATION.sql.
- Added HOTFIX-0045-LIFECYCLE-CHECK.sql for recovery if the original package was already attempted.
- The lifecycle_category constraint now permits both legacy buckets and new canonical buckets:
  prospect, onboarding, applicant, invited, pending, active, inactive, suspended, expelled, former, archived, blocked.

Deployment
1. If the original SQL already failed, run supabase/sql/HOTFIX-0045-LIFECYCLE-CHECK.sql first.
2. Then re-run supabase/sql/ACCESS-MODEL-SEPARATION-FOUNDATION.sql from this corrected package.
3. Do not deploy GitHub JS or the core-access-action Edge Function until the SQL completes successfully.

Security notes
- This hotfix does not grant access.
- It does not disable RLS.
- It does not delete memberships or status records.
- It only broadens data validation so the new separated lifecycle model can be seeded safely.
