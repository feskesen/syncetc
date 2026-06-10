README-0097-C — Apply Now UI Polish / Nav-Away Protection

Purpose:
- Polish the public Apply Now form after the initial shell-render hotfix.
- Keep the patch limited to the public Apply Now page JS.

Changes:
- Apply form now uses the available public-shell width instead of a narrower internal max-width.
- Added placeholder/helper examples to less obvious fields.
- Clarified that Instrument belongs under Ratings / endorsements, not Certificate level.
- Expanded certificate level choices.
- Changed Medical / BasicMed status from free text to a clearer select with Class 1, Class 2, Class 3, BasicMed, Not applicable, and Other.
- Removed Availability for interview/orientation from the default first-pass form.
- Added nav-away protection for typed but unsubmitted form data.
- Confirmed existing honeypot field remains present.

Install:
- Upload assets/public/PUBLIC-PAGE-apply-current.js only.

No SQL, Edge Function, Webflow, Contact Tracker, Calendar, RSVP, Events Manager, roster, documents, or header changes.
