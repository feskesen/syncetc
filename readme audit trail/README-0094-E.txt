README-0094-E
SyncEtc Customer Admin Events Manager editor cleanup

Internal Version: 2026-06-09-094-E

Purpose:
- Correct several final editor UX issues after 0094-D.

Changes:
1. Restored No end time as the default behavior for new/no-end events.
2. Added inline timing validation directly in the Timing accordion so end-before-start warnings appear where the user is editing, before save.
3. Kept save-time timing validation as a safety net.
4. Fixed saved-location dirty detection so selecting a saved location without edits does not prompt to update it.
5. Replaced the large Draft Mode warning with a compact current-status reminder.
6. Kept explicit Save as Draft and Save & Publish buttons.
7. Adjusted the left panel so the controls and filters stay visible and only the event list scrolls, approximately three event records at a time on desktop.

Install:
- Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js

No SQL changes.
No Edge Function deploy.
No Webflow changes.

Deferred:
- Public calendar month/list/compact/accent pass.
- RSVP checklist/bring-items claiming pass.
- Event copy/recurrence builder.
