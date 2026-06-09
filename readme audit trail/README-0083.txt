README-0083 - Contact Section / Contact Tracker Foundation

Package purpose:
- Restore and productize the public Contact Us workflow as a Home page section rather than a required /contact page.
- Add private organization-admin Contact Tracker workflow for public inquiry handling.
- Add privacy-first spam controls, admin workflow status, notes, bulk actions, and optional admin-triggered replies.

Files included:
- supabase/sql/0083-contact-section-contact-tracker-foundation.sql
- supabase/functions/core-public-render/index.ts
- supabase/functions/core-access-action/index.ts
- assets/public/PUBLIC-PAGE-home-current.js
- assets/core/CORE-COMPONENT-organization-header-current.js
- assets/customer-admin/CUSTOMER-ADMIN-PAGE-contact-tracker-current.js
- webflow embeds/contact-tracker-embed.txt

Internal versions:
- core-public-render: 2026-06-08-083-A
- core-access-action: 2026-06-08-083-A
- PUBLIC-PAGE-home-current.js: 2026-06-08-083-A
- CORE-COMPONENT-organization-header-current.js: 2026-06-08-083-A
- CUSTOMER-ADMIN-PAGE-contact-tracker-current.js: 2026-06-08-083-A

Security/privacy notes:
- Contact submissions are private organization data.
- Public submissions are saved through core-public-render using the service role server-side path; no private contact records are exposed publicly.
- New inquiries do not send automatic emails to the board/admins.
- Honeypot submissions are discarded and logged as events where possible.
- Suspected spam is stored with status spam_suspected and is not counted in the open admin badge.
- Contact Tracker requires organization admin/communications access through core-access-action.
- Outbound replies use SyncEtc managed sender mode only. No customer-domain spoofing is implemented.
- If Resend is not configured, Contact Tracker remains usable but reply send actions show a configuration error.

Design decisions:
- No standalone /contact public page in this package.
- Header Contact is seeded as a section-anchor destination: /home#contact-board.
- Dedicated Contact page support can be added later as another destination option.
- Admin nav uses Contact Tracker with badge count, not a full Alerts row yet.

Known limitations / future work:
- Platform UI for editing contact settings/reply-to/template text is not built yet; defaults are seeded and can be adjusted later through a settings UI.
- Customer verified sending domains are not included; those require customer DNS/domain setup and should be a future commercial add-on.
- CAPTCHA is intentionally not included; honeypot, timing, validation, and spam scoring are used first.
