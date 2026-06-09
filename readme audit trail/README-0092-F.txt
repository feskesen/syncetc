README-0092-F — Customer Admin Events Manager validation/state preservation hotfix

Reason:
092-E still allowed a failed save/validation path to appear to erase typed event form values, and all-day event validation could still report a missing start date even when the user believed a start date was entered.

Changes:
- Added client-side form draft snapshot preservation.
- Validation failures now preserve the in-progress form values.
- Save error catch paths preserve the in-progress form values.
- Save button click now prevents default/native submit behavior and stops propagation.
- Added native form-submit guard in case Webflow or a parent form is involved.
- Added validation diagnostic snapshot to syncetc_debug output.
- Kept 092-E behavior: simplified attendee list setting, duplicate-name protection, draft warnings, and RSVP/layout cleanup.

No SQL, no Edge Function, no Webflow changes.
