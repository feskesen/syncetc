README-0107 Applicant Account / Portal Login Flow

This package adds the applicant account/login flow needed for the applicant portal.

Key changes:
- Logged-out applicant portal now renders an organization-branded access screen.
- Applicant enters application email and requests a secure login link.
- Public request flow returns neutral no-leak messaging.
- Eligible applicant records receive a portal access email using the SyncEtc/Resend sender path.
- Admins can send a portal link from Applicant Tracker.
- Apply Now confirmation can point applicants to the applicant portal when portal access is enabled.
- Applicant login remains applicant-only and does not grant member access.

Security notes:
- Applicant portal access is organization-configurable.
- The public portal request does not disclose whether an application exists.
- Applicant record is only shown after authenticated email matches an eligible applicant record.
- No roster/member/internal document access is granted by this package.

Deferred:
- Microsoft/Google OAuth sender integration.
- Automatic member conversion changes.
- Public waitlist display.
- Broad login redesign outside applicant portal.
