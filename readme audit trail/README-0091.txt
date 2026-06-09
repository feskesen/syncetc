README-0091 - Public Shell Supabase/Header Race Fix

Package: syncetc-public-shell-supabase-race-fix-0091.zip
Date: 2026-06-09

Purpose:
Fix a public shell timing race where the shell saw an existing Supabase script tag and treated it as ready before window.supabase.createClient existed.

Problem observed:
Calendar debug showed:
refreshHeader:failed: Cannot read properties of undefined (reading 'createClient')

Change:
- Updated assets/public/PUBLIC-COMPONENT-site-shell-current.js.
- Incremented internal version to 2026-06-09-091-A.
- loadScript now waits on an existing in-flight script instead of immediately resolving.
- ensureSupabase now always waits until window.supabase.createClient exists before creating the client.

Install:
Upload/replace only:
assets/public/PUBLIC-COMPONENT-site-shell-current.js

No SQL, Edge Function, or Webflow changes.
