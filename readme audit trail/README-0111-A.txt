# SyncEtc 0111-A Forum / Message Board Foundation

Internal version: 2026-06-13-111-A

Purpose

Build the first structural pass for a native SyncEtc member message board. This is not a Discord clone. It is an organization-scoped internal discussion board for members to create topics, categorize discussions, reply, run simple polls, and plan trips.

Changed files

- assets/member/MEMBER-PAGE-forum-current.js
- assets/user/USER-PAGE-forum-current.js
- assets/member/MEMBER-PAGE-dashboard-current.js
- assets/user/USER-PAGE-dashboard-current.js
- supabase/functions/core-access-action/index.ts
- supabase/sql/0111-A-forum-message-board-foundation.sql

Install

1. Run required SQL:
   supabase/sql/0111-A-forum-message-board-foundation.sql

2. Upload GitHub assets:
   assets/member/MEMBER-PAGE-forum-current.js
   assets/user/USER-PAGE-forum-current.js
   assets/member/MEMBER-PAGE-dashboard-current.js
   assets/user/USER-PAGE-dashboard-current.js

3. Redeploy Supabase Edge Function:
   core-access-action

Do not redeploy:
- core-public-render
- core-admin-action

No optional SQL is included in this package.

Expected versions

- MEMBER-PAGE-forum-current.js: 2026-06-13-111-A
- USER-PAGE-forum-current.js: 2026-06-13-111-A
- MEMBER-PAGE-dashboard-current.js: 2026-06-13-111-A
- USER-PAGE-dashboard-current.js: 2026-06-13-111-A
- core-access-action: 2026-06-13-111-A

What is included in 0111-A

- New forum/message-board SQL tables:
  - core_forum_categories
  - core_forum_topics
  - core_forum_replies
  - core_forum_polls
  - core_forum_poll_options
  - core_forum_poll_votes
  - core_forum_mentions
  - core_forum_topic_reads
  - core_forum_user_preferences
  - core_forum_events
- Default categories:
  - Board Announcements
  - General Discussion
  - Events & Trip Planning
  - Safety
  - Buy / Sell / Trade
- Member-only access through core-access-action.
- Platform/org-admin moderation groundwork.
- Text-only topics and replies.
- Simple poll topics.
- Trip-planning topic type.
- Mention/preference table and backend groundwork.
- No email notifications yet.
- No attachments/images yet.
- No real-time chat.
- No maintenance squawk system; maintenance/squawks remain a separate future operational feature.
- Dashboard quick link now points to /forum instead of placeholder.

Webflow/page note

The forum page expects a logged-in page using the portal shell and one of these roots:

<div id="syncetc-member-forum-root"></div>
<script src="https://feskesen.github.io/syncetc/assets/core/CORE-COMPONENT-portal-shell-current.js"></script>
<script src="https://feskesen.github.io/syncetc/assets/member/MEMBER-PAGE-forum-current.js"></script>

The user alias asset also exists:
assets/user/USER-PAGE-forum-current.js

Suggested test URL

https://syncetc.webflow.io/forum?syncetc_debug=1

Test one step at a time

Step 1:
Run the SQL and confirm categories exist:

select
  organization_id,
  category_key,
  label,
  posting_mode,
  status,
  sort_order
from public.core_forum_categories
order by organization_id, sort_order;

Expected: default categories for existing organizations, including test-customer-1.

Step 2:
Open /forum as a normal member or org admin.

Expected: message board loads, categories appear, no applicant access leak, no admin-only platform nav.

Step 3:
Create a General Discussion topic.

Expected: topic appears and opens.

Step 4:
Reply to the topic.

Expected: reply appears and reply count increments.

Step 5:
Create a Poll topic with at least two options.

Expected: poll appears and voting works.

Step 6:
Create a Trip topic in Events & Trip Planning.

Expected: topic appears with trip-planning display.

Step 7:
As applicant-only user, try /forum.

Expected: access blocked; applicant should not see the member message board.

Known deferred items

- Customer/admin category manager.
- Member preference UI for mention/email alert settings.
- Resend no-reply mention emails.
- Header/dashboard red mention badge.
- Better member mention picker/autocomplete.
- Attachments/images.
- Thread subscriptions.
- Pinned announcements polish.
- Moderation UI polish.
- Message board settings page.
