# SyncEtc

Clean rebuild repository for the SyncEtc platform.

Live-loaded files should use stable filenames such as `*-current.js`.
Versioning is tracked internally in file comments, Git commit history, and local saved copies.

Core architecture:
- CORE components
- ADMIN pages
- TEMPLATE renderers
- CUSTOMER/runtime data
- Supabase backend with RLS enabled from the start

Current rebuild rules:
- No public default customer data
- No hard-coded 150th Aero content
- Missing data renders neutral error or empty states
- Templates are reusable structure only
- Header, footer, auth, API client, shell, loading, and error states are shared components
