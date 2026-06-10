README-0102 — Applicant-to-Person / Member Conversion

Package: syncetc-applicant-member-conversion-0102.zip
Internal versions: 2026-06-10-102-A

Purpose:
Adds controlled applicant-to-person/member conversion from the Applicant Tracker.

Included:
- Adds conversion tracking columns and conversion log table.
- Adds Applicant Tracker conversion modal.
- Allows admin to create new person or link existing person after match review.
- Checks likely existing people by email, phone, and name.
- Creates or updates core_people record.
- Creates or updates organization membership with selected initial status/class/stage.
- Closes applicant lifecycle with archive reason Added as Member.
- Preserves applicant record as historical record.
- Links applicant record to person/membership where available.
- Writes applicant event, person timeline note, and conversion log.
- Seeds future flight scheduler eligibility metadata as pending checkout only; scheduler not built.
- Includes People page timeline groundwork/version update.

Not included:
- Automatic bulk conversion.
- Payment processing.
- E-signatures.
- Microsoft/Google/OAuth sending.
- Full flight scheduler.
- Public waitlist display.

Safety:
Conversion requires explicit confirmation in the Applicant Tracker. Existing person matches are shown and admin must choose create new or link existing. Applicant record is not destroyed.
