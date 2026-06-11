0107-B Applicant Portal Magic-Link Login Hotfix

Problem:
Applicant secure login email links returned to /applicant-portal, but the page did not complete the Supabase auth callback/session exchange. Users landed back on the request-link screen.

Fix:
- Added detection for Supabase auth callback URL parameters and hash tokens.
- Handles code exchange, token_hash verification, and access/refresh-token session setup.
- Shows a Processing secure login link state while completing login.
- Cleans auth callback parameters from the URL after successful session setup.
- Leaves applicant-only access rules unchanged.

Files changed:
- assets/user/USER-PAGE-applicant-portal-current.js

No SQL or Edge Function changes.
