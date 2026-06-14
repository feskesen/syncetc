# 0111-G Forum Optimistic Button Feedback Hotfix

## Purpose
Improve forum button responsiveness so members and admins get immediate visual feedback when using like/reaction and moderation controls.

## Changed files
- `assets/member/MEMBER-PAGE-forum-current.js`
- `assets/user/USER-PAGE-forum-current.js`

## What changed
- Like buttons now update immediately in the UI and save in the background.
- Topic/reply moderation buttons such as Pin, Unpin, Lock, Unlock, Hide, and Restore now update immediately in the UI and save in the background.
- If a background save fails, the prior UI state is restored and a readable warning is shown.
- Pending reaction buttons show a saving state and are temporarily disabled to prevent double clicks.
- No SQL changes.
- No Edge Function changes.

## Expected version
- `MEMBER-PAGE-forum-current.js`: `2026-06-13-111-G`
- `USER-PAGE-forum-current.js`: `2026-06-13-111-G`

## Install
Upload only the two changed GitHub assets. Do not run SQL. Do not redeploy Edge Functions.

## Test
1. Open `/forum?syncetc_debug=1`.
2. Open a category and a topic.
3. Click the heart/like button. The icon and count should update immediately.
4. Click again. It should immediately toggle back.
5. As an admin, click Pin/Unpin or Lock/Unlock. The label/status should update immediately without waiting for the round trip.
