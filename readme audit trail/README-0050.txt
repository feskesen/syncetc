README-0050 — Fake People Seed for test-customer-1

Purpose:
Seed about 50 fake People & Access records into organization_key `test-customer-1` for UI testing.

Files to use:
- supabase/sql/SEED-TEST-CUSTOMER-1-FAKE-PEOPLE.sql

What it does:
- Adds fake people using `example.test` emails.
- Adds fake phone numbers using 201-555-01xx.
- Assigns most people the User / Member role.
- Assigns a few people the Board Member role.
- Assigns no Organization Admin, no Organization Super Admin, and no Platform Admin roles.
- Includes mixed statuses/classes/stages for filters and search testing.
- Creates no Supabase Auth users and sends no emails.

Install:
Run the SQL file in Supabase SQL Editor.

Notes:
The seed is idempotent by fake email and can be rerun for testing.
