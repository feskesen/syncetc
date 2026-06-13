SyncEtc Website Rebuild
README-0111-D
Forum Home Category Index / Category-Only Topic Creation Polish

Internal Version: 2026-06-13-111-D

Purpose
- Refine the member message board flow after testing the 0111-C layout.
- Make /forum behave as a classic message-board category index.
- Remove the top category-chip/filter row.
- Remove global "Start new discussion" from the forum home page.
- Require members to enter a category before starting a new topic.
- Keep categories owned/controlled by organization admins; members create topics only inside permitted categories.

Changed files
- assets/member/MEMBER-PAGE-forum-current.js
- assets/user/USER-PAGE-forum-current.js

Install
1. Upload to GitHub:
   - assets/member/MEMBER-PAGE-forum-current.js
   - assets/user/USER-PAGE-forum-current.js

Do not run SQL.
Do not redeploy Edge Functions.
Do not redeploy:
- core-access-action
- core-public-render
- core-admin-action

Expected versions
- MEMBER-PAGE-forum-current.js: 2026-06-13-111-D
- USER-PAGE-forum-current.js: 2026-06-13-111-D

Behavior changes
- /forum now shows search plus category rows only.
- Category chips across the top were removed.
- The forum home no longer has a Start new discussion button.
- Category rows route to /forum?category=<category_key>.
- Category view shows the topic list for that category.
- Category view shows Start new topic only if the user can post in that category.
- Announcements remains admin-post only for non-admin members.
- Topic detail routing remains /forum?topic=<topic_id>.
- Search remains available from the top area.
- Draft/unsaved text protection remains.

First tests
1. Open:
   https://syncetc.webflow.io/forum?syncetc_debug=1
2. Confirm the forum home shows category rows and no top category chips.
3. Confirm there is no Start new discussion button on the home/index view.
4. Click Hangar Talk.
5. Confirm the URL changes to /forum?category=hangar-talk and the category view opens.
6. Confirm Start new topic appears in Hangar Talk.
7. Return to all discussion areas.
8. Open Announcements as a non-admin member and confirm members cannot start announcement topics.
