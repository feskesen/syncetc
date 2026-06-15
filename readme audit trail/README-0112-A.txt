# 0112-A Organization Settings Hub Foundation

Internal version: 2026-06-14-112-A

## Purpose

Create the first platform-admin Organization Settings Hub so organization-level settings do not remain hard-coded inside individual pages. This foundation centralizes member dashboard quick links, dashboard weather airports, future dashboard display flags, profile requirement hints, alert colors, and forum settings groundwork.

## Changed files

- `supabase/sql/0112-A-organization-settings-hub.sql`
- `assets/admin/ADMIN-PAGE-organization-settings-current.js`
- `assets/core/CORE-COMPONENT-admin-shell-current.js`
- `supabase/functions/core-admin-action/index.ts`
- `supabase/functions/core-access-action/index.ts`
- `assets/member/MEMBER-PAGE-dashboard-current.js`
- `assets/user/USER-PAGE-dashboard-current.js`

## SQL

Required SQL creates `public.core_organization_settings` and seeds a settings row for each active organization.

The table stores:

- `dashboard_settings_json`
- `dashboard_quick_links_json`
- `dashboard_weather_airports_json`
- `profile_requirements_json`
- `alert_colors_json`
- `forum_settings_json`
- `settings_json`

The SQL also seeds `core_weather_metar_latest` station rows for active dashboard weather airports so scheduled/latest METAR refresh can discover them.

## Backend

`core-admin-action` adds platform-admin-only actions:

- `organization_settings_list_organizations`
- `organization_settings_get`
- `organization_settings_save`
- `organization_settings_reset_defaults`

`core-access-action` now reads `core_organization_settings` when building the member dashboard payload. The dashboard can now consume configured quick links, weather airports, and dashboard display toggles. If the settings table is missing or a row is missing, it falls back safely to the 0110/0111 dashboard defaults.

## Frontend

Adds `ADMIN-PAGE-organization-settings-current.js`, expected Webflow root:

```html
<div id="syncetc-organization-settings-root"></div>
<script src="https://feskesen.github.io/syncetc/assets/core/CORE-COMPONENT-admin-shell-current.js"></script>
<script src="https://feskesen.github.io/syncetc/assets/admin/ADMIN-PAGE-organization-settings-current.js"></script>
```

Adds an admin-shell nav item for Organization Settings.

Member dashboard JS now renders backend-provided `dashboard.quick_links` and respects dashboard settings toggles for profile update card, next event, and weather cards.

## Not included

- Customer-admin editable settings.
- Full forum category manager.
- Full dashboard visual recipes.
- Background scheduled METAR cron setup.
- Maintenance/squawk system.
- Platform suggestion/ticket system.

## Install

1. Run SQL: `supabase/sql/0112-A-organization-settings-hub.sql`.
2. Upload GitHub assets listed above.
3. Redeploy Edge Functions: `core-admin-action` and `core-access-action`.

Do not redeploy `core-public-render`.

## First test

Run:

```sql
select
  o.organization_key,
  o.display_name,
  jsonb_array_length(s.dashboard_quick_links_json) as quick_links,
  jsonb_array_length(s.dashboard_weather_airports_json) as weather_airports
from public.core_organization_settings s
join public.core_organizations o on o.organization_id = s.organization_id
order by o.organization_key;
```

Expected: active organizations have one row, with dashboard quick links and weather airports populated.
