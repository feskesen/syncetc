README-0046 — Phase 1 Access Foundation hotfix 004-C

Purpose
- Fixes PostgreSQL view replacement failure encountered when running the 004-B SQL migration.

Issue
- CREATE OR REPLACE VIEW cannot change the names/order of existing columns. Some deployed databases had an existing core_access_* view column order that differed from the generated snapshot used during package construction. PostgreSQL raised: cannot change name of view column membership_id to can_login.

Fix
- The migration now explicitly drops and recreates these two read/query views before recreating them with the package definition:
  - public.core_access_my_memberships_v1
  - public.core_access_platform_memberships_v1

Safety note
- These are query/read helper views for access pages and Edge Function support, not base data tables. Dropping and recreating them does not delete membership/person data.
- The migration remains wrapped in BEGIN/COMMIT. If a later error occurs, the transaction should roll back.

Deployment
- Stop using 004-A and 004-B. Run ACCESS-MODEL-SEPARATION-FOUNDATION.sql from this 004-C package from the beginning.
