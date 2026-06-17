# SYNCETC 0116-S — Qualification Warning Simplification + Aircraft Checkout Foundation

Date: 2026-06-16

## Purpose

Make the People > Aviation / Qualifications tab simpler and more useful without adding reservation enforcement yet.

## Changed files

- assets/customer-admin/CUSTOMER-ADMIN-PAGE-organization-management-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-people-current.js
- supabase/functions/core-access-action/index.ts
- supabase/functions/core-access-action/index.ts.txt
- supabase/sql/0116-S-qualification-warning-aircraft-checkouts.sql

## Expected versions

- CUSTOMER-ADMIN-PAGE-organization-management-current.js: 2026-06-16-116-S
- CUSTOMER-ADMIN-PAGE-people-current.js: 2026-06-16-116-S
- core-access-action/index.ts: 2026-06-16-116-S

## Summary

- Removed the separate Reservation readiness bar from the normal person profile UI.
- Required-to-reserve labels now only appear on the specific qualification rows that are missing or expired.
- Required-to-reserve rows use alert styling only when action is needed.
- Added the foundation for person-to-aircraft checkout tracking.
- Added an Aircraft checkouts section under Members / People > Aviation / Qualifications.
- Aircraft checkout records use one source of truth: core_person_asset_checkouts.
- No actual reservation blocking is enforced in this package.
- No asset-side Qualified Pilots tab is added yet.

## Install order

1. Run supabase/sql/0116-S-qualification-warning-aircraft-checkouts.sql in Supabase SQL Editor.
2. Deploy supabase/functions/core-access-action/index.ts to the core-access-action Edge Function.
3. Upload the two GitHub asset files.

## First tests

1. Open Organization Management with debug mode:
   https://syncetc.webflow.io/organization-management?syncetc_debug=1&module=people-members
2. Select a person and open Aviation / Qualifications.
3. Confirm there is no Reservation readiness bar.
4. Confirm required-to-reserve only appears on rows that are missing or expired.
5. Confirm Aircraft checkouts appears below Qualifications.
6. Mark one aircraft as Approved, add a current-through date, save, reload, and confirm it persists.

## Notes

This package intentionally does not enforce reservation eligibility. It prepares the data and customer-facing UI so later reservation/dispatch logic can use the same source of truth.
