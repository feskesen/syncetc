README-0107-C
Applicant Portal Magic Link Verification Fix

Changed files:
- supabase/functions/core-public-render/index.ts
- supabase/functions/core-access-action/index.ts
- assets/user/USER-PAGE-applicant-portal-current.js

No SQL. No Webflow changes.

This package changes applicant portal link generation so the emailed link lands directly on the Webflow applicant portal with token_hash/type=magiclink. The page then verifies the token and creates the Supabase session instead of relying on the Supabase verify endpoint redirect to preserve tokens.
