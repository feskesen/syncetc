README-0057D

Purpose:
Correct the 0057 SQL by avoiding constrained core_template_registry fields that vary across the current project schema.

Change:
- Does not set access_default.
- Does not set complexity_level.
- Registers/updates Roster and People & Access using conservative fields only.
- Keeps the 0057 JS and Edge Function payloads unchanged.

Install:
Run PORTAL-PAGE-ACTIVATION-0057D.sql, then deploy/upload the included files only after SQL succeeds.
