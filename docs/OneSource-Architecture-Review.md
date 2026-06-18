# OneSource Aviation (SyncEtc) — Architecture & Product-Structure Review

*Prepared from your actual code: the Supabase schema dump, the `core-access-action` Edge Function (9,000 lines), and the 45 frontend page files in the project zip. Where I'm inferring rather than confirming, I say so.*

---

## 0. The one-paragraph verdict

You have a **genuinely solid foundation underneath a confusing surface.** The hard part — a clean identity model, a real permission system that is actually enforced, and a sensible separation of "lifecycle vs class vs stage" — is already right and worth keeping. The problems are almost all **organizational, not structural**: one admin page is trying to be the whole app, you have two or three half-finished copies of the same thing, the database is mid-rename and carries two names for the same concept, and the UI advertises features that have no database behind them. None of that requires starting over. It requires **consolidation and renaming, then building the missing operational workbenches.** Your instincts in the brief were correct on almost every point.

---

## 1. The four access tiers (confirmed, and they already exist in your code)

You proposed four levels. Your code already implements exactly four, which is a good sign — we're formalizing what's there, not inventing it.

| Tier | Who (club) | Who (FBO) | What they do | In your code today |
|---|---|---|---|---|
| **Public** | Anyone, not logged in | Anyone | See the marketing site, aircraft, public calendar, gallery, apply | `assets/public/*`, `site-shell` |
| **User** | Member | Customer/renter/student | Their dashboard, profile, roster, documents, RSVP, forum, **book aircraft** | `member_*` actions; `assets/user/*` |
| **Admin** | Board / officers | Manager / staff | Run daily operations: people, aircraft, applicants, events, squawks, dispatch | `organization_*` actions; `assets/customer-admin/*` |
| **Super-Admin** | Org super-admin | Owner / IT | Configure *what's possible*: branding, roles, statuses, pages, navigation, integrations | `platform_*` actions + the config tabs |

We agreed the label for tier 2 is **User** (more universal than "member"). Keep "Member" only as a *display word* an org can choose — never as a separate code path. (You currently have a separate code path; see §5.)

**Key principle you articulated, now made into a rule:**
> **Super-Admin Settings define the scope. Admin workbenches do the work.**
> Changing a person's credentials, grounding an aircraft, converting an applicant — these are **Admin operations**, not Settings. Settings is where you decide *which* statuses, roles, and pages exist for Admins to use.

---

## 2. Recommended sitemap / page inventory

This is the target. Items marked **NEW** don't exist yet; **EXISTS** is already built (possibly needs refactor); **STUB/VAPOR** exists in the UI but has little or no backing code/data.

### Public (uses customer-selectable layout *recipes* + branding)
- Home — EXISTS
- Info / FAQ — EXISTS
- About — **NEW** (you wanted this; "Info" becomes FAQ-focused, "About" becomes the story)
- Aircraft (public fleet) — EXISTS
- Calendar (public events only) — EXISTS
- Gallery (board-approved photos) — EXISTS
- Apply Now — EXISTS
- Contact (modal/anchor, no exposed email) — EXISTS (correctly just an anchor today)

### User (logged-in; **fixed platform layout** + org branding only)
- Dashboard — EXISTS
- My Profile (self-service) — EXISTS
- Roster — EXISTS
- Documents (member-visible) — EXISTS
- Calendar + RSVP (incl. members-only events) — EXISTS
- Forum / Message Board — EXISTS
- Submit to Gallery — EXISTS (verify; it's referenced)
- **Reservations / Scheduler (book & view aircraft)** — **NEW** (your FlightCircle replacement; planned for v1.0, built in a later pass)
- "Fun" pages: Member heat-map, Aircraft travel map — EXISTS in your live site, not yet rebuilt; **low priority, keep as a later module**

### Admin (board/officers — daily operations, each its own workbench)
- Admin Dashboard / Today — EXISTS
- **People & Access** workbench (edit people, credentials, status, roles, qualifications, checkouts) — EXISTS (the strong `people` page, 2,852 lines)
- **Applicant Tracker** — EXISTS (one of your best pieces, 615 lines)
- **Contact Tracker** — EXISTS
- **Aircraft** workbench (profile, media, meters, squawks, maintenance, rates, qualified pilots) — EXISTS (`aircraft-admin`, 2,067 lines) — *but needs the missing data layer, see §6*
- **Events** workbench — EXISTS (1,649 lines)
- **Documents** workbench (versioned) — EXISTS
- **Gallery moderation** — EXISTS (in admin tools)
- **Reservations / Dispatch** (manage the schedule, dispatch, squawks) — **NEW**
- **Communications** (email members) — **NEW** (Supabase-based; replaces Make.com; placeholder for now)

### Super-Admin (configuration only — "the control panel")
- Organization Basics (name, vertical, locations) — EXISTS (as a tab)
- Branding / Layout (recipe choice, colors, fonts, logo) — EXISTS
- Header & Navigation setup — EXISTS
- Public Pages setup (which pages exist, slugs, nav) — EXISTS
- Roles & Permissions — EXISTS
- Lifecycle Statuses / Membership Classes / Application Stages — EXISTS
- Qualifications & Asset-Type setup — EXISTS
- Integrations / Email sender config — EXISTS (partial)
- Dashboard & Alert settings — EXISTS

---

## 3. Are you making Organization Management do too much? **Yes — provably.**

Your Organization Management page (`organization-management`, 746 lines) renders **31 tabs.** Here they are, sorted into what they actually are:

**These are real Settings (keep them here):**
Organization Basics · Branding/Layout · Header & Navigation · Public Pages · Groups/Roles · Permissions · Lifecycle Statuses · Membership Classes · Application/Onboarding Stages · Asset Types · Qualifications · Spaces & Locations · Dashboard Settings · Alert Colors · Integrations · Notices · Overview.

**These are daily OPERATIONS masquerading as settings (move them OUT to workbenches):**
Members/People · Aircraft Setup · Squawks/Discrepancies · Usage/Meters · Maintenance Reminders · Internal Documents · Member Documents · Public Documents · Contact Tracker · Message Board/Forum.

**These are VAPOR — tabs with no database table behind them at all:**
Squawks/Discrepancies · Usage/Meters · Orders/Requests · Products/Services · Store Settings · Maintenance Reminders.
> I checked: your schema has **no** `core_squawks`, `core_reservations`, `core_meter_readings`, `core_orders`, or `core_products` tables. These tabs make the product *look* more finished than it is, which is exactly the "showing sausage-making" problem in reverse — promising features that don't exist. Either build the data layer or hide the tab until you do.

**The rule going forward:** Organization Management = configuration only. Anything a board member touches *weekly* (people, aircraft, applicants, the schedule) gets its own top-level workbench.

---

## 4. Module / workbench structure (the target shape)

Think of the logged-in app as a small number of **workbenches**, each owning one operational domain end-to-end, plus one **Settings** area that configures them.

```
OneSource (logged-in app)
│
├── USER PORTAL  (portal-shell)
│   ├── Dashboard
│   ├── My Profile
│   ├── Roster · Documents · Forum · Gallery submit
│   └── Reservations (book/view)              ← NEW
│
├── ADMIN WORKBENCHES  (admin-shell)
│   ├── People & Access     → people, credentials, roles, qualifications, checkouts
│   ├── Applicants          → applicant tracker + onboarding
│   ├── Contact             → contact tracker
│   ├── Aircraft            → profile, media, meters, squawks, maintenance, rates, qualified pilots
│   ├── Events              → events + RSVPs
│   ├── Reservations/Dispatch → schedule, dispatch, squawks   ← NEW
│   ├── Documents           → versioned docs
│   ├── Gallery             → moderation
│   └── Communications      → email members            ← NEW
│
└── SUPER-ADMIN SETTINGS  (admin-shell)
    └── Organization Management → ONLY the 17 "real Settings" tabs above
```

Each workbench is a self-contained page. "People" is where you change credentials; "Aircraft" is where you ground a plane. Settings never edits live records — it only defines the menus those workbenches use.

---

## 5. Keep / Refactor / Retire — current modules

| Current module / file | Verdict | Why |
|---|---|---|
| People model (`core_people` → memberships → roles) | **KEEP** | Clean, normalized; one person can hold many roles without duplication. This is the spine of the system. |
| Lifecycle / Class / Stage split (3 tables) | **KEEP** | Correctly separated; your own seed code even comments that it's intentional. Rare to see done right. |
| `applicant-tracker` (615 ln) | **KEEP** | One of the strongest pieces; high real-world value. |
| `people` workbench (2,852 ln) | **KEEP, relocate** | Great workbench — but pull it OUT of Org Management into its own top-level page. |
| `aircraft-admin` (2,067 ln) | **REFACTOR** | Good shell, but needs the missing data layer (meters, squawks, maintenance — see §6) and to consume one source of truth for aircraft, not two. |
| `events` (1,649 ln) | **KEEP** | Solid. |
| Header recipe + style-profile tables | **KEEP** | Already match your "recipes" plan (§7). Good direction. |
| Document versioning (`core_documents` + versions) | **KEEP** | Proper draft/published/approved workflow. |
| Audit log (`core_audit_log`) | **KEEP** | Every admin write is audited. Valuable. |
| `member/*` pages (dashboard, forum) | **RETIRE** | **Byte-for-byte identical** to the `user/*` versions. Delete the `member` copies; keep `user`. |
| `admin/aircraft-admin` (27 ln), `admin/events` (45 ln) | **RETIRE** | Empty stubs duplicating the real `customer-admin` workbenches. |
| `core_customers` table + customer↔org sync triggers | **RETIRE (after migration)** | Duplicate of `core_organizations`; see §6.1. Finish the rename, then drop. |
| Org-Management "vapor" tabs (Squawks, Meters, Orders, Products, Store, Maint. Reminders) | **HIDE until built** | No backing tables; remove from UI until the data layer exists. |
| Per-user free-form CSS/layout editor (`layout-designer`, 1,465 ln) | **DEFER / RETIRE for v1.0** | You agreed this is over-ambitious for 1.0. Replace with fixed recipes + branding (§7). Keep the code parked; don't ship it to customers yet. |
| `admin/` builder tools (page-editor, renderer-preview, customer-builder, template-detail, media-library) | **KEEP, but quarantine** | These are *your* internal platform-building tools, not customer features. Move them behind Super-Admin/platform-only and label them clearly so they never leak into a customer's view. |

---

## 6. Data model: duplicate sources of truth (your #1 principle)

You asked specifically whether duplicates exist. **They do — six of them.** This is the most important section.

**6.1 `core_customers` vs `core_organizations`** — the big one.
You're mid-rename from "customer" to "organization." Both tables exist, a trigger (`core_sync_customer_to_organization`) copies one into the other, and dozens of tables carry **both** a `customer_id` and an `organization_id`, kept in sync by more triggers. → **Finish the migration to "organization" everywhere, then delete `core_customers` and the sync triggers.** Until you do, every feature has two front doors and they can drift.

**6.2 Qualifications vs explicit checkouts** — the one you suspected.
"Can this person fly this aircraft?" has **two possible answers** today:
- Derived: does the person hold every qualification the aircraft *requires*? (`core_asset_qualification_requirements` + `core_person_qualification_assignments`)
- Declared: is there an explicit row in `core_person_asset_checkouts`?
These can disagree. → **Pick one as truth.** Recommendation: the *checkout* is the source of truth for "allowed to fly," and qualifications are *inputs/prerequisites* that the dispatch logic checks before granting/keeping a checkout. Document which one the scheduler will enforce.

**6.3 Two asset-type taxonomies.**
`core_asset_type_definitions` (global) **and** `core_organization_asset_types` (per-org) both define "what kinds of assets exist." → Keep the global one as the catalog; let orgs *enable/label* from it. Don't maintain two independent lists.

**6.4 The word "asset" means two different things.**
`core_assets` is actually your **media/file library** (it has `url`, `storage_path`, `mime_type`, `alt_text`). `core_operational_assets` is your **real-world equipment** (aircraft). Same word, totally different things — a guaranteed source of confusion for you and any future developer. → **Rename `core_assets` → `core_media` (or `core_files`)**. Keep `core_operational_assets` for equipment.

**6.5 Two "stage" tables.**
`core_applicant_workflow_stages` and `core_application_stage_definitions` both model application stages. → Consolidate to one (`core_application_stage_definitions` is the more complete; it's what the Edge Function uses).

**6.6 Aircraft meters & billing split across 2–3 places.**
Tach/Hobbs/usage live as columns on `module_aircraft_details` *and* as `usage_json` on `core_operational_assets`; billing config lives on `module_aircraft_details` (`billing_basis`, `hobbs_factor`, `tax_rate_behavior`) *and* in `core_operational_asset_rates`. → Decide: structured columns **or** json blobs, one home for meters, one home for rates. This matters a lot once the scheduler computes flight charges.

**What's clean and should NOT change:** the person→membership→role→permission chain, and the lifecycle/class/stage separation. Leave those alone.

---

## 7. Layout philosophy (recipes vs fixed layouts)

You landed in exactly the right place, and your schema already supports it.

- **Public pages = customer-selectable *recipes* + branding.** You already have `core_header_recipe_definitions` and `core_customer_style_profiles` (colors, typography, logo, layout, effects). Keep this. Customers pick a tested recipe and skin it. They do **not** get a blank CSS canvas in v1.0 — park the `layout-designer`.
- **Logged-in (User/Admin/Super-Admin) = fixed platform layouts + branding only.** Customers control colors, fonts, logo, labels, accent — never structure. Operational pages carry too much data to let customers break the grid. Your three shells (`site-shell` for public, `portal-shell` for users, `admin-shell` for admins) are the right backbone for enforcing this.
- **The header.** You dislike the narrow header — agreed, and it's the right call for data-dense admin pages. Recommendation: make the header a property of the *shell*, not the page: a slim, full-width public header (recipe-driven) for marketing, and a **wider, full-width application header** for logged-in pages with room for org switcher, search, and user badge. The `organization-header` component is where this change lives, so it propagates everywhere at once.

> Plain-language summary: **the public site is a themeable brochure; the logged-in app is a uniform cockpit.** Customers paint both, but only re-arrange the brochure.

---

## 8. Permissions, RLS & the Edge Function (your #10, and the security verdict)

**Good news first, because it corrects a scare:** when I first counted permission checks by keyword it looked like admin actions weren't guarded. Reading the actual handlers, **every admin write action calls a permission gate as its first line** (e.g. `aircraftRequireAdminAccess0113A`, `requireApplicantTrackerAccess`, `peopleRequireDefinitionAdminAccess0116D`, `requireMembershipAccess`). Your permission system is **real and enforced**, not decorative. That directly answers your fear: the capability/permission pages are *meaningful* today.

**Now the real risks — they are structural, not "it's wide open":**

1. **Single point of enforcement, no backstop.** Almost every operational table has Row-Level Security turned *on but with no policy for normal users* — only the `service_role` (the Edge Function) can touch them. That means **the Edge Function is the only thing standing between a user and the data.** If any one of the 114 actions ever forgets its gate, there is no second layer to catch it, and the exposure is silent and total. → **Add RLS policies as defense-in-depth** so a missed check in code fails closed, not open. You already have the helper functions in the database (`core_has_organization_permission`, `core_is_organization_admin`) — wire them into RLS the way you did for `core_people` and `core_operational_assets` (those tables already have proper policies; most others don't).

2. **The gate helpers are inconsistent.** There are at least six differently-named gate functions, several with version suffixes (`...0113A`, `...0116D`). Correctness depends on every future action remembering which of six to call. → **Consolidate to one `requirePermission(action, org, person)` with a single action→permission map.** One place to read, one place to audit.

3. **9,000 lines in one file, 371 functions, version-suffixed names.** This is the maintainability risk you flagged. It still works, but it's brittle and hard for a non-technical owner to reason about. → **Split it** (your stated preference). Recommended split, by the action prefixes already in the code:
   - `_shared/` — auth, audit, helpers, the new single permission gate
   - `access/` — `get_my_access`, dashboards
   - `member/` — the `member_*` actions (user portal)
   - `organization/` — the `organization_*` actions, further grouped by workbench (people, aircraft, applicants, contact, events)
   - `platform/` — the `platform_*` super-admin actions
   This is a refactor for the build phase, not a rewrite — same logic, organized so you can find things.

**Bottom line on #10:** your permissions are enforced and meaningful *today*, but they're one forgotten line away from a breach because there's no second layer. Fix that by adding RLS backstops and consolidating the gate. Do this **before** building more features on top.

---

## 9. Direct answers to your 14 questions

1. **What pages/workbenches ultimately?** — §2 sitemap + §4 workbench map.
2. **Which modules belong in Org Management as config?** — the 17 "real Settings" tabs in §3.
3. **Which should become separate workbenches?** — People, Aircraft, Applicants, Contact, Events, Reservations/Dispatch, Documents, Gallery, Communications (§3, §4).
4. **Is Org Management doing too much?** — Yes, provably (31 tabs, 10 of them operations, 6 of them vapor). §3.
5. **How should the four page types differ in layout?** — §7. Public = recipes; logged-in = fixed + branding.
6. **Public recipes vs fixed admin layouts?** — Yes, exactly that, and your schema already supports it. §7.
7. **How should People be structured?** — Keep what you have: `core_people` (the human) → `core_organization_memberships` (status, class, stage) → `core_membership_roles` → `core_organization_roles` (permission keys), plus `core_person_user_links` for login. Qualifications and checkouts hang off the membership. It already does everything you listed (statuses, classes, stages, groups/roles, permissions, qualifications, checkouts) without duplicating the person. The only fix is resolving the qualification-vs-checkout duplicate (§6.2).
8. **How should Aircraft be structured?** — `core_operational_assets` (the asset) + `module_aircraft_details` (aircraft-specifics) is a good pattern *as long as* you (a) consolidate meters/billing to one home (§6.6), (b) **build the missing tables** for squawks, meter readings, and maintenance (they don't exist yet), and (c) treat media via the renamed `core_media`. Qualified-pilots = derived from checkouts/qualifications, not a separate list.
9. **Duplicate sources of truth in People/Quals/Checkout/Aircraft?** — Yes: §6.2 (quals vs checkouts), §6.3 (two asset-type tables), §6.4 (asset naming), §6.6 (meters/billing). Plus the global §6.1 (customer vs org).
10. **Are the permission pages meaningful or dangerous?** — Meaningful *and* enforced today (§8), but dangerous *as an architecture* because there's no RLS backstop and the gates are inconsistent. Fix before scaling.
11. **Top nav / admin nav / module structure?** — §4. A short list of workbenches + one Settings area; stop nesting operations inside Settings.
12. **Which old standalone pages to deprecate/redirect/keep?** — §5 table. Retire: `member/*` duplicates, `admin/` stub pages. Quarantine: builder tools. Keep: the real workbenches.
13. **Highest-risk regressions/mistakes to fix now?** — §11.
14. **Next 5 development passes?** — §10.

---

## 10. Next 5 development passes (priority order)

> These are planning/structure passes; we are **not** coding yet. Each pass ends with something concrete you can see.

1. **Finish the customer→organization rename and remove duplicate truth.**
   Drop `core_customers` and the sync triggers; standardize on `organization_id`; resolve quals-vs-checkouts and meters/billing homes (§6). *Nothing new gets built on a split foundation.*

2. **Add the RLS backstop + consolidate the permission gate.**
   One `requirePermission` with an action→permission map; RLS policies on every operational table using your existing DB helper functions (§8). This makes everything after it safe by default.

3. **Re-cut navigation into four tiers and pull operations out of Org Management.**
   Promote People, Aircraft, Applicants, Contact, Events to top-level workbenches; reduce Org Management to the 17 config tabs; hide the 6 vapor tabs; retire `member/*` and the `admin/` stubs; widen the header (§3, §4, §7).

4. **Build the missing operational data layer for Aircraft.**
   Create `core_squawks`, `core_meter_readings`, `core_maintenance_items` (and wire the existing aircraft workbench to them). This turns vapor tabs into real features and is the prerequisite for the scheduler.

5. **Design + build the Reservations / Scheduler (FlightCircle replacement).**
   Now that aircraft, meters, squawks, and checkouts are real and single-sourced, the scheduler has a foundation: `core_reservations`, dispatch, conflict/eligibility checks driven by checkouts (§6.2) and aircraft status. This is the marquee v1.0 feature.

*(Then, later: Communications/email on Supabase, the "fun" map pages, and only after all that, revisit whether customers ever get deeper layout control.)*

---

## 11. Highest-risk things to fix *before building more*

1. **No RLS backstop.** One forgotten permission check = silent full data exposure across organizations. Fix in Pass 2. *(Highest risk.)*
2. **Two sources of truth for "organization."** Every new feature inherits the split until §6.1 is done. Fix in Pass 1.
3. **Quals-vs-checkout ambiguity** will produce wrong "who can fly what" answers the moment the scheduler exists. Decide the rule in Pass 1, before Pass 5.
4. **Vapor tabs** erode trust and hide how much is actually built. Hide them now (Pass 3) or build them (Pass 4).
5. **The 9,000-line function** is a single failure point and hard to maintain. Split during Pass 2.
6. **Duplicated/parallel pages** (`member` vs `user`, `admin` stubs vs `customer-admin`) mean fixes have to be made twice and will drift. Retire in Pass 3.

---

## 12. Super-Admin scope & access model (decisions locked 2026-06-17)

These decisions were made after the original review and govern how the Super-Admin / platform tier is built going forward. They refine §1 (access tiers), §4 (workbench map), and Pass 3 in §10. **Pass 1 (the current work) builds none of this — it only finishes the customer→organization data consolidation.** They are recorded here so they survive into future sessions.

1. **Super-Admin scope is narrow.** Platform / Super-Admin owns only what is *not* replicated at the customer-admin level: creating and seeding organizations, initial org setup, platform-wide configuration, super-admin (platform-staff) management, and billing (placeholder for now). It does **not** rebuild org-level operational tools — aircraft, assets, people, events, etc. Those live once, in the customer-admin workbenches.

2. **"Enter any org as admin" model.** Super-Admins help an organization by dropping into that org's *own* admin tools, in that org's context — **not** through duplicate platform-level screens. The existing code already provides the seam for this (`platform_override`); the rebuild uses that seam rather than re-implementing operational UI at the platform level.

3. **Silent super-admin access is auditable and disclosed.** When a Super-Admin enters an org silently, the access is recorded via the existing audit log (`core_audit_log`) and disclosed in the platform's terms. Silent access is permitted, but never invisible to the record.

4. **The future platform-admin rebuild (Pass 3) is modular, utilitarian, and host-agnostic.** When the platform-admin surface is rebuilt — Pass 3, alongside the navigation re-cut in §10 — it is: modular and clean; utilitarian rather than cluttered; built with unobtrusive helper affordances ("?"-on-hover) instead of always-on explanatory clutter; and host-agnostic (the current Webflow hosting is temporary and must not be assumed permanent). This rebuild is **not in scope for Pass 1.**

---

*End of review. This document is meant to live in your repo (e.g. `/docs/architecture-review.md`) so it travels with the project into the build phase — including when you move to Claude Code.*
