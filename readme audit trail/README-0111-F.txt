# 0111-F Forum Session/JWT Verification Hotfix

## Purpose
Fix intermittent `Invalid JWT` / session verification errors on the member forum page where the portal shell may show a logged-in session but forum actions fail because the page used a stale access token.

## Changed files
- `assets/member/MEMBER-PAGE-forum-current.js`
- `assets/user/USER-PAGE-forum-current.js`

## Expected versions
- `MEMBER-PAGE-forum-current.js`: `2026-06-13-111-F`
- `USER-PAGE-forum-current.js`: `2026-06-13-111-F`

## Install
Upload the two GitHub assets only.

## Do not run
- No SQL.
- No Edge Function redeploy.
- Do not redeploy `core-access-action`, `core-public-render`, or `core-admin-action` for this patch.

## Behavior
Before every forum backend action, the page now rechecks the Supabase session and updates the bearer token. If the backend still reports a JWT/auth failure, the page forces a Supabase session refresh and retries once. If verification still fails, the member-facing message asks the user to refresh or log in again instead of showing raw JWT/programmer language.

## Test
1. Open `/forum?syncetc_debug=1` while logged in.
2. Click a category.
3. Open a topic.
4. Like or reply.
5. Confirm no `Invalid JWT` message appears.
