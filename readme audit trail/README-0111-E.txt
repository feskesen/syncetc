# SyncEtc 0111-E Forum Thread UX + Reactions + Moderation Groundwork

Internal version: 2026-06-13-111-E

Purpose
- Improve message-board topic reading flow.
- Add lightweight like reactions for topics/replies.
- Keep replies as one linear thread under the main topic.
- Keep maintenance/squawks separate from forum.

Changed files
- assets/member/MEMBER-PAGE-forum-current.js
- assets/user/USER-PAGE-forum-current.js
- supabase/functions/core-access-action/index.ts
- supabase/sql/0111-E-forum-reactions.sql

Install order
1. Run required SQL:
   supabase/sql/0111-E-forum-reactions.sql

2. Upload GitHub assets:
   assets/member/MEMBER-PAGE-forum-current.js
   assets/user/USER-PAGE-forum-current.js

3. Redeploy Supabase Edge Function:
   core-access-action

Do not redeploy
- core-public-render
- core-admin-action

Expected versions
- MEMBER-PAGE-forum-current.js: 2026-06-13-111-E
- USER-PAGE-forum-current.js: 2026-06-13-111-E
- core-access-action: 2026-06-13-111-E

What changed
- Back buttons now work:
  - Topic detail -> category view
  - Category view -> forum home
- Topic detail view now uses a stronger main-topic card.
- Replies appear below the topic as a linear thread, slightly indented.
- Replies use alternating light/medium organization-style backgrounds for readability.
- One reply box remains at the bottom. No nested replies were added.
- Mention selector now inserts visible @Name text into the topic/reply body while still sending mention IDs to the backend.
- Topic/reply author mention buttons insert @Name into the bottom reply box.
- Added separate forum reactions table for likes.
- Likes are not replies.
- One active like per person per topic/reply.
- Topic and reply like buttons show aggregate count only.
- Outline heart = not liked by viewer.
- Filled heart = liked by viewer.
- Admin/moderator pin/lock/hide controls remain admin-only.
- Reply hide/restore moderation is now exposed for admins/moderators.

Not included yet
- Header/dashboard mention badge click-through to exact reply.
- Customer-admin mention group manager.
- Email alerts through Resend.
- Attachments/images in forum posts.
- Deep/nested reply threads.
- Maintenance squawk system.
- Platform Suggestions/trouble ticket system.

Testing notes
- First run the SQL and confirm table exists:
  select * from public.core_forum_reactions limit 5;
- Then open:
  https://syncetc.webflow.io/forum?syncetc_debug=1
- Open a category, then a topic.
- Confirm back buttons work.
- Like/unlike the topic and a reply.
- Confirm the like count changes and the icon changes from outline to filled.
- Add a reply using the mention selector and confirm @Name appears in the text box.
- As an admin, confirm pin/lock/hide controls are visible.
- As a normal member, confirm pin/lock/hide controls are not visible.
