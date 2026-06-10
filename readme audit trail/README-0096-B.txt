README-0096-B — Event Copy UI Cleanup

Purpose:
Clean up the event Copy / Repeat UI after 0096-A.

Changes:
- Fixed confirmation typo: "copies" instead of "copyies".
- Copy fields are hidden until a copy mode is selected.
- Copy once now shows only "Copy to date".
- Repeat modes show First copy date, End date, and Maximum copies.
- Added helper text explaining same weekday pattern.
- Added helper text explaining that repeat generation stops when either the end date is reached or maximum copies is reached, whichever comes first.
- No backend/data model changes.

Install:
Upload assets/customer-admin/CUSTOMER-ADMIN-PAGE-events-current.js.

Expected internal version:
2026-06-09-096-B
