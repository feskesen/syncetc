# README-0113-B — Aircraft Admin Supabase JS Readiness Hotfix

## Purpose
Fixes a narrow load-order issue on the customer-side Aircraft Admin page where the portal shell may have inserted the Supabase CDN script but the Aircraft Admin page checked `window.supabase.createClient` before the library was ready.

## Changed files
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js
- assets/admin/ADMIN-PAGE-aircraft-admin-current.js

## Install
Upload the two GitHub assets only.

Do not run SQL.
Do not redeploy Edge Functions.

## Expected versions
- CUSTOMER-ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-113-B
- ADMIN-PAGE-aircraft-admin-current.js: 2026-06-14-113-B

## Test
Open `/aircraft-admin?syncetc_debug=1`. The page should no longer show `Supabase JS did not load.`
