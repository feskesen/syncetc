SyncEtc audit trail — 0094-B

This package updates only the Customer Admin Events Manager browser JS.

Changes:
- Keeps only one visible Event image upload/preview in the normal event editor.
- Removes the normal-form Event Type Default Image upload UI.
- Tightens image preview CSS so dropped/uploaded images stay contained inside the preview box.
- Adds clearer short-summary and full-description placeholder examples/helper text.
- Moves All-day event onto the STARTS row.
- Moves No end time onto the ENDS row.
- Improves RSVP audience help text to distinguish RSVP submission from Event Visibility.
- Adds bottom final action buttons: Save as Draft and Save & Publish.
- Keeps the left-panel Draft warning/control area.
- Fixes checklist remove behavior for newly-added rows and for removing all rows before save.
- Preserves 092/094 validation protections against failed-save form wiping.

Deferred:
- Event copy / recurrence builder.
- Public calendar month view / compact button state cleanup.
- RSVP page bring-items claiming.
- Separate dedicated Event Type Manager.
