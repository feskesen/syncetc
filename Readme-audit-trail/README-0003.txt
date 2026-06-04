README-0003

Purpose
- Patch the Layout Designer admin page so its logged-out/login view matches the newer Aircraft Admin pattern more closely.
- Fix a practical login issue: the Layout Designer login handler expected Email and Password fields, but the page did not render them.

Problem Addressed
- Logged-out Layout Designer looked different from the newer admin pages.
- The login controls were trapped inside the left designer panel instead of appearing as a normal top login card.
- The Login button read Email/Password values from missing fields.

What Changed
- ADMIN-PAGE-layout-designer-current.js now renders a full-width login card with Email, Password, Log in, Log out, and Refresh controls.
- The main designer controls are hidden until authenticated, matching the admin UI gating pattern.
- The page width and layout spacing were adjusted closer to Aircraft Admin.
- Login/password fields are excluded from the Layout Designer dirty-state tracking.

Expected Result
- Logged out: header, login card, and Login required notice appear; designer controls stay hidden.
- Logged in: customer/style controls and preview panel appear normally.
- Login should work directly from the Layout Designer page.

Next Expected Work
- Confirm all older admin pages are visually consistent enough for development.
- Then move to the first customer-facing/public Aircraft page renderer, but only after reviewing the desired page layout with Frank.
