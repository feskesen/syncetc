README-0066-J — Public Shell Session Init Repair

Changed file:
- assets/public/PUBLIC-COMPONENT-site-shell-current.js

Purpose:
- Remove the observed 10-second public-shell session wait caused by duplicate refresh/session initialization.
- Prevent duplicate refreshHeader calls from racing each other.
- Use one in-flight Supabase client promise.
- Use one in-flight session promise.
- Ignore the Supabase INITIAL_SESSION auth event so it does not trigger a duplicate initial header refresh.
- Pass the existing session token into the access call instead of calling getSession again.

Expected version:
- 2026-06-07-021-J

No SQL.
No Edge Function deploy.
No Webflow change.
