README-0073 — My Profile Contact Grid Layout

Purpose
- Replace the crowded Contact Information layout with a cleaner 2x2 card layout.
- Keep all existing My Profile fields and save behavior.

Files to upload
- assets/user/USER-PAGE-profile-current.js

Changes
- Internal version advanced to 2026-06-08-024-D.
- Contact Information is now organized into four cards:
  1. Name
  2. Address
  3. Phone numbers
  4. Emergency contact
- Phone fields are stacked with enough room for full phone numbers.
- Preferred and Texts controls remain available.
- Display-name preview stays in the Name card.

Not changed
- No SQL.
- No Edge Function.
- No Webflow embed.
- No header/shell files.
- No photo/email/membership-summary behavior changes.

Test
- Open /my-profile.
- Confirm Contact Information uses the new 2x2 card layout.
- Confirm name display updates while editing preferred/middle/suffix.
- Confirm phone fields are usable and aligned.
- Confirm emergency contact fields save.
- Confirm profile save still works.
