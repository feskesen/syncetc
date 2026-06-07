README-0057C

Purpose:
Corrected portal page activation SQL so it does not write to core_template_registry.complexity_level. The existing database check constraint does not accept the guessed values.

Files changed:
- supabase/sql/PORTAL-PAGE-ACTIVATION-0057C.sql

Install:
Run the 0057C SQL, then deploy/upload the included files if SQL succeeds.
