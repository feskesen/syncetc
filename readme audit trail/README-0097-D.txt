README-0097-D — Apply Now validation polish

Purpose:
Small Apply Now public-form UI polish patch after 0097-C.

Changes:
- Replaced real-person example placeholders with Wilbur/Wright-style placeholders.
- Added inline validation for email, phone, optional home phone, and ZIP fields.
- Validation runs while the user edits/leaves those fields and again before submit.
- Added full-width optional field: “Anything else you want to tell us?”
- Stores the additional note in the outgoing payload and custom_answers_json.
- Preserves nav-away protection from 0097-C.
- Preserves the existing hidden honeypot field named website and form_elapsed_ms payload.

Install:
Upload only assets/public/PUBLIC-PAGE-apply-current.js.

No SQL, Edge Function, Webflow, tracker, header, calendar, RSVP, Contact Tracker, or Events Manager changes.
