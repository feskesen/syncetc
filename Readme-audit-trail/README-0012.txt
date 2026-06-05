README-0012.txt

Purpose
- Patch the public Home page marquee/banner-tow behavior.

Problem
- The banner could take too long to appear because it started fully offscreen.
- The pause in the middle was not reliably noticeable.
- The animation did not match the intended banner-tow sequence: appear quickly, center/pause, scroll off, pause briefly offscreen, repeat.

What changed
- Updated PUBLIC-PAGE-home-current.js only.
- The marquee now starts visible near the right side of the page instead of waiting fully offscreen.
- The marquee scrolls to the center, pauses there for roughly 13 seconds, scrolls off to the left, then pauses offscreen for roughly 5 seconds before repeating.
- The script now measures the actual banner and viewport width so the center and offscreen positions are more reliable across screen sizes.

Not changed in this package
- No SQL changes.
- No Edge Function changes.
- No Webflow embed changes.
- No marquee image uploader or selector yet. That should be built as part of the shared media/asset picker so page editors can choose from approved supplied banner images or upload new ones safely.

Expected next
- Test /home with marquee enabled.
- Confirm the banner appears immediately or nearly immediately.
- Confirm it pauses in the middle long enough to read.
- If the visual motion is acceptable, the next larger improvement is a reusable public component/media picker for marquee images and other page images.
