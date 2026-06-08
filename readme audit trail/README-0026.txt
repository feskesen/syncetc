README-0026
Package: FAQ optimistic reorder patch
Date: 2026-06-05

Purpose
- Improve FAQ drag/reorder behavior inside Page Editor without changing SQL, Edge Functions, public renderers, or page structure.

Changes
- Bumped Page Editor visible version badge to 2026-06-05-004-D.
- FAQ drag reorder now renders locally immediately after drop before saving to the backend.
- FAQ order save now runs in the background after the local render.
- If the backend save fails, the FAQ list reverts to the previous order and shows an error.
- Added a clearer insertion line between records using before/after drop markers.
- Leaving/reloading while FAQ order is still saving triggers the unsaved-work warning.
- Pure FAQ sort-order changes do not create restore-history snapshots.

Expected Result
- Dragging active FAQ records within a category should feel more responsive.
- The drop location should be clearer.
- Archived records remain locked and restore-only.
- No other behavior should change.
