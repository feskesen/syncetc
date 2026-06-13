# SyncEtc README-0111-B — Forum Layout Polish

Internal version: 2026-06-13-111-B

## Purpose

Polish the first-pass member Forum / Message Board UI after 0111-A confirmed that the backend structure, category seeding, and page loading work.

This is a UI-only layout change. It keeps the 0111-A Supabase schema and backend actions intact.

## Changed files

- assets/member/MEMBER-PAGE-forum-current.js
- assets/user/USER-PAGE-forum-current.js

## Install

Upload to GitHub:

- assets/member/MEMBER-PAGE-forum-current.js
- assets/user/USER-PAGE-forum-current.js

## Do not run

Do not run SQL.
Do not redeploy Edge Functions.
Do not redeploy core-access-action, core-public-render, or core-admin-action.

## Expected versions

- MEMBER-PAGE-forum-current.js: 2026-06-13-111-B
- USER-PAGE-forum-current.js: 2026-06-13-111-B

## What changed

- Removed the sticky left-sidebar category layout.
- Moved categories into a horizontal chip/tab row across the top of the forum.
- Made the topic list and topic detail the primary working area.
- Moved the new-topic form behind a prominent “Start new topic” button.
- New-topic form opens inline only when requested.
- Category changes close the new-topic form and preserve unsaved-change warning behavior.
- No backend/data/security changes.

## Test

Open:

https://syncetc.webflow.io/forum?syncetc_debug=1

Check:

1. Categories appear as horizontal tabs/chips, not a sticky left column.
2. Topic list has more usable space.
3. “Start new topic” opens the topic form.
4. Typing in the topic form and attempting to change category warns about unsaved text.
5. Posting a topic still works.
6. Selecting a topic still opens detail/replies.
7. Poll/trip controls still appear when selected in the topic type dropdown.

