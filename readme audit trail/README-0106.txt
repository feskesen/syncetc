README-0106 — Applicant Portal + Upload Review Workflow

Purpose:
- Strengthen the applicant-facing portal and upload review workflow after the 0097-0105 applicant foundation.

Changes:
- Applicant portal now uses a fuller organization-styled experience with accordion sections.
- Applicant portal now uses the secured applicant_get_my_portal action alias and organization-key resolution.
- Applicant-visible tasks are shown to the applicant; hidden/admin-only tasks remain hidden from the applicant portal.
- Applicant uploads show upload status, review notes, and signed private download/view links when available.
- Applicant upload buttons show Uploading... feedback.
- Applicant application updates preserve nav-away protection and save-state feedback.
- core-access-action now safely supports applicant_get_portal/applicant_get_my_portal aliases.
- core-access-action now adds short-lived signed URLs to applicant upload records returned to authorized applicant/admin views.
- Applicant Tracker upload review rows now include signed private download/view links where available.

Not included:
- No applicant-to-member conversion changes.
- No Apply Now form changes.
- No Contact Tracker, Calendar, RSVP, Events Manager, Documents, Roster, Profile, Header, or public shell changes.
- No Microsoft/Google OAuth, payment, e-signature, or flight scheduler work.

Install notes:
- Run the SQL marker/additive migration.
- Deploy core-access-action.
- Upload the applicant portal and applicant tracker JS assets.
