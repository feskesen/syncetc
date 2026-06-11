0102-C Applicant Conversion Modal Wording + Nav-Away Hotfix

Baseline: 0102-B Applicant Conversion Modal Polish.

Changes:
- Renamed Conversion note to Optional note.
- Changed note placeholder to ordinary language.
- Removed confusing applicant/member-status helper text from Starting member class.
- Added guarded close behavior for Add as Member modal.
- If an optional note is typed in the Add as Member modal, X / Cancel / backdrop / Escape and browser navigation now trigger unsaved-change protection.
- Kept Add as Member button language.

No SQL, Edge Function, Webflow, or People page changes.

Checks performed:
- node --check passed.
- Nav-away protection path verified in code: hasUnsaved() includes conversion modal note; close helper is used by X/Cancel/backdrop/Escape; beforeunload uses hasUnsaved().
