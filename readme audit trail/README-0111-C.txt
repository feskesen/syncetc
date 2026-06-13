# SyncEtc 0111-C — Forum Message Board Layout / Category-Topic-Detail Routing

## Purpose

Redesign the first-pass forum/message-board UI into a more classic message-board structure:

- Forum home with category rows.
- Category view with topic list.
- Topic detail view with original post, replies, polls, and trip-planning details.
- Search bar at the top.
- Prominent Start new discussion button.
- Organization-admin-owned categories and member-created topics.

This is a focused layout/routing and category-default update. It does not build video hosting, meeting transcription, maintenance squawks, email notifications, attachments, or a category-management admin UI.

## Changed files

- `assets/member/MEMBER-PAGE-forum-current.js`
- `assets/user/USER-PAGE-forum-current.js`
- `supabase/sql/0111-C-forum-flight-club-categories.sql`

## Install

1. Run required SQL:
   - `supabase/sql/0111-C-forum-flight-club-categories.sql`

2. Upload GitHub assets:
   - `assets/member/MEMBER-PAGE-forum-current.js`
   - `assets/user/USER-PAGE-forum-current.js`

Do not redeploy Edge Functions for this pass.

Do not redeploy:

- `core-access-action`
- `core-public-render`
- `core-admin-action`

## Expected versions

- `MEMBER-PAGE-forum-current.js`: `2026-06-13-111-C`
- `USER-PAGE-forum-current.js`: `2026-06-13-111-C`

## Flight-club default categories

The SQL updates/seeds active organizations with:

- Announcements — admin posts only
- Hangar Talk
- Fly-outs & Trip Planning
- Great Flights
- Find a Pilot
- Safety
- Buy / Sell / Trade

Maintenance squawks remain separate from the forum. Future squawk information can be linked or mirrored into forum discussions, but the operational squawk system should remain its own workflow.

## Notes

- Categories are still controlled at the organization/admin level conceptually. This pass only updates default seeded categories. A future admin category manager can edit them.
- Members can create topics inside categories where posting is allowed.
- Query routes are now supported:
  - `/forum`
  - `/forum?category=hangar-talk`
  - `/forum?topic=<forum_topic_id>`
- Search is client-side over the loaded topic set for this foundation pass.
- Topic/reply counts and latest activity on category rows are derived from loaded topic data for now.

## Test

Open:

`https://syncetc.webflow.io/forum?syncetc_debug=1`

Check one step at a time:

1. Category rows show the new flight-club defaults.
2. Clicking a category changes to a topic-list view.
3. Start new discussion opens the form.
4. Creating a topic opens the topic view.
5. Replying works.
6. Poll topics still allow voting.
7. Trip topics still show trip-planning details.
8. Unsaved draft text warns before leaving or switching views.
