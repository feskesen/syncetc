// index.ts
// Deploy target: Supabase Edge Function named core-access-action
// JWT verification: ON
// Internal Version: 2026-06-10-100-A
// Purpose: secured user/organization-admin access foundation for SyncEtc. Separates lifecycle status, membership class, onboarding/application stage, roles, permissions, and future RSVP audience rules.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;
type SupabaseClientAny = any;
declare const Deno: { env: { get: (key: string) => string | undefined } };

const VERSION = "2026-06-10-100-A";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESTRICTIVE_STATUS_KEYS = new Set(["suspended", "expelled", "archived", "blocked"]);
const RESTRICTIVE_LIFECYCLE_CATEGORIES = new Set(["suspended", "expelled", "archived", "blocked"]);
const SUPER_ADMIN_ORGANIZATION_ROLE_KEYS = new Set(["organization-super-admin"]);
const ORGANIZATION_ADMIN_ROLE_KEYS = new Set(["organization-admin"]);
const SUPER_ADMIN_ROLE_KEY = "organization-super-admin";
const ORGANIZATION_ADMIN_ROLE_KEY = "organization-admin";
const ROLE_DISPLAY_ORDER: Record<string, number> = {
  "organization-super-admin": 10,
  "organization-admin": 20,
  "board-member": 30,
  "applicant-manager": 100,
  "asset-manager": 110,
  "content-editor": 120,
  "document-manager": 130,
  "event-manager": 140,
  "gallery-manager": 150,
  "non-member": 890,
  "limited-user": 895,
  "member": 900,
};

const PERSON_PHOTO_BUCKET = "core-assets";
const PERSON_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PERSON_PHOTO_MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EVENT_IMAGE_BUCKET = "core-assets";
const EVENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const EVENT_IMAGE_MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PLATFORM_SYNTHETIC_PERMISSION_KEYS = [
  "organization.admin.open",
  "organization.view_admin",
  "organization.manage_settings",
  "organization.super_admin",
  "people.view_roster",
  "people.manage_members",
  "people.manage_applicants",
  "access.manage_memberships",
  "content.manage_pages",
  "events.manage",
  "events.rsvp_self",
  "events.view_member",
  "assets.manage",
  "documents.manage",
  "documents.view_member",
  "gallery.manage",
  "gallery.submit",
  "media.manage",
  "reports.view",
  "reservations.use",
  "reservations.manage",
  "communications.manage",
  "member.portal.view",
  "member.profile.view",
  "member.profile.update_self",
];

const LEGACY_STATUS_TO_CLASS: Record<string, string> = {
  "full-member": "full-member",
  "probationary-member": "probationary-member",
  "family-member": "family-member",
  "honorary-member": "honorary-member",
};

const LEGACY_STATUS_TO_STAGE: Record<string, { status_key: string; stage_key: string }> = {
  applicant: { status_key: "applicant", stage_key: "general-applicant" },
  waitlist: { status_key: "applicant", stage_key: "waitlist" },
  invited: { status_key: "invited", stage_key: "invited-to-join" },
  onboarding: { status_key: "pending", stage_key: "onboarding" },
};

function jsonResponse(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify({ version: VERSION, ...body }, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

function normalizeKey(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function requireString(body: JsonRecord, key: string): string {
  const value = clean(body[key]);
  if (!value) throw new Error(`Missing required field: ${key}`);
  return value;
}

function optionalString(body: JsonRecord, key: string, fallback = ""): string {
  const value = clean(body[key]);
  return value || fallback;
}

function optionalBoolean(body: JsonRecord, key: string, fallback = false): boolean {
  const value = body[key];
  return typeof value === "boolean" ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => normalizeKey(v)).filter(Boolean);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((v) => clean(v)).filter(Boolean))).sort();
}

function hasPermission(row: JsonRecord, permissionKey: string): boolean {
  const permissions = stringArray(row.permission_keys);
  return permissions.includes(permissionKey);
}

function statusBlocksAccess(status: JsonRecord): boolean {
  const key = normalizeKey(status.status_key);
  const lifecycle = normalizeKey(status.lifecycle_category);
  return RESTRICTIVE_STATUS_KEYS.has(key) || RESTRICTIVE_LIFECYCLE_CATEGORIES.has(lifecycle);
}

function capabilityMap(status: JsonRecord, membershipClass: JsonRecord, permissions: string[], blocksAccess: boolean): JsonRecord {
  const has = (key: string) => permissions.includes(key);
  const canLogin = !blocksAccess && bool(status.can_login);
  const canViewPortal = canLogin && bool(status.can_view_member_portal);
  const classAllowsDocs = membershipClass.default_can_view_member_documents !== false;
  const classAllowsReserve = membershipClass.default_can_reserve_assets === true;

  return {
    can_log_in: canLogin,
    can_view_user_dashboard: canViewPortal || has("organization.admin.open") || has("organization.view_admin"),
    can_view_member_documents: canViewPortal && classAllowsDocs && (has("documents.view_member") || has("documents.manage")),
    can_view_roster: canLogin && (has("people.view_roster") || has("people.manage_members") || has("access.manage_memberships")),
    can_rsvp_when_event_allows: canViewPortal && (has("events.rsvp_self") || has("events.manage")),
    can_submit_gallery: canViewPortal && (has("gallery.submit") || has("gallery.manage")),
    can_reserve_assets: canLogin && bool(status.can_reserve_assets) && classAllowsReserve && (has("reservations.use") || has("reservations.manage") || has("assets.manage")),
    can_view_organization_admin: canLogin && (has("organization.admin.open") || has("organization.view_admin") || has("organization.manage_settings")),
    can_manage_people: canLogin && (has("people.manage_members") || has("access.manage_memberships")),
    can_manage_applicants: canLogin && (has("people.manage_applicants") || has("access.manage_memberships")),
    can_manage_events: canLogin && has("events.manage"),
    can_manage_documents: canLogin && has("documents.manage"),
    can_manage_gallery: canLogin && has("gallery.manage"),
    can_manage_assets: canLogin && has("assets.manage"),
    can_manage_access: canLogin && (has("access.manage_memberships") || has("organization.manage_access_settings") || has("organization.super_admin")),
    can_manage_settings: canLogin && (has("organization.manage_settings") || has("organization.super_admin")),
    is_restricted: blocksAccess,
  };
}

function safeStyleProfile(profile: JsonRecord | null | undefined): JsonRecord | null {
  if (!profile) return null;
  return {
    style_profile_id: profile.style_profile_id || null,
    profile_name: profile.profile_name || null,
    preset_key: profile.preset_key || null,
    preset_source: profile.preset_source || null,
    is_active: profile.is_active || false,
    colors_json: profile.colors_json || {},
    typography_json: profile.typography_json || {},
    spacing_json: profile.spacing_json || {},
    layout_json: profile.layout_json || {},
    component_json: profile.component_json || {},
    effects_json: profile.effects_json || {},
    media_json: profile.media_json || {},
    density: profile.density || "normal",
    card_style: profile.card_style || "standard",
    hero_style: profile.hero_style || "standard",
    logo_asset_id: profile.logo_asset_id || null,
  };
}


function pageStatusIsEnabled(value: unknown): boolean {
  const status = normalizeKey(value || "");
  return ["published", "active", "enabled", "live"].includes(status);
}

function pageSlugToPath(slug: unknown, pageKey: unknown): string {
  const raw = clean(slug || pageKey || "").replace(/^\/+/, "");
  return raw ? `/${raw}` : "#";
}

function safePortalPage(page: JsonRecord, template: JsonRecord | null | undefined, settings: JsonRecord | null | undefined): JsonRecord {
  const pageKey = normalizeKey(page.page_key || template?.template_key || "page");
  const navLabel = clean(page.nav_label || settings?.title || template?.template_name || pageKey);
  return {
    customer_page_id: page.customer_page_id || null,
    template_id: page.template_id || null,
    page_key: pageKey,
    page_slug: clean(page.page_slug || pageKey),
    path: pageSlugToPath(page.page_slug, pageKey),
    nav_label: navLabel,
    title: clean(settings?.title || template?.template_name || navLabel),
    intro_text: clean(settings?.intro_text || template?.description || ""),
    show_in_nav: page.show_in_nav !== false,
    sort_order: Number(page.sort_order || template?.sort_order || 100),
    status: clean(page.status || ""),
    template_key: clean(template?.template_key || pageKey),
    template_name: clean(template?.template_name || navLabel),
    template_category: clean(template?.template_category || ""),
    module_category: clean(template?.module_category || ""),
    module_key: clean(template?.module_key || ""),
    access_default: clean(template?.access_default || ""),
    renderer_key: clean(template?.renderer_key || ""),
    labels_json: settings?.labels_json || {},
    options_json: settings?.options_json || {},
    visibility_json: settings?.visibility_json || {},
    content_json: settings?.content_json || {},
  };
}

async function fetchEnabledPortalPages(serviceClient: SupabaseClientAny, organizationIds: string[]): Promise<Map<string, JsonRecord[]>> {
  const ids = Array.from(new Set(organizationIds.map(clean).filter(Boolean)));
  const out = new Map<string, JsonRecord[]>();
  if (!ids.length) return out;

  const selectCols = "customer_page_id,customer_id,organization_id,site_id,template_id,page_key,page_slug,status,nav_label,sort_order,show_in_nav,archived_at";
  const [byCustomer, byOrganization] = await Promise.all([
    serviceClient.from("core_customer_pages").select(selectCols).in("customer_id", ids).is("archived_at", null),
    serviceClient.from("core_customer_pages").select(selectCols).in("organization_id", ids).is("archived_at", null),
  ]);
  if (byCustomer.error) throw byCustomer.error;
  if (byOrganization.error) throw byOrganization.error;

  const pageById = new Map<string, JsonRecord>();
  for (const page of [...(byCustomer.data || []), ...(byOrganization.data || [])] as JsonRecord[]) {
    if (!pageStatusIsEnabled(page.status)) continue;
    const id = clean(page.customer_page_id);
    if (id) pageById.set(id, page);
  }
  const pages = Array.from(pageById.values());
  if (!pages.length) return out;

  const templateIds = Array.from(new Set(pages.map((page) => clean(page.template_id)).filter(Boolean)));
  const pageIds = Array.from(new Set(pages.map((page) => clean(page.customer_page_id)).filter(Boolean)));

  const [{ data: templates, error: templateError }, { data: settings, error: settingsError }] = await Promise.all([
    templateIds.length ? serviceClient.from("core_template_registry").select("*").in("template_id", templateIds) : Promise.resolve({ data: [], error: null }),
    pageIds.length ? serviceClient.from("core_page_settings").select("*").in("customer_page_id", pageIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (templateError) throw templateError;
  if (settingsError) throw settingsError;

  const templateMap = new Map<string, JsonRecord>((templates || []).map((template: JsonRecord) => [clean(template.template_id), template] as [string, JsonRecord]));
  const settingsMap = new Map<string, JsonRecord>((settings || []).map((setting: JsonRecord) => [clean(setting.customer_page_id), setting] as [string, JsonRecord]));

  for (const page of pages) {
    const orgId = clean(page.organization_id || page.customer_id);
    if (!orgId) continue;
    const portalPage = safePortalPage(page, templateMap.get(clean(page.template_id)), settingsMap.get(clean(page.customer_page_id)));
    const list = out.get(orgId) || [];
    list.push(portalPage);
    out.set(orgId, list);
  }

  for (const [orgId, list] of out.entries()) {
    const deduped = new Map<string, JsonRecord>();
    for (const page of list) deduped.set(normalizeKey(page.page_key), page);
    out.set(orgId, Array.from(deduped.values()).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || clean(a.nav_label).localeCompare(clean(b.nav_label))));
  }

  return out;
}


function safeNavigationRow(row: JsonRecord): JsonRecord {
  return {
    navigation_row_id: row.navigation_row_id || null,
    row_key: clean(row.row_key || "public"),
    row_label: clean(row.row_label || row.row_key || "Public"),
    sort_order: Number(row.row_sort_order || 100),
    visibility_rule: clean(row.row_visibility_rule || "always"),
    is_enabled: row.row_is_enabled !== false,
    settings_json: jsonObject(row.row_settings_json),
  };
}

function safeNavigationItem(row: JsonRecord): JsonRecord | null {
  const itemKey = normalizeKey(row.item_key || row.page_key || row.nav_label);
  if (!itemKey) return null;
  return {
    navigation_item_id: row.navigation_item_id || null,
    item_key: itemKey,
    page_key: normalizeKey(row.page_key || itemKey),
    customer_page_id: row.customer_page_id || null,
    item_type: clean(row.item_type || "page"),
    href: pageSlugToPath(row.href || row.page_slug, row.page_key || itemKey),
    nav_label: clean(row.nav_label || row.template_name || row.page_key || itemKey),
    label: clean(row.nav_label || row.template_name || row.page_key || itemKey),
    row_key: normalizeKey(row.row_key || "public"),
    sort_order: Number(row.item_sort_order || row.sort_order || 100),
    show_in_header: row.show_in_header !== false,
    open_in_new_tab: row.open_in_new_tab === true,
    status: clean(row.status || row.item_status || "published"),
    access_level: normalizeKey(row.access_level || "public"),
    risk_level: normalizeKey(row.risk_level || "normal_restricted"),
    public_renderer_enabled: row.public_renderer_enabled === true,
    dangerous_public_allowed: row.dangerous_public_allowed === true,
    template_key: clean(row.template_key || ""),
    renderer_key: clean(row.renderer_key || ""),
    settings_json: jsonObject(row.item_settings_json),
    badge_count: Number(row.badge_count || 0),
    badge_label: clean(row.badge_label || ""),
  };
}

function buildNavigationBundle(rows: JsonRecord[]): JsonRecord {
  const first = rows[0] || {};
  const rowMap = new Map<string, JsonRecord>();
  const itemMap = new Map<string, JsonRecord>();

  for (const row of rows) {
    const rowKey = normalizeKey(row.row_key || "public");
    if (rowKey && !rowMap.has(rowKey)) rowMap.set(rowKey, safeNavigationRow(row));
    const item = safeNavigationItem(row);
    if (item?.item_key) itemMap.set(clean(item.item_key), item);
  }

  const navRows = Array.from(rowMap.values()).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const navItems = Array.from(itemMap.values()).sort((a, b) => clean(a.row_key).localeCompare(clean(b.row_key)) || Number(a.sort_order || 0) - Number(b.sort_order || 0) || clean(a.nav_label).localeCompare(clean(b.nav_label)));

  return {
    navigation_profile: {
      navigation_profile_id: first.navigation_profile_id || null,
      profile_name: first.profile_name || null,
      header_layout_key: first.header_layout_key || "pill-rows",
      show_logo: first.show_logo !== false,
      show_large_title: first.show_large_title !== false,
      show_org_context_row: first.show_org_context_row === true,
      show_user_badge: first.show_user_badge !== false,
      show_logout_button: first.show_logout_button !== false,
      settings_json: jsonObject(first.profile_settings_json),
    },
    navigation_rows: navRows,
    navigation_items: navItems,
  };
}

async function attachContactTrackerBadges(serviceClient: SupabaseClientAny, organizationIds: string[], bundles: Map<string, JsonRecord>): Promise<void> {
  const ids = Array.from(new Set(organizationIds.map(clean).filter(Boolean)));
  if (!ids.length || !bundles.size) return;
  try {
    const { data, error } = await serviceClient
      .from("core_contact_inquiries")
      .select("organization_id, contact_inquiry_id, status")
      .in("organization_id", ids)
      .eq("status", "open")
      .is("archived_at", null)
      .limit(10000);
    if (error) return;
    const counts = new Map<string, number>();
    for (const row of ((data || []) as JsonRecord[])) {
      const orgId = clean(row.organization_id);
      if (orgId) counts.set(orgId, (counts.get(orgId) || 0) + 1);
    }
    for (const [orgId, bundle] of bundles.entries()) {
      const count = counts.get(orgId) || 0;
      const items = Array.isArray(bundle.navigation_items) ? bundle.navigation_items as JsonRecord[] : [];
      for (const item of items) {
        if (normalizeKey(item.item_key || item.page_key) === "contact-tracker") {
          item.badge_count = count;
          item.badge_label = count > 0 ? String(count) : "";
          item.badge_source = "open_contact_inquiry_count";
        }
      }
    }
  } catch (error) {
    console.warn("contact_tracker_badges_unavailable", error instanceof Error ? error.message : String(error));
  }
}



async function attachApplicantTrackerBadges(serviceClient: SupabaseClientAny, organizationIds: string[], bundles: Map<string, JsonRecord>): Promise<void> {
  const ids = Array.from(new Set(organizationIds.map(clean).filter(Boolean)));
  if (!ids.length || !bundles.size) return;
  try {
    const { data, error } = await serviceClient
      .from("core_applications")
      .select("organization_id, application_id, applicant_status, archived_at")
      .in("organization_id", ids)
      .in("applicant_status", ["new", "ready_for_final_review"])
      .is("archived_at", null)
      .limit(10000);
    if (error) return;
    const counts = new Map<string, number>();
    for (const row of ((data || []) as JsonRecord[])) {
      const orgId = clean(row.organization_id);
      if (orgId) counts.set(orgId, (counts.get(orgId) || 0) + 1);
    }
    for (const [orgId, bundle] of bundles.entries()) {
      const count = counts.get(orgId) || 0;
      const items = Array.isArray(bundle.navigation_items) ? bundle.navigation_items as JsonRecord[] : [];
      for (const item of items) {
        if (normalizeKey(item.item_key || item.page_key) === "applicant-tracker") {
          item.badge_count = count;
          item.badge_label = count > 0 ? String(count) : "";
          item.badge_source = "open_applicant_count";
        }
      }
    }
  } catch (error) {
    console.warn("applicant_tracker_badges_unavailable", error instanceof Error ? error.message : String(error));
  }
}

async function fetchPortalNavigation(serviceClient: SupabaseClientAny, organizationIds: string[]): Promise<Map<string, JsonRecord>> {
  const ids = Array.from(new Set(organizationIds.map(clean).filter(Boolean)));
  const out = new Map<string, JsonRecord>();
  if (!ids.length) return out;

  try {
    const { data, error } = await serviceClient
      .from("core_portal_navigation_v1")
      .select("*")
      .in("organization_id", ids)
      .order("row_sort_order", { ascending: true })
      .order("item_sort_order", { ascending: true });
    if (error) {
      console.warn("portal_navigation_unavailable", error.message || error);
      return out;
    }
    const byOrg = new Map<string, JsonRecord[]>();
    for (const row of ((data || []) as JsonRecord[])) {
      const orgId = clean(row.organization_id);
      if (!orgId) continue;
      const list = byOrg.get(orgId) || [];
      list.push(row);
      byOrg.set(orgId, list);
    }
    for (const [orgId, rows] of byOrg.entries()) out.set(orgId, buildNavigationBundle(rows));
    await attachContactTrackerBadges(serviceClient, ids, out);
    await attachApplicantTrackerBadges(serviceClient, ids, out);
  } catch (error) {
    console.warn("portal_navigation_fetch_failed", error);
  }

  return out;
}

function findPortalPage(pages: JsonRecord[], pageKey: string): JsonRecord | null {
  const target = normalizeKey(pageKey);
  return (pages || []).find((page) => normalizeKey(page.page_key || page.template_key) === target) || null;
}

async function requireEnabledPortalPage(serviceClient: SupabaseClientAny, organizationId: string, pageKey: string): Promise<JsonRecord> {
  const pageMap = await fetchEnabledPortalPages(serviceClient, [organizationId]);
  const page = findPortalPage(pageMap.get(organizationId) || [], pageKey);
  if (!page) throw new Error("This page is not enabled for this organization.");
  return page;
}

async function getPortalPageForAction(serviceClient: SupabaseClientAny, organizationId: string, pageKey: string, platformAdmin: boolean): Promise<JsonRecord> {
  if (!platformAdmin) return await requireEnabledPortalPage(serviceClient, organizationId, pageKey);
  const pageMap = await fetchEnabledPortalPages(serviceClient, [organizationId]);
  const page = findPortalPage(pageMap.get(organizationId) || [], pageKey);
  if (page) return { ...page, platform_override: true };
  const fallbackLabel = pageKey === "organization-people" ? "People & Access" : pageKey === "roster" ? "Roster" : pageKey;
  return {
    customer_page_id: null,
    template_id: null,
    page_key: pageKey,
    template_key: pageKey,
    page_slug: pageKey,
    path: `/${pageKey}`,
    nav_label: fallbackLabel,
    title: fallbackLabel,
    intro_text: "Platform admin diagnostic access. This page is not currently published/shown for the selected organization.",
    show_in_nav: false,
    sort_order: 999,
    status: "platform_override",
    platform_override: true,
  };
}

async function writeAudit(
  serviceClient: SupabaseClientAny,
  actorEmail: string,
  actorRole: string,
  action: string,
  targetType: string,
  targetId: string | null,
  requestJson: JsonRecord,
  resultJson: JsonRecord,
): Promise<void> {
  try {
    await serviceClient.from("core_audit_log").insert({
      actor_email: actorEmail,
      actor_role: actorRole,
      action,
      target_type: targetType,
      target_id: targetId,
      request_json: requestJson,
      result_json: resultJson,
    });
  } catch (error) {
    console.error("access_audit_write_failed", error);
  }
}

async function isPlatformAdmin(serviceClient: SupabaseClientAny, email: string): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("core_admin_users")
    .select("email")
    .eq("email", normalizeEmail(email))
    .eq("role", "platform_admin")
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.email);
}

async function findAuthUserByEmail(serviceClient: SupabaseClientAny, email: string): Promise<JsonRecord | null> {
  const target = normalizeEmail(email);
  if (!target) return null;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((u: JsonRecord) => normalizeEmail(u.email) === target);
    if (match) return match;
    if (users.length < 100) break;
  }
  return null;
}

async function ensurePersonForAuthUser(serviceClient: SupabaseClientAny, user: JsonRecord): Promise<JsonRecord> {
  const authUserId = clean(user.id);
  const email = normalizeEmail(user.email);
  if (!authUserId || !email) throw new Error("Authenticated user is missing id or email.");

  const { data: existingLink, error: linkError } = await serviceClient
    .from("core_person_user_links")
    .select("person_id, core_people(*)")
    .eq("auth_user_id", authUserId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (linkError) throw linkError;
  if (existingLink?.person_id) return (existingLink.core_people || { person_id: existingLink.person_id, primary_email: email }) as JsonRecord;

  const metadata = (user.user_metadata && typeof user.user_metadata === "object") ? user.user_metadata as JsonRecord : {};
  const displayName = clean(metadata.full_name || metadata.name || email);

  let { data: person, error: personLookupError } = await serviceClient
    .from("core_people")
    .select("*")
    .eq("primary_email", email)
    .is("archived_at", null)
    .maybeSingle();
  if (personLookupError) throw personLookupError;

  if (!person) {
    const { data: insertedPerson, error: insertError } = await serviceClient
      .from("core_people")
      .insert({
        display_name: displayName,
        primary_email: email,
        status: "auth_unlinked",
        profile_json: { created_by: "core-access-action", source: "auth_user_first_login", note: "Auth login exists but no organization membership has been granted." },
      })
      .select("*")
      .single();
    if (insertError) throw insertError;
    person = insertedPerson;
  }

  const { error: createLinkError } = await serviceClient
    .from("core_person_user_links")
    .insert({
      person_id: person.person_id,
      auth_user_id: authUserId,
      email,
      status: "active",
    });
  if (createLinkError && !String(createLinkError.message || "").includes("duplicate")) throw createLinkError;

  return person;
}

async function fetchStyleProfiles(serviceClient: SupabaseClientAny, organizationIds: string[]): Promise<Map<string, JsonRecord>> {
  const styleMap = new Map<string, JsonRecord>();
  if (!organizationIds.length) return styleMap;

  const { data: byOrg, error: orgStyleError } = await serviceClient
    .from("core_customer_style_profiles")
    .select("*")
    .in("organization_id", organizationIds)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (orgStyleError) throw orgStyleError;

  for (const profile of byOrg || []) {
    const orgId = clean(profile.organization_id);
    if (orgId && !styleMap.has(orgId)) styleMap.set(orgId, profile);
  }

  const missingIds = organizationIds.filter((id) => !styleMap.has(id));
  if (missingIds.length) {
    const { data: byCustomer, error: customerStyleError } = await serviceClient
      .from("core_customer_style_profiles")
      .select("*")
      .in("customer_id", missingIds)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    if (customerStyleError) throw customerStyleError;
    for (const profile of byCustomer || []) {
      const orgId = clean(profile.organization_id || profile.customer_id);
      if (orgId && !styleMap.has(orgId)) styleMap.set(orgId, profile);
    }
  }

  return styleMap;
}

async function buildAccess(serviceClient: SupabaseClientAny, personId: string): Promise<JsonRecord[]> {
  const { data: memberships, error: membershipError } = await serviceClient
    .from("core_organization_memberships")
    .select("*")
    .eq("person_id", personId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (membershipError) throw membershipError;

  const rows = memberships || [];
  if (!rows.length) return [];

  const organizationIds: string[] = Array.from(new Set(rows.map((m: JsonRecord) => clean(m.organization_id)).filter((v: string) => Boolean(v))));
  const statusIds: string[] = Array.from(new Set(rows.map((m: JsonRecord) => clean(m.status_definition_id)).filter((v: string) => Boolean(v))));
  const membershipIds: string[] = rows.map((m: JsonRecord) => clean(m.membership_id)).filter((v: string) => Boolean(v));
  const classIds: string[] = Array.from(new Set(rows.map((m: JsonRecord) => clean(m.membership_class_definition_id)).filter((v: string) => Boolean(v))));
  const stageIds: string[] = Array.from(new Set(rows.map((m: JsonRecord) => clean(m.application_stage_definition_id)).filter((v: string) => Boolean(v))));

  const [
    { data: organizations, error: orgError },
    { data: sites, error: siteError },
    { data: statuses, error: statusError },
    { data: membershipRoles, error: mrError },
    { data: classes, error: classError },
    { data: stages, error: stageError },
  ] = await Promise.all([
    serviceClient.from("core_organizations").select("*").in("organization_id", organizationIds),
    serviceClient.from("core_sites").select("*").in("organization_id", organizationIds).is("archived_at", null),
    statusIds.length ? serviceClient.from("core_membership_status_definitions").select("*").in("status_definition_id", statusIds) : Promise.resolve({ data: [], error: null }),
    serviceClient.from("core_membership_roles").select("*").in("membership_id", membershipIds).is("archived_at", null),
    classIds.length ? serviceClient.from("core_membership_class_definitions").select("*").in("membership_class_definition_id", classIds) : Promise.resolve({ data: [], error: null }),
    stageIds.length ? serviceClient.from("core_application_stage_definitions").select("*").in("application_stage_definition_id", stageIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (orgError) throw orgError;
  if (siteError) throw siteError;
  if (statusError) throw statusError;
  if (mrError) throw mrError;
  if (classError) throw classError;
  if (stageError) throw stageError;

  const roleIds: string[] = Array.from(new Set((membershipRoles || []).map((mr: JsonRecord) => clean(mr.role_id)).filter((v: string) => Boolean(v))));
  const { data: roles, error: roleError } = roleIds.length
    ? await serviceClient.from("core_organization_roles").select("*").in("role_id", roleIds).is("archived_at", null)
    : { data: [], error: null };
  if (roleError) throw roleError;

  const styleMap = await fetchStyleProfiles(serviceClient, organizationIds);
  const portalPageMap = await fetchEnabledPortalPages(serviceClient, organizationIds);
  const navigationMap = await fetchPortalNavigation(serviceClient, organizationIds);

  const orgMap: Map<string, JsonRecord> = new Map<string, JsonRecord>((organizations || []).map((o: JsonRecord) => [clean(o.organization_id), o] as [string, JsonRecord]));
  const statusMap: Map<string, JsonRecord> = new Map<string, JsonRecord>((statuses || []).map((s: JsonRecord) => [clean(s.status_definition_id), s] as [string, JsonRecord]));
  const classMap: Map<string, JsonRecord> = new Map<string, JsonRecord>((classes || []).map((c: JsonRecord) => [clean(c.membership_class_definition_id), c] as [string, JsonRecord]));
  const stageMap: Map<string, JsonRecord> = new Map<string, JsonRecord>((stages || []).map((s: JsonRecord) => [clean(s.application_stage_definition_id), s] as [string, JsonRecord]));
  const roleMap: Map<string, JsonRecord> = new Map<string, JsonRecord>((roles || []).map((r: JsonRecord) => [clean(r.role_id), r] as [string, JsonRecord]));

  const sitesByOrg = new Map<string, JsonRecord>();
  for (const site of sites || []) {
    const orgId = clean(site.organization_id);
    if (!sitesByOrg.has(orgId) || clean(site.site_key) === "primary") sitesByOrg.set(orgId, site);
  }

  const roleRowsByMembership = new Map<string, JsonRecord[]>();
  for (const mr of ((membershipRoles || []) as JsonRecord[])) {
    const membershipId = clean(mr.membership_id);
    const role = roleMap.get(clean(mr.role_id));
    if (!role || clean(role.status) !== "active") continue;
    const existing = roleRowsByMembership.get(membershipId) || [];
    existing.push(role);
    roleRowsByMembership.set(membershipId, existing);
  }

  return rows.map((m: JsonRecord) => {
    const orgId = clean(m.organization_id);
    const org = orgMap.get(orgId) || {};
    const site = sitesByOrg.get(orgId) || {};
    const status = statusMap.get(clean(m.status_definition_id)) || {};
    const membershipClass = classMap.get(clean(m.membership_class_definition_id)) || {};
    const applicationStage = stageMap.get(clean(m.application_stage_definition_id)) || {};
    const roleRows = roleRowsByMembership.get(clean(m.membership_id)) || [];
    const permissions = Array.from(new Set(roleRows.flatMap((role) => Array.isArray(role.permission_keys) ? role.permission_keys.map(String) : []))).sort();
    const roleKeys = roleRows.map((role) => clean(role.role_key)).filter(Boolean).sort();
    const roleLabels = roleRows.map((role) => clean(role.label)).filter(Boolean).sort();
    const blocksAccess = statusBlocksAccess(status);
    const capabilities = capabilityMap(status, membershipClass, permissions, blocksAccess);
    const organizationName = clean(org.display_name || org.legal_name || org.organization_key || "Organization");

    return {
      membership_id: m.membership_id,
      organization_id: m.organization_id,
      organization_key: org.organization_key,
      organization_name: organizationName,
      site_id: site.site_id || null,
      site_key: site.site_key || null,
      membership_status_key: status.status_key || null,
      membership_status_label: status.label || null,
      lifecycle_status_key: status.status_key || null,
      lifecycle_status_label: status.label || null,
      lifecycle_category: status.lifecycle_category || null,
      membership_class_key: membershipClass.class_key || null,
      membership_class_label: membershipClass.label || null,
      membership_class_dues_behavior: membershipClass.dues_behavior || null,
      membership_class_privilege_notes: membershipClass.privilege_notes || null,
      application_stage_key: applicationStage.stage_key || null,
      application_stage_label: applicationStage.label || null,
      application_stage_category: applicationStage.stage_category || null,
      can_login: Boolean(capabilities.can_log_in),
      can_view_member_portal: Boolean(capabilities.can_view_user_dashboard),
      can_reserve_assets: Boolean(capabilities.can_reserve_assets),
      role_keys: roleKeys,
      role_labels: roleLabels,
      permission_keys: permissions,
      capabilities,
      blocks_access: blocksAccess,
      is_member: Boolean(capabilities.can_view_user_dashboard),
      is_organization_admin: Boolean(capabilities.can_view_organization_admin),
      can_manage_access: Boolean(capabilities.can_manage_access),
      title: m.title || "",
      member_number: m.member_number || "",
      style_profile: safeStyleProfile(styleMap.get(orgId)),
      portal_pages: portalPageMap.get(orgId) || [],
      navigation_profile: jsonObject(navigationMap.get(orgId)?.navigation_profile),
      navigation_rows: Array.isArray(navigationMap.get(orgId)?.navigation_rows) ? navigationMap.get(orgId)?.navigation_rows : [],
      navigation_items: Array.isArray(navigationMap.get(orgId)?.navigation_items) ? navigationMap.get(orgId)?.navigation_items : [],
    };
  });
}

async function requireMembershipAccess(
  serviceClient: SupabaseClientAny,
  personId: string,
  organizationId: string,
  permissionKey?: string,
): Promise<JsonRecord> {
  const access = await buildAccess(serviceClient, personId);
  const row = access.find((item) => clean(item.organization_id) === clean(organizationId));
  if (!row) throw new Error("You are not linked to this organization.");
  if (row.blocks_access) throw new Error("This organization access is blocked by the current lifecycle status.");
  if (permissionKey) {
    const permissions = stringArray(row.permission_keys);
    if (!permissions.includes(permissionKey) && !permissions.includes("organization.manage_settings") && !permissions.includes("organization.super_admin")) {
      throw new Error(`Missing organization permission: ${permissionKey}`);
    }
  }
  return row;
}

async function listOrganizations(serviceClient: SupabaseClientAny): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_organizations")
    .select("organization_id, organization_key, display_name, legal_name, status, vertical, organization_type")
    .is("archived_at", null)
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

const PLATFORM_PERMISSION_KEYS = [
  "organization.admin.open",
  "organization.view_admin",
  "organization.manage_settings",
  "organization.super_admin",
  "people.view_roster",
  "people.manage_members",
  "people.manage_applicants",
  "access.manage_memberships",
  "content.manage_pages",
  "events.manage",
  "events.view_member",
  "events.rsvp_self",
  "documents.manage",
  "documents.view_member",
  "gallery.manage",
  "gallery.submit",
  "assets.manage",
  "reservations.use",
  "reservations.manage",
  "reports.view",
  "communications.manage",
];

function platformCapabilities(): JsonRecord {
  return {
    can_log_in: true,
    can_view_user_dashboard: true,
    can_view_member_documents: true,
    can_view_roster: true,
    can_rsvp_when_event_allows: true,
    can_submit_gallery: true,
    can_reserve_assets: true,
    can_view_organization_admin: true,
    can_manage_people: true,
    can_manage_applicants: true,
    can_manage_events: true,
    can_manage_documents: true,
    can_manage_gallery: true,
    can_manage_assets: true,
    can_manage_access: true,
    can_manage_settings: true,
    is_restricted: false,
    platform_override: true,
  };
}

async function buildPlatformAccess(serviceClient: SupabaseClientAny, organizationId = ""): Promise<JsonRecord[]> {
  let organizations = await listOrganizations(serviceClient);
  const requestedId = clean(organizationId);
  if (requestedId) organizations = organizations.filter((org) => clean(org.organization_id) === requestedId || clean(org.organization_key) === requestedId);
  const organizationIds = organizations.map((org) => clean(org.organization_id)).filter(Boolean);
  if (!organizationIds.length) return [];

  const [{ data: sites, error: siteError }, styleMap, portalPageMap, navigationMap] = await Promise.all([
    serviceClient.from("core_sites").select("site_id, site_key, organization_id").in("organization_id", organizationIds).is("archived_at", null),
    fetchStyleProfiles(serviceClient, organizationIds),
    fetchEnabledPortalPages(serviceClient, organizationIds),
    fetchPortalNavigation(serviceClient, organizationIds),
  ]);
  if (siteError) throw siteError;

  const sitesByOrg = new Map<string, JsonRecord>();
  for (const site of sites || []) {
    const orgId = clean(site.organization_id);
    if (!sitesByOrg.has(orgId) || clean(site.site_key) === "primary") sitesByOrg.set(orgId, site);
  }

  return organizations.map((org: JsonRecord) => {
    const orgId = clean(org.organization_id);
    const site = sitesByOrg.get(orgId) || {};
    const organizationName = clean(org.display_name || org.legal_name || org.organization_key || "Organization");
    return {
      membership_id: null,
      organization_id: org.organization_id,
      organization_key: org.organization_key,
      organization_name: organizationName,
      site_id: site.site_id || null,
      site_key: site.site_key || null,
      membership_status_key: "platform-override",
      membership_status_label: "Platform Override",
      lifecycle_status_key: "platform-override",
      lifecycle_status_label: "Platform Override",
      lifecycle_category: "platform",
      membership_class_key: null,
      membership_class_label: null,
      membership_class_dues_behavior: null,
      membership_class_privilege_notes: null,
      application_stage_key: null,
      application_stage_label: null,
      application_stage_category: null,
      can_login: true,
      can_view_member_portal: true,
      can_reserve_assets: true,
      role_keys: ["platform-admin"],
      role_labels: ["Platform Admin Override"],
      permission_keys: PLATFORM_PERMISSION_KEYS,
      capabilities: platformCapabilities(),
      blocks_access: false,
      is_member: false,
      is_organization_admin: true,
      can_manage_access: true,
      title: "Platform Admin Diagnostic Access",
      member_number: "",
      style_profile: safeStyleProfile(styleMap.get(orgId)),
      portal_pages: portalPageMap.get(orgId) || [],
      navigation_profile: jsonObject(navigationMap.get(orgId)?.navigation_profile),
      navigation_rows: Array.isArray(navigationMap.get(orgId)?.navigation_rows) ? navigationMap.get(orgId)?.navigation_rows : [],
      navigation_items: Array.isArray(navigationMap.get(orgId)?.navigation_items) ? navigationMap.get(orgId)?.navigation_items : [],
      platform_override: true,
    };
  });
}

async function listPeople(serviceClient: SupabaseClientAny, body: JsonRecord): Promise<JsonRecord[]> {
  const search = clean(body.search).toLowerCase();
  let query = serviceClient
    .from("core_people")
    .select("person_id, display_name, first_name, last_name, primary_email, primary_phone, status, archived_at, created_at, updated_at")
    .order("display_name", { ascending: true })
    .limit(250);
  if (!optionalBoolean(body, "include_archived", false)) query = query.is("archived_at", null);
  if (search) query = query.or(`display_name.ilike.%${search}%,primary_email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function listRoleStatusOptions(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord> {
  const [
    { data: statuses, error: statusError },
    { data: membershipClasses, error: classError },
    { data: applicationStages, error: stageError },
    { data: roles, error: roleError },
    { data: permissions, error: permissionError },
  ] = await Promise.all([
    serviceClient.from("core_membership_status_definitions").select("*").eq("organization_id", organizationId).is("archived_at", null).order("sort_order", { ascending: true }),
    serviceClient.from("core_membership_class_definitions").select("*").eq("organization_id", organizationId).is("archived_at", null).order("sort_order", { ascending: true }),
    serviceClient.from("core_application_stage_definitions").select("*").eq("organization_id", organizationId).is("archived_at", null).order("sort_order", { ascending: true }),
    serviceClient.from("core_organization_roles").select("*").eq("organization_id", organizationId).is("archived_at", null).order("sort_order", { ascending: true }),
    serviceClient.from("core_permission_definitions").select("*").eq("status", "active").order("category", { ascending: true }).order("permission_key", { ascending: true }),
  ]);
  if (statusError) throw statusError;
  if (classError) throw classError;
  if (stageError) throw stageError;
  if (roleError) throw roleError;
  if (permissionError) throw permissionError;

  const lifecycleStatuses = ((statuses || []) as JsonRecord[]).filter((status) => {
    const key = normalizeKey(status.status_key);
    const settings = status.settings_json && typeof status.settings_json === "object" && !Array.isArray(status.settings_json) ? status.settings_json as JsonRecord : {};
    return settings.legacy_mixed_status !== true && !["full-member", "probationary-member", "family-member", "honorary-member", "waitlist", "onboarding"].includes(key);
  });

  return { statuses: lifecycleStatuses, membership_classes: membershipClasses || [], application_stages: applicationStages || [], roles: sortOrganizationRoles((roles || []) as JsonRecord[]), permissions: permissions || [] };
}

async function upsertPerson(serviceClient: SupabaseClientAny, body: JsonRecord): Promise<JsonRecord> {
  const personId = clean(body.person_id);
  const primaryEmail = normalizeEmail(body.primary_email || body.email);
  const firstName = clean(body.first_name);
  const lastName = clean(body.last_name);
  const displayName = clean(body.display_name) || clean(`${firstName} ${lastName}`) || primaryEmail;
  if (!displayName && !primaryEmail) throw new Error("Enter at least a display name or email.");

  const payload = {
    display_name: displayName || null,
    first_name: firstName || null,
    last_name: lastName || null,
    primary_email: primaryEmail || null,
    primary_phone: clean(body.primary_phone) || null,
    status: clean(body.status) || (personId ? "active" : "pending_link"),
  };

  if (personId) {
    const { data, error } = await serviceClient.from("core_people").update(payload).eq("person_id", personId).select("*").single();
    if (error) throw error;
    return data;
  }

  if (primaryEmail) {
    const { data: existing, error: existingError } = await serviceClient
      .from("core_people")
      .select("*")
      .eq("primary_email", primaryEmail)
      .is("archived_at", null)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.person_id) {
      const { data, error } = await serviceClient.from("core_people").update({ ...payload, status: clean(existing.status) || "active" }).eq("person_id", existing.person_id).select("*").single();
      if (error) throw error;
      return data;
    }
  }

  const { data, error } = await serviceClient.from("core_people").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

async function linkAuthUserByEmail(serviceClient: SupabaseClientAny, body: JsonRecord): Promise<JsonRecord> {
  const email = normalizeEmail(body.email || body.primary_email);
  if (!email) throw new Error("Missing email to link.");

  const authUser = await findAuthUserByEmail(serviceClient, email);
  if (!authUser?.id) {
    return { linked: false, email, message: "No Supabase Auth user exists yet for this email. Save the person/affiliation, send an invite or have the person sign up, then link again." };
  }

  const person = await upsertPerson(serviceClient, { ...body, primary_email: email });

  const { data: existingLink, error: lookupError } = await serviceClient
    .from("core_person_user_links")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .is("archived_at", null)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existingLink?.person_user_link_id) {
    const { data, error } = await serviceClient
      .from("core_person_user_links")
      .update({ person_id: person.person_id, email, status: "active" })
      .eq("person_user_link_id", existingLink.person_user_link_id)
      .select("*")
      .single();
    if (error) throw error;
    return { linked: true, person, link: data, auth_user_email: email };
  }

  const { data, error } = await serviceClient
    .from("core_person_user_links")
    .insert({ person_id: person.person_id, auth_user_id: authUser.id, email, status: "active" })
    .select("*")
    .single();
  if (error) throw error;
  return { linked: true, person, link: data, auth_user_email: email };
}

async function inviteAuthUserByEmail(serviceClient: SupabaseClientAny, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const email = normalizeEmail(body.email || body.primary_email);
  if (!email) throw new Error("Enter an email before sending an invitation.");

  const existing = await findAuthUserByEmail(serviceClient, email);
  if (existing?.id) {
    return {
      invited: false,
      already_exists: true,
      email,
      auth_user_id: existing.id,
      message: "A Supabase Auth login already exists for this email. Use password reset if the user cannot log in.",
    };
  }

  const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    data: { syncetc_invited_by: actorEmail, syncetc_source: "platform_access_tools" },
  });
  if (error) throw error;

  return {
    invited: true,
    already_exists: false,
    email,
    auth_user_id: data?.user?.id || null,
    message: "Invitation email requested through Supabase Auth. If delivery fails, check Supabase Auth email settings.",
  };
}

async function findLifecycleStatus(serviceClient: SupabaseClientAny, organizationId: string, statusKey: string): Promise<JsonRecord> {
  const { data: status, error } = await serviceClient
    .from("core_membership_status_definitions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status_key", statusKey)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!status?.status_definition_id) throw new Error(`Lifecycle status not found for organization: ${statusKey}`);
  return status;
}

async function findMembershipClass(serviceClient: SupabaseClientAny, organizationId: string, classKey: string): Promise<JsonRecord | null> {
  if (!classKey) return null;
  const { data, error } = await serviceClient
    .from("core_membership_class_definitions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("class_key", classKey)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function findApplicationStage(serviceClient: SupabaseClientAny, organizationId: string, stageKey: string): Promise<JsonRecord | null> {
  if (!stageKey) return null;
  const { data, error } = await serviceClient
    .from("core_application_stage_definitions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("stage_key", stageKey)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertMembership(serviceClient: SupabaseClientAny, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const organizationId = requireString(body, "organization_id");
  const personId = requireString(body, "person_id");
  let statusKey = normalizeKey(body.status_key || body.lifecycle_status_key || "active");
  let membershipClassKey = normalizeKey(body.membership_class_key || "");
  let applicationStageKey = normalizeKey(body.application_stage_key || "");
  const roleKeysWereProvided = Object.prototype.hasOwnProperty.call(body, "role_keys");
  const roleKeys = arrayOfStrings(body.role_keys);

  if (LEGACY_STATUS_TO_CLASS[statusKey]) {
    membershipClassKey = membershipClassKey || LEGACY_STATUS_TO_CLASS[statusKey];
    statusKey = "active";
  }
  if (LEGACY_STATUS_TO_STAGE[statusKey]) {
    applicationStageKey = applicationStageKey || LEGACY_STATUS_TO_STAGE[statusKey].stage_key;
    statusKey = LEGACY_STATUS_TO_STAGE[statusKey].status_key;
  }

  const status = await findLifecycleStatus(serviceClient, organizationId, statusKey);
  const membershipClass = membershipClassKey ? await findMembershipClass(serviceClient, organizationId, membershipClassKey) : null;
  const applicationStage = applicationStageKey ? await findApplicationStage(serviceClient, organizationId, applicationStageKey) : null;

  if (membershipClassKey && !membershipClass?.membership_class_definition_id) throw new Error(`Membership class not found for organization: ${membershipClassKey}`);
  if (applicationStageKey && !applicationStage?.application_stage_definition_id) throw new Error(`Application stage not found for organization: ${applicationStageKey}`);

  const payload = {
    organization_id: organizationId,
    person_id: personId,
    status_definition_id: status.status_definition_id,
    membership_class_definition_id: membershipClass?.membership_class_definition_id || null,
    application_stage_definition_id: applicationStage?.application_stage_definition_id || null,
    member_number: clean(body.member_number) || null,
    title: clean(body.title) || null,
    display_name_override: clean(body.display_name_override) || null,
    email_override: normalizeEmail(body.email_override) || null,
    phone_override: clean(body.phone_override) || null,
    notes: clean(body.notes) || null,
  };

  const { data: existing, error: existingError } = await serviceClient
    .from("core_organization_memberships")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("person_id", personId)
    .is("archived_at", null)
    .maybeSingle();
  if (existingError) throw existingError;

  let membership: JsonRecord;
  if (existing?.membership_id) {
    const { data, error } = await serviceClient
      .from("core_organization_memberships")
      .update(payload)
      .eq("membership_id", existing.membership_id)
      .select("*")
      .single();
    if (error) throw error;
    membership = data;
  } else {
    const { data, error } = await serviceClient
      .from("core_organization_memberships")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    membership = data;
  }

  if (roleKeysWereProvided) {
    const { data: roles, error: roleError } = roleKeys.length
      ? await serviceClient
        .from("core_organization_roles")
        .select("*")
        .eq("organization_id", organizationId)
        .in("role_key", roleKeys)
        .is("archived_at", null)
      : { data: [], error: null };
    if (roleError) throw roleError;

    const requestedRoleKeySet = new Set(roleKeys);
    const foundRoleKeySet = new Set((roles || []).map((r: JsonRecord) => clean(r.role_key)));
    const missingRoles = Array.from(requestedRoleKeySet).filter((key) => !foundRoleKeySet.has(key));
    if (missingRoles.length) throw new Error(`Role(s) not found for organization: ${missingRoles.join(", ")}`);

    const roleIdSet = new Set((roles || []).map((r: JsonRecord) => clean(r.role_id)));

    const { data: existingRoles, error: existingRolesError } = await serviceClient
      .from("core_membership_roles")
      .select("*")
      .eq("membership_id", membership.membership_id)
      .is("archived_at", null);
    if (existingRolesError) throw existingRolesError;

    for (const er of existingRoles || []) {
      if (!roleIdSet.has(clean(er.role_id))) {
        const { error } = await serviceClient
          .from("core_membership_roles")
          .update({ archived_at: new Date().toISOString() })
          .eq("membership_role_id", er.membership_role_id);
        if (error) throw error;
      }
    }

    for (const role of roles || []) {
      const roleId = clean(role.role_id);
      const already = (existingRoles || []).some((er: JsonRecord) => clean(er.role_id) === roleId && !er.archived_at);
      if (!already) {
        const { error } = await serviceClient.from("core_membership_roles").insert({ membership_id: membership.membership_id, role_id: roleId, assigned_by_email: actorEmail });
        if (error && !String(error.message || "").includes("duplicate")) throw error;
      }
    }
  }

  return membership;
}

async function listMemberships(serviceClient: SupabaseClientAny, body: JsonRecord): Promise<JsonRecord[]> {
  const organizationId = clean(body.organization_id);
  let query = serviceClient
    .from("core_access_platform_memberships_v1")
    .select("*")
    .order("organization_name", { ascending: true })
    .order("display_name", { ascending: true })
    .limit(500);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}


function jsonObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function deepMerge(base: JsonRecord, patch: JsonRecord): JsonRecord {
  const out: JsonRecord = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === undefined) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key] as JsonRecord, value as JsonRecord);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function uniqueValues(values: unknown[]): string[] {
  return Array.from(new Set(values.map((v) => clean(v)).filter(Boolean)));
}

function personPhotoUrl(profile: JsonRecord): string {
  const photo = jsonObject(profile.photo);
  return clean(profile.photo_url || profile.profile_photo_url || profile.avatar_url || photo.url || photo.public_url);
}

function personPhotoPath(profile: JsonRecord): string {
  const photo = jsonObject(profile.photo);
  return clean(profile.photo_path || profile.profile_photo_path || photo.path || photo.storage_path);
}

function decodePersonPhotoDataUrl(value: unknown): { mime_type: string; bytes: Uint8Array; extension: string } {
  const raw = String(value || "").trim();
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("Photo upload must be a JPG, PNG, or WebP image file.");
  const mimeType = match[1].toLowerCase();
  const extension = PERSON_PHOTO_MIME_TO_EXTENSION[mimeType];
  if (!extension) throw new Error("Photo must be a JPG, PNG, or WebP image.");
  const base64 = match[2].replace(/\s+/g, "");
  let binary = "";
  try { binary = atob(base64); } catch { throw new Error("Photo upload was not valid image data."); }
  if (binary.length > PERSON_PHOTO_MAX_BYTES) throw new Error("Photo is too large. Use an image under 5 MB.");
  if (binary.length < 12) throw new Error("Photo file appears to be empty.");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { mime_type: mimeType, bytes, extension };
}

function safeStorageSegment(value: unknown): string {
  return normalizeKey(value || crypto.randomUUID()).replace(/[^a-z0-9_.:-]/g, "-") || crypto.randomUUID();
}

function permissionSet(row: JsonRecord): Set<string> {
  return new Set(stringArray(row.permission_keys));
}

function roleSortValue(role: JsonRecord): number {
  const roleKey = normalizeKey(role.role_key);
  return ROLE_DISPLAY_ORDER[roleKey] ?? (200 + Number(role.sort_order || 0));
}

function sortOrganizationRoles(rows: JsonRecord[]): JsonRecord[] {
  return [...rows].sort((a, b) => roleSortValue(a) - roleSortValue(b) || clean(a.label || a.role_key).localeCompare(clean(b.label || b.role_key)));
}

function isSuperAdminOrganizationRoleKey(roleKey: unknown): boolean {
  return SUPER_ADMIN_ORGANIZATION_ROLE_KEYS.has(normalizeKey(roleKey));
}

function isSuperAdminRoleKey(roleKey: unknown): boolean {
  return isSuperAdminOrganizationRoleKey(roleKey);
}

function isOrganizationAdminRoleKey(roleKey: unknown): boolean {
  return ORGANIZATION_ADMIN_ROLE_KEYS.has(normalizeKey(roleKey));
}

function actorCanManagePeople(row: JsonRecord): boolean {
  const permissions = permissionSet(row);
  return permissions.has("people.manage_members") || permissions.has("people.manage_applicants") || permissions.has("access.manage_memberships") || permissions.has("organization.manage_settings") || permissions.has("organization.super_admin");
}

function actorCanManageAccess(row: JsonRecord): boolean {
  const permissions = permissionSet(row);
  const caps = jsonObject(row.capabilities);
  return Boolean(caps.can_manage_access) || permissions.has("access.manage_memberships") || permissions.has("organization.manage_settings") || permissions.has("organization.super_admin");
}

function actorCanManageSuperAdminRole(row: JsonRecord): boolean {
  const permissions = permissionSet(row);
  const roleKeys = stringArray(row.role_keys).map(normalizeKey);
  return permissions.has("organization.super_admin") || roleKeys.some(isSuperAdminRoleKey);
}

function rowAllowsAnyPermission(row: JsonRecord, permissionKeys: string[]): boolean {
  const permissions = permissionSet(row);
  if (permissions.has("organization.manage_settings") || permissions.has("organization.super_admin")) return true;
  return permissionKeys.some((key) => permissions.has(key));
}

async function requireAnyMembershipAccess(
  serviceClient: SupabaseClientAny,
  personId: string,
  organizationId: string,
  permissionKeys: string[] = [],
): Promise<JsonRecord> {
  const row = await requireMembershipAccess(serviceClient, personId, organizationId);
  if (!permissionKeys.length) return row;
  if (!rowAllowsAnyPermission(row, permissionKeys)) throw new Error(`Missing organization permission. Required one of: ${permissionKeys.join(", ")}`);
  return row;
}

function effectiveSearchText(row: JsonRecord): string {
  const parts = [
    row.display_name,
    row.first_name,
    row.last_name,
    row.primary_email,
    row.email,
    row.primary_phone,
    row.phone,
    row.member_number,
    row.title,
    row.lifecycle_status_label,
    row.lifecycle_status_key,
    row.membership_class_label,
    row.membership_class_key,
    row.application_stage_label,
    row.application_stage_key,
    row.membership_class_category,
    row.application_stage_category,
    ...(Array.isArray(row.login_emails) ? row.login_emails : []),
    ...(Array.isArray(row.role_labels) ? row.role_labels : []),
    ...(Array.isArray(row.role_keys) ? row.role_keys : []),
  ];
  return parts.map((v) => clean(v).toLowerCase()).join(" ");
}

function matchesPeopleFilter(row: JsonRecord, filterKey: string): boolean {
  const filter = normalizeKey(filterKey || "all");
  const statusKey = normalizeKey(row.lifecycle_status_key || row.membership_status_key);
  const lifecycle = normalizeKey(row.lifecycle_category);
  const stageKey = normalizeKey(row.application_stage_key);
  const stageCategory = normalizeKey(row.application_stage_category);
  const classKey = normalizeKey(row.membership_class_key);
  const classCategory = normalizeKey(row.membership_class_category);
  const roleKeys = stringArray(row.role_keys).map(normalizeKey);
  const hasRole = (roleKey: string) => roleKeys.includes(roleKey);
  const hasAnyRole = (keys: string[]) => keys.some((roleKey) => hasRole(roleKey));
  const isArchived = Boolean(row.membership_archived_at || row.person_archived_at || statusKey === "archived" || lifecycle === "archived");
  const isRestricted = Boolean(row.blocks_access || ["suspended", "expelled", "blocked"].includes(statusKey) || ["suspended", "expelled", "blocked"].includes(lifecycle));
  const isManager = roleKeys.some((roleKey) => ["applicant-manager", "asset-manager", "content-editor", "document-manager", "event-manager", "gallery-manager"].includes(roleKey));

  if (filter === "archived") return isArchived;
  if (isArchived) return false;
  if (filter === "all" || !filter) return true;
  if (filter === "active" || filter === "active-members") return statusKey === "active";
  if (filter === "applicants" || filter === "applicant") return ["applicant", "invited", "pending"].includes(statusKey) || ["applicant", "prospect"].includes(stageCategory);
  if (filter === "waitlist") return stageKey === "waitlist";
  if (filter === "onboarding") return stageKey === "onboarding" || stageCategory === "onboarding" || ["invited", "pending"].includes(statusKey);
  if (filter === "former") return ["former", "inactive"].includes(statusKey) || ["former", "inactive"].includes(lifecycle);
  if (filter === "restricted" || filter === "suspended-expelled") return isRestricted;
  if (filter === "admins") return hasAnyRole(["organization-super-admin", "organization-admin"]);
  if (filter === "board") return hasRole("board-member");
  if (filter === "managers") return isManager;
  if (filter === "users" || filter === "members") return hasRole("member") && !hasAnyRole(["organization-super-admin", "organization-admin"]);
  if (filter === "non-member") return classKey === "non-member" || classCategory === "non-member" || classCategory === "non_member";
  if (filter === "no-login") return !Boolean(row.login_linked);
  return true;
}

function isPlatformInternalPeopleRow(row: JsonRecord): boolean {
  const settings = jsonObject(row.membership_settings_json);
  const titleKey = normalizeKey(row.title);
  return Boolean(settings.platform_internal) || titleKey.startsWith("platform-admin") || Boolean(row.is_platform_internal);
}

function comparePeopleRows(a: JsonRecord, b: JsonRecord): number {
  const aLast = clean(a.last_name || clean(a.display_name).split(" ").slice(-1)[0]);
  const bLast = clean(b.last_name || clean(b.display_name).split(" ").slice(-1)[0]);
  const aFirst = clean(a.first_name || clean(a.display_name).split(" ")[0]);
  const bFirst = clean(b.first_name || clean(b.display_name).split(" ")[0]);
  return aLast.localeCompare(bLast) || aFirst.localeCompare(bFirst) || clean(a.display_name).localeCompare(clean(b.display_name)) || clean(a.primary_email).localeCompare(clean(b.primary_email));
}


function rosterVisibilityAllows(row: JsonRecord, key: string, fallback = true): boolean {
  const visibility = jsonObject(row.membership_visibility_json);
  if (visibility[key] === false) return false;
  if (visibility[key] === true) return true;
  return fallback;
}

function rosterAddress(profile: JsonRecord): JsonRecord {
  const contact = jsonObject(profile.contact);
  const address1 = clean(contact.address || contact.address_1 || contact.address_line_1 || contact.street || contact.street_address);
  const address2 = clean(contact.address2 || contact.address_2 || contact.address_line_2 || contact.apartment || contact.unit || contact.apt);
  const city = clean(contact.city);
  const state = clean(contact.state || contact.province || contact.region);
  const zip = clean(contact.zip || contact.zip_code || contact.postal_code);
  const parts = [address1, address2, [city, state].filter(Boolean).join(", "), zip].filter(Boolean);
  return { address1, address2, city, state, zip, full_address: parts.join(" ") };
}

function rosterAviationPills(profile: JsonRecord): string[] {
  const aviation = jsonObject(profile.aviation);
  const ratings = clean(aviation.ratings).toUpperCase();
  const pills: string[] = [];
  if (bool(aviation.club_cfi) || /\bCFI\b/.test(ratings)) pills.push("CFI");
  if (bool(aviation.ifr_rated) || /\bIFR\b|\bIR\b/.test(ratings)) pills.push("IFR");
  if (bool(aviation.club_night_checkout) || bool(aviation.night_checkout)) pills.push("NIGHT");
  return pills;
}

function rosterRowIsVisible(row: JsonRecord): boolean {
  const statusKey = normalizeKey(row.lifecycle_status_key || row.membership_status_key);
  const lifecycle = normalizeKey(row.lifecycle_category);
  const classKey = normalizeKey(row.membership_class_key);
  const visibility = jsonObject(row.membership_visibility_json);
  if (row.membership_archived_at || row.person_archived_at) return false;
  if (isPlatformInternalPeopleRow(row)) return false;
  if (row.blocks_access || ["suspended", "expelled", "blocked", "archived"].includes(statusKey) || ["suspended", "expelled", "blocked", "archived"].includes(lifecycle)) return false;
  if (visibility.roster_visible_to_members === false) return false;
  if (visibility.roster_visible_to_members === true) return true;
  if (classKey === "non-member" || classKey === "limited-user") return false;
  return statusKey === "active" && Boolean(row.can_view_member_portal);
}

function toRosterPerson(row: JsonRecord): JsonRecord {
  const profile = jsonObject(row.profile_json);
  const contact = jsonObject(profile.contact);
  const address = rosterVisibilityAllows(row, "address_public_to_members", true) ? rosterAddress(profile) : { address1: "", address2: "", city: "", state: "", zip: "", full_address: "" };
  const phone = rosterVisibilityAllows(row, "phone_public_to_members", true) ? clean(row.phone || row.primary_phone || contact.mobile_phone || contact.home_phone || contact.work_phone) : "";
  const email = rosterVisibilityAllows(row, "email_public_to_members", true) ? normalizeEmail(row.email || row.primary_email) : "";
  const photoUrl = personPhotoUrl(profile);
  return {
    membership_id: row.membership_id,
    person_id: row.person_id,
    display_name: clean(row.display_name),
    first_name: clean(row.first_name),
    preferred_first_name: clean(row.preferred_first_name),
    last_name: clean(row.last_name),
    sort_last_name: clean(row.last_name || clean(row.display_name).split(" ").slice(-1)[0]),
    sort_first_name: clean(row.preferred_first_name || row.first_name || clean(row.display_name).split(" ")[0]),
    title: clean(row.title),
    member_number: clean(row.member_number),
    email,
    phone,
    address,
    joined_at: clean(row.joined_at),
    membership_class_key: clean(row.membership_class_key),
    membership_class_label: clean(row.membership_class_label || row.membership_class_key),
    role_keys: stringArray(row.role_keys),
    role_labels: stringArray(row.role_labels),
    aviation_pills: rosterAviationPills(profile),
    photo_url: photoUrl,
    search_text: [row.display_name, row.first_name, row.preferred_first_name, row.last_name, row.title, row.member_number, email, phone, address.full_address, row.membership_class_label, row.membership_class_key, ...(Array.isArray(row.role_labels) ? row.role_labels : []), ...(Array.isArray(row.role_keys) ? row.role_keys : []), ...rosterAviationPills(profile)].map((v) => clean(v).toLowerCase()).join(" "),
  };
}

async function listOrganizationRoster(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord = {}): Promise<JsonRecord> {
  const rawRows = await listOrganizationPeople(serviceClient, organizationId, { include_archived: true, include_platform_internal: false, filter: "all" });
  const roster = rawRows.filter(rosterRowIsVisible).map(toRosterPerson);
  const search = clean(body.search).toLowerCase();
  const filtered = search ? roster.filter((row) => clean(row.search_text).toLowerCase().includes(search)) : roster;
  filtered.sort((a, b) => clean(a.sort_last_name).localeCompare(clean(b.sort_last_name)) || clean(a.sort_first_name).localeCompare(clean(b.sort_first_name)) || clean(a.display_name).localeCompare(clean(b.display_name)));
  const classCounts: Record<string, number> = {};
  for (const row of filtered) {
    const label = clean(row.membership_class_label || "Unclassified");
    classCounts[label] = (classCounts[label] || 0) + 1;
  }
  return { people: filtered, summary: { total: filtered.length, membership_classes: classCounts } };
}


const MEMBER_DOCUMENT_VISIBILITY_KEYS = new Set(["member", "members", "user", "users", "member-only", "members-only", "user-only", "users-only"]);
const INTERNAL_DOCUMENT_VISIBILITY_KEYS = new Set(["board", "board-internal", "board_internal", "internal", "board-only", "internal-only", "organization-admin", "organization_admin", "org-admin", "org_admin", "admin", "admins", "admin-only", "organization-admin-only"]);

function normalizeDocumentVisibility(value: unknown): string {
  return normalizeKey(value).replace(/_/g, "-");
}

function documentScopeFromBody(body: JsonRecord): "member" | "internal" {
  const raw = normalizeKey(body.document_scope || body.scope || body.page_key || body.pageKey || "member");
  if (["internal", "internal-documents", "admin-documents", "board-documents", "board", "admin"].includes(raw)) return "internal";
  return "member";
}

function documentVisibilityAllowedForScope(visibility: unknown, scope: "member" | "internal"): boolean {
  const normalized = normalizeDocumentVisibility(visibility);
  const underscored = normalized.replace(/-/g, "_");
  if (scope === "member") return MEMBER_DOCUMENT_VISIBILITY_KEYS.has(normalized) || MEMBER_DOCUMENT_VISIBILITY_KEYS.has(underscored);
  return INTERNAL_DOCUMENT_VISIBILITY_KEYS.has(normalized) || INTERNAL_DOCUMENT_VISIBILITY_KEYS.has(underscored);
}

function actorCanViewDocumentScope(row: JsonRecord, scope: "member" | "internal"): boolean {
  const permissions = permissionSet(row);
  const caps = jsonObject(row.capabilities);
  if (scope === "member") {
    return Boolean(caps.can_view_member_documents) || permissions.has("documents.view_member") || permissions.has("documents.manage") || permissions.has("organization.manage_settings") || permissions.has("organization.super_admin");
  }
  return Boolean(caps.can_view_organization_admin) || permissions.has("organization.view_admin") || permissions.has("documents.manage") || permissions.has("organization.manage_settings") || permissions.has("organization.super_admin");
}

function safeDocumentRow(doc: JsonRecord, version: JsonRecord, signed: JsonRecord): JsonRecord {
  return {
    document_id: doc.document_id || null,
    document_key: clean(doc.document_key),
    title: clean(doc.title || version.original_file_name || "Document"),
    description: clean(doc.description),
    category: clean(doc.category || "General"),
    visibility: clean(doc.visibility),
    sort_order: Number(doc.sort_order || 100),
    status: clean(doc.status),
    published_at: version.published_at || null,
    updated_at: doc.updated_at || null,
    version_id: version.version_id || null,
    version_number: version.version_number || null,
    version_label: version.version_label || null,
    original_file_name: clean(version.original_file_name),
    file_size_bytes: version.file_size_bytes || null,
    mime_type: clean(version.mime_type),
    storage_bucket: clean(version.storage_bucket),
    storage_path: clean(version.storage_path),
    preview_signed_url: signed.preview_signed_url || null,
    download_signed_url: signed.download_signed_url || null,
    signed_url: signed.download_signed_url || signed.preview_signed_url || null,
    signed_url_expires_in: signed.signed_url_expires_in || 3600,
  };
}

async function signedUrlsForDocumentVersion(serviceClient: SupabaseClientAny, version: JsonRecord): Promise<JsonRecord> {
  let previewSignedUrl: string | null = null;
  let downloadSignedUrl: string | null = null;
  const bucket = clean(version.storage_bucket || "core-documents") || "core-documents";
  const path = clean(version.storage_path);
  const fileName = clean(version.original_file_name || "document.pdf") || "document.pdf";
  if (path) {
    const { data: previewData, error: previewError } = await serviceClient.storage.from(bucket).createSignedUrl(path, 3600);
    if (!previewError && previewData?.signedUrl) previewSignedUrl = previewData.signedUrl;
    const { data: downloadData, error: downloadError } = await serviceClient.storage.from(bucket).createSignedUrl(path, 3600, { download: fileName });
    if (!downloadError && downloadData?.signedUrl) downloadSignedUrl = downloadData.signedUrl;
  }
  return { preview_signed_url: previewSignedUrl, download_signed_url: downloadSignedUrl, signed_url_expires_in: 3600 };
}

async function listOrganizationDocumentsForScope(serviceClient: SupabaseClientAny, organizationId: string, scope: "member" | "internal", body: JsonRecord = {}): Promise<JsonRecord> {
  const { data: docs, error: docsError } = await serviceClient
    .from("core_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .not("current_published_version_id", "is", null)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (docsError) throw docsError;

  const allowedDocs = ((docs || []) as JsonRecord[]).filter((doc) => {
    const status = normalizeKey(doc.status || "");
    if (!["active", "published", "live"].includes(status)) return false;
    return documentVisibilityAllowedForScope(doc.visibility, scope);
  });

  const versionIds = uniqueValues(allowedDocs.map((doc) => doc.current_published_version_id));
  const { data: versions, error: versionError } = versionIds.length
    ? await serviceClient.from("core_document_versions").select("*").in("version_id", versionIds).is("archived_at", null)
    : { data: [], error: null };
  if (versionError) throw versionError;

  const versionMap = new Map<string, JsonRecord>(((versions || []) as JsonRecord[]).map((version) => [clean(version.version_id), version] as [string, JsonRecord]));
  const out: JsonRecord[] = [];
  for (const doc of allowedDocs) {
    const version = versionMap.get(clean(doc.current_published_version_id));
    if (!version?.version_id) continue;
    const versionStatus = normalizeKey(version.version_status || "published");
    if (!["published", "active", "approved", "live"].includes(versionStatus)) continue;
    const signed = await signedUrlsForDocumentVersion(serviceClient, version);
    out.push(safeDocumentRow(doc, version, signed));
  }

  const search = clean(body.search).toLowerCase();
  const filtered = search ? out.filter((doc) => [doc.title, doc.description, doc.category, doc.original_file_name, doc.visibility].map((v) => clean(v).toLowerCase()).join(" ").includes(search)) : out;
  filtered.sort((a, b) => clean(a.category || "General").localeCompare(clean(b.category || "General")) || Number(a.sort_order || 100) - Number(b.sort_order || 100) || clean(a.title).localeCompare(clean(b.title)));
  const categoryCounts: Record<string, number> = {};
  for (const doc of filtered) {
    const category = clean(doc.category || "General") || "General";
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  }
  return { documents: filtered, summary: { total: filtered.length, categories: categoryCounts, scope } };
}

async function getActiveMembershipRoleKeys(
  serviceClient: SupabaseClientAny,
  membershipId: string,
): Promise<string[]> {
  const { data: membershipRoles, error: membershipRoleError } = await serviceClient
    .from("core_membership_roles")
    .select("role_id")
    .eq("membership_id", membershipId)
    .is("archived_at", null);
  if (membershipRoleError) throw membershipRoleError;
  const roleIds = uniqueValues(((membershipRoles || []) as JsonRecord[]).map((role: JsonRecord) => role.role_id));
  if (!roleIds.length) return [];
  const { data: roles, error: roleError } = await serviceClient
    .from("core_organization_roles")
    .select("role_key")
    .in("role_id", roleIds)
    .is("archived_at", null);
  if (roleError) throw roleError;
  return uniqueValues(((roles || []) as JsonRecord[]).map((role: JsonRecord) => role.role_key));
}

async function replaceMembershipRoles(
  serviceClient: SupabaseClientAny,
  membershipId: string,
  organizationId: string,
  roleKeys: string[],
  actorEmail: string,
): Promise<void> {
  const normalizedKeys = arrayOfStrings(roleKeys);
  const { data: roles, error: roleError } = normalizedKeys.length
    ? await serviceClient
      .from("core_organization_roles")
      .select("*")
      .eq("organization_id", organizationId)
      .in("role_key", normalizedKeys)
      .is("archived_at", null)
    : { data: [], error: null };
  if (roleError) throw roleError;

  const foundRoleKeySet = new Set((roles || []).map((r: JsonRecord) => clean(r.role_key)));
  const missingRoles = normalizedKeys.filter((key) => !foundRoleKeySet.has(key));
  if (missingRoles.length) throw new Error(`Role(s) not found for organization: ${missingRoles.join(", ")}`);

  const roleIdSet = new Set((roles || []).map((r: JsonRecord) => clean(r.role_id)));
  const { data: existingRoles, error: existingRolesError } = await serviceClient
    .from("core_membership_roles")
    .select("*")
    .eq("membership_id", membershipId)
    .is("archived_at", null);
  if (existingRolesError) throw existingRolesError;

  for (const existing of existingRoles || []) {
    if (!roleIdSet.has(clean(existing.role_id))) {
      const { error } = await serviceClient
        .from("core_membership_roles")
        .update({ archived_at: new Date().toISOString() })
        .eq("membership_role_id", existing.membership_role_id);
      if (error) throw error;
    }
  }

  for (const role of roles || []) {
    const roleId = clean(role.role_id);
    const already = (existingRoles || []).some((er: JsonRecord) => clean(er.role_id) === roleId && !er.archived_at);
    if (!already) {
      const { error } = await serviceClient.from("core_membership_roles").insert({ membership_id: membershipId, role_id: roleId, assigned_by_email: actorEmail });
      if (error && !String(error.message || "").includes("duplicate")) throw error;
    }
  }
}

async function fetchPeopleVocabulary(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord> {
  return await listRoleStatusOptions(serviceClient, organizationId);
}

async function listOrganizationPeople(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord = {}): Promise<JsonRecord[]> {
  const includeArchived = optionalBoolean(body, "include_archived", true);
  const filterKey = clean(body.filter || "all");
  const search = clean(body.search).toLowerCase();

  let membershipQuery = serviceClient
    .from("core_organization_memberships")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (!includeArchived) membershipQuery = membershipQuery.is("archived_at", null);

  const { data: memberships, error: membershipError } = await membershipQuery;
  if (membershipError) throw membershipError;
  const membershipRows = memberships || [];
  if (!membershipRows.length) return [];

  const personIds = uniqueValues(membershipRows.map((m: JsonRecord) => m.person_id));
  const membershipIds = uniqueValues(membershipRows.map((m: JsonRecord) => m.membership_id));
  const statusIds = uniqueValues(membershipRows.map((m: JsonRecord) => m.status_definition_id));
  const classIds = uniqueValues(membershipRows.map((m: JsonRecord) => m.membership_class_definition_id));
  const stageIds = uniqueValues(membershipRows.map((m: JsonRecord) => m.application_stage_definition_id));

  const [
    { data: people, error: peopleError },
    { data: statuses, error: statusError },
    { data: classes, error: classError },
    { data: stages, error: stageError },
    { data: membershipRoles, error: membershipRoleError },
    { data: links, error: linkError },
  ] = await Promise.all([
    serviceClient.from("core_people").select("*").in("person_id", personIds),
    statusIds.length ? serviceClient.from("core_membership_status_definitions").select("*").in("status_definition_id", statusIds) : Promise.resolve({ data: [], error: null }),
    classIds.length ? serviceClient.from("core_membership_class_definitions").select("*").in("membership_class_definition_id", classIds) : Promise.resolve({ data: [], error: null }),
    stageIds.length ? serviceClient.from("core_application_stage_definitions").select("*").in("application_stage_definition_id", stageIds) : Promise.resolve({ data: [], error: null }),
    serviceClient.from("core_membership_roles").select("*").in("membership_id", membershipIds).is("archived_at", null),
    serviceClient.from("core_person_user_links").select("person_id,email,status,auth_user_id,archived_at").in("person_id", personIds).is("archived_at", null),
  ]);
  if (peopleError) throw peopleError;
  if (statusError) throw statusError;
  if (classError) throw classError;
  if (stageError) throw stageError;
  if (membershipRoleError) throw membershipRoleError;
  if (linkError) throw linkError;

  const roleIds = uniqueValues((membershipRoles || []).map((mr: JsonRecord) => mr.role_id));
  const { data: roles, error: roleError } = roleIds.length
    ? await serviceClient.from("core_organization_roles").select("*").in("role_id", roleIds).is("archived_at", null)
    : { data: [], error: null };
  if (roleError) throw roleError;

  const peopleEmails = uniqueValues(((people || []) as JsonRecord[]).map((person: JsonRecord) => normalizeEmail(person.primary_email)));
  const { data: platformAdmins, error: platformAdminError } = peopleEmails.length
    ? await serviceClient
      .from("core_admin_users")
      .select("email, role, status, archived_at")
      .in("email", peopleEmails)
      .eq("role", "platform_admin")
      .eq("status", "active")
      .is("archived_at", null)
    : { data: [], error: null };
  if (platformAdminError) throw platformAdminError;
  const platformAdminEmailSet = new Set(((platformAdmins || []) as JsonRecord[]).map((admin: JsonRecord) => normalizeEmail(admin.email)).filter(Boolean));

  const peopleMap: Map<string, JsonRecord> = new Map<string, JsonRecord>(((people || []) as JsonRecord[]).map((person: JsonRecord) => [clean(person.person_id), person] as [string, JsonRecord]));
  const statusMap: Map<string, JsonRecord> = new Map<string, JsonRecord>(((statuses || []) as JsonRecord[]).map((status: JsonRecord) => [clean(status.status_definition_id), status] as [string, JsonRecord]));
  const classMap: Map<string, JsonRecord> = new Map<string, JsonRecord>(((classes || []) as JsonRecord[]).map((membershipClass: JsonRecord) => [clean(membershipClass.membership_class_definition_id), membershipClass] as [string, JsonRecord]));
  const stageMap: Map<string, JsonRecord> = new Map<string, JsonRecord>(((stages || []) as JsonRecord[]).map((stage: JsonRecord) => [clean(stage.application_stage_definition_id), stage] as [string, JsonRecord]));
  const roleMap: Map<string, JsonRecord> = new Map<string, JsonRecord>(((roles || []) as JsonRecord[]).map((role: JsonRecord) => [clean(role.role_id), role] as [string, JsonRecord]));

  const linkByPerson = new Map<string, JsonRecord[]>();
  for (const link of ((links || []) as JsonRecord[])) {
    const personId = clean(link.person_id);
    const arr = linkByPerson.get(personId) || [];
    arr.push(link);
    linkByPerson.set(personId, arr);
  }

  const rolesByMembership = new Map<string, JsonRecord[]>();
  for (const mr of ((membershipRoles || []) as JsonRecord[])) {
    const membershipId = clean(mr.membership_id);
    const role = roleMap.get(clean(mr.role_id));
    if (!role || clean(role.status) !== "active") continue;
    const arr = rolesByMembership.get(membershipId) || [];
    arr.push(role);
    rolesByMembership.set(membershipId, arr);
  }

  let rows: JsonRecord[] = (membershipRows as JsonRecord[]).map((membership: JsonRecord) => {
    const person = peopleMap.get(clean(membership.person_id)) || {};
    const status = statusMap.get(clean(membership.status_definition_id)) || {};
    const membershipClass = classMap.get(clean(membership.membership_class_definition_id)) || {};
    const applicationStage = stageMap.get(clean(membership.application_stage_definition_id)) || {};
    const roleRows = rolesByMembership.get(clean(membership.membership_id)) || [];
    const roleKeys = roleRows.map((role) => clean(role.role_key)).filter(Boolean).sort();
    const roleLabels = roleRows.map((role) => clean(role.label)).filter(Boolean).sort();
    const permissionKeys = Array.from(new Set(roleRows.flatMap((role) => Array.isArray(role.permission_keys) ? role.permission_keys.map(String) : []))).sort();
    const profile = jsonObject(person.profile_json);
    const photoUrl = personPhotoUrl(profile);
    const nameProfile = jsonObject(profile.name);
    const preferredFirstName = clean(nameProfile.preferred_first_name || nameProfile.preferred_name);
    const middleName = clean(nameProfile.middle_name || nameProfile.middle_initial);
    const suffix = clean(nameProfile.suffix);
    const calculatedName = clean(`${preferredFirstName || clean(person.first_name)} ${clean(person.last_name)} ${suffix}`) || clean(`${clean(person.first_name)} ${middleName} ${clean(person.last_name)} ${suffix}`);
    const contact = jsonObject(profile.contact);
    const membershipSettings = jsonObject(membership.settings_json);
    const effectivePhone = clean(membership.phone_override || person.primary_phone || contact.mobile_phone || contact.home_phone || contact.work_phone);
    const effectiveEmail = normalizeEmail(membership.email_override || person.primary_email);
    const platformInternal = Boolean(membershipSettings.platform_internal) || normalizeKey(membership.title).startsWith("platform-admin") || platformAdminEmailSet.has(effectiveEmail);
    const blocksAccess = statusBlocksAccess(status);
    const capabilities = capabilityMap(status, membershipClass, permissionKeys, blocksAccess);
    const activeLinks = (linkByPerson.get(clean(person.person_id)) || []).filter((link) => clean(link.status) === "active");

    return {
      membership_id: membership.membership_id,
      person_id: person.person_id || membership.person_id,
      organization_id: membership.organization_id,
      display_name: clean(membership.display_name_override || calculatedName || person.display_name || effectiveEmail),
      first_name: person.first_name || "",
      preferred_first_name: preferredFirstName,
      middle_name: middleName,
      last_name: person.last_name || "",
      suffix,
      primary_email: person.primary_email || "",
      email: effectiveEmail,
      primary_phone: person.primary_phone || "",
      phone: effectivePhone,
      person_status: person.status || "",
      person_archived_at: person.archived_at || null,
      avatar_asset_id: person.avatar_asset_id || null,
      photo_url: photoUrl,
      profile_json: profile,
      member_number: membership.member_number || "",
      title: membership.title || "",
      display_name_override: membership.display_name_override || "",
      email_override: membership.email_override || "",
      phone_override: membership.phone_override || "",
      joined_at: membership.joined_at || "",
      left_at: membership.left_at || "",
      notes: membership.notes || "",
      membership_settings_json: membershipSettings,
      is_platform_internal: platformInternal,
      membership_visibility_json: jsonObject(membership.visibility_json),
      membership_archived_at: membership.archived_at || null,
      lifecycle_status_key: status.status_key || null,
      lifecycle_status_label: status.label || null,
      lifecycle_category: status.lifecycle_category || null,
      can_login: Boolean(status.can_login),
      can_view_member_portal: Boolean(status.can_view_member_portal),
      can_reserve_assets: Boolean(status.can_reserve_assets),
      membership_class_key: membershipClass.class_key || null,
      membership_class_label: membershipClass.label || null,
      membership_class_category: membershipClass.class_category || null,
      membership_class_dues_behavior: membershipClass.dues_behavior || null,
      application_stage_key: applicationStage.stage_key || null,
      application_stage_label: applicationStage.label || null,
      application_stage_category: applicationStage.stage_category || null,
      role_keys: roleKeys,
      role_labels: roleLabels,
      permission_keys: permissionKeys,
      capabilities,
      blocks_access: blocksAccess,
      login_linked: activeLinks.length > 0,
      login_emails: activeLinks.map((link) => normalizeEmail(link.email)).filter(Boolean),
      created_at: membership.created_at,
      updated_at: membership.updated_at,
    };
  });

  if (!optionalBoolean(body, "include_platform_internal", false)) rows = rows.filter((row) => !isPlatformInternalPeopleRow(row));
  if (!(includeArchived && filterKey === "all")) rows = rows.filter((row) => matchesPeopleFilter(row, filterKey));
  if (search) rows = rows.filter((row) => effectiveSearchText(row).includes(search));

  rows.sort(comparePeopleRows);
  return rows;
}

async function getOrganizationPerson(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord = {}): Promise<JsonRecord> {
  const targetMembershipId = clean(body.membership_id);
  const targetPersonId = clean(body.person_id);
  if (!targetMembershipId && !targetPersonId) throw new Error("Select a person first.");
  const rows = await listOrganizationPeople(serviceClient, organizationId, { include_archived: true, filter: "all" });
  const row = rows.find((item) => (targetMembershipId && clean(item.membership_id) === targetMembershipId) || (targetPersonId && clean(item.person_id) === targetPersonId));
  if (!row) throw new Error("Person was not found in this organization.");
  return row;
}

async function countActiveMembershipsWithRole(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  roleKey: string,
  excludeMembershipId = "",
): Promise<number> {
  const { data: roles, error: roleError } = await serviceClient
    .from("core_organization_roles")
    .select("role_id")
    .eq("organization_id", organizationId)
    .eq("role_key", roleKey)
    .is("archived_at", null);
  if (roleError) throw roleError;
  const roleIds = uniqueValues(((roles || []) as JsonRecord[]).map((role: JsonRecord) => role.role_id));
  if (!roleIds.length) return 0;

  const { data: membershipRoles, error: membershipRoleError } = await serviceClient
    .from("core_membership_roles")
    .select("membership_id")
    .in("role_id", roleIds)
    .is("archived_at", null);
  if (membershipRoleError) throw membershipRoleError;
  const membershipIds = uniqueValues(((membershipRoles || []) as JsonRecord[]).map((row: JsonRecord) => row.membership_id)).filter((id) => clean(id) !== clean(excludeMembershipId));
  if (!membershipIds.length) return 0;

  const { data: memberships, error: membershipError } = await serviceClient
    .from("core_organization_memberships")
    .select("membership_id")
    .eq("organization_id", organizationId)
    .in("membership_id", membershipIds)
    .is("archived_at", null);
  if (membershipError) throw membershipError;
  return (memberships || []).length;
}

async function ensureRoleNotLast(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  membershipId: string,
  roleKey: string,
  message: string,
): Promise<void> {
  const others = await countActiveMembershipsWithRole(serviceClient, organizationId, roleKey, membershipId);
  if (others < 1) throw new Error(message);
}

async function saveOrganizationPerson(
  serviceClient: SupabaseClientAny,
  body: JsonRecord,
  actorEmail: string,
  actorAccess: JsonRecord,
  actorPersonId: string,
): Promise<JsonRecord> {
  if (!actorCanManagePeople(actorAccess)) throw new Error("You do not have permission to edit people for this organization.");

  const organizationId = requireString(body, "organization_id");
  const requestedRoleKeysWereProvided = Object.prototype.hasOwnProperty.call(body, "role_keys");
  const requestedRoleKeys = arrayOfStrings(body.role_keys);
  const canManageAccess = actorCanManageAccess(actorAccess);
  const canManageSafeRoles = actorCanManagePeople(actorAccess) || canManageAccess;
  if (requestedRoleKeysWereProvided && !canManageSafeRoles) throw new Error("You do not have permission to change roles for this organization.");

  const personId = clean(body.person_id);
  const membershipId = clean(body.membership_id);
  const firstName = clean(body.first_name);
  const lastName = clean(body.last_name);
  const primaryEmail = normalizeEmail(body.primary_email || body.email);
  const primaryPhone = clean(body.primary_phone);

  const profilePatch = jsonObject(body.profile_json);
  const namePatch = jsonObject(profilePatch.name);
  const preferredFirstName = clean(body.preferred_first_name || namePatch.preferred_first_name || namePatch.preferred_name);
  const middleName = clean(body.middle_name || namePatch.middle_name || namePatch.middle_initial);
  const suffix = clean(body.suffix || namePatch.suffix);
  profilePatch.name = { ...namePatch, preferred_first_name: preferredFirstName, middle_name: middleName, suffix };
  const displayName = clean(body.display_name) || [preferredFirstName || firstName, middleName, lastName, suffix].map((part) => clean(part)).filter(Boolean).join(" ") || primaryEmail;
  if (!displayName && !primaryEmail) throw new Error("Enter at least a name or email.");

  const membershipSettingsPatch = jsonObject(body.membership_settings_json);

  let existingPerson: JsonRecord | null = null;
  if (personId) {
    const { data, error } = await serviceClient.from("core_people").select("*").eq("person_id", personId).maybeSingle();
    if (error) throw error;
    existingPerson = data || null;
  } else if (primaryEmail) {
    const { data, error } = await serviceClient.from("core_people").select("*").eq("primary_email", primaryEmail).is("archived_at", null).maybeSingle();
    if (error) throw error;
    existingPerson = data || null;
  }

  const mergedProfile = deepMerge(jsonObject(existingPerson?.profile_json), profilePatch);
  const personPayload = {
    display_name: displayName || null,
    first_name: firstName || null,
    last_name: lastName || null,
    primary_email: primaryEmail || null,
    primary_phone: primaryPhone || null,
    status: clean(body.person_status) || clean(existingPerson?.status) || "active",
    profile_json: mergedProfile,
  };

  let savedPerson: JsonRecord;
  if (existingPerson?.person_id) {
    const { data, error } = await serviceClient.from("core_people").update(personPayload).eq("person_id", existingPerson.person_id).select("*").single();
    if (error) throw error;
    savedPerson = data;
  } else {
    const { data, error } = await serviceClient.from("core_people").insert(personPayload).select("*").single();
    if (error) throw error;
    savedPerson = data;
  }

  let existingMembership: JsonRecord | null = null;
  if (membershipId) {
    const { data, error } = await serviceClient.from("core_organization_memberships").select("*").eq("membership_id", membershipId).eq("organization_id", organizationId).maybeSingle();
    if (error) throw error;
    existingMembership = data || null;
  }
  if (!existingMembership) {
    const { data, error } = await serviceClient
      .from("core_organization_memberships")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("person_id", savedPerson.person_id)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    existingMembership = data || null;
  }

  const currentStatusKey = clean(body.current_status_key || body.lifecycle_status_key || body.status_key);
  const statusKey = normalizeKey(currentStatusKey || body.membership_status_key || (existingMembership ? "" : "applicant") || "applicant");
  const membershipClassKey = normalizeKey(body.membership_class_key || "");
  const applicationStageKey = normalizeKey(body.application_stage_key || "");
  const status = await findLifecycleStatus(serviceClient, organizationId, statusKey);
  if (statusBlocksAccess(status) && !optionalBoolean(body, "confirm_restrictive", false)) {
    throw new Error("Confirm before saving a restrictive lifecycle status.");
  }
  const membershipClass = membershipClassKey ? await findMembershipClass(serviceClient, organizationId, membershipClassKey) : null;
  const applicationStage = applicationStageKey ? await findApplicationStage(serviceClient, organizationId, applicationStageKey) : null;
  if (membershipClassKey && !membershipClass?.membership_class_definition_id) throw new Error(`Membership class not found: ${membershipClassKey}`);
  if (applicationStageKey && !applicationStage?.application_stage_definition_id) throw new Error(`Application stage not found: ${applicationStageKey}`);

  const mergedMembershipSettings = deepMerge(jsonObject(existingMembership?.settings_json), membershipSettingsPatch);
  const membershipPayload = {
    organization_id: organizationId,
    person_id: savedPerson.person_id,
    status_definition_id: status.status_definition_id,
    membership_class_definition_id: membershipClass?.membership_class_definition_id || null,
    application_stage_definition_id: applicationStage?.application_stage_definition_id || null,
    member_number: clean(body.member_number) || null,
    title: clean(body.title) || null,
    display_name_override: clean(body.display_name_override) || null,
    email_override: normalizeEmail(body.email_override) || null,
    phone_override: clean(body.phone_override) || null,
    joined_at: clean(body.joined_at) || null,
    left_at: clean(body.left_at) || null,
    notes: clean(body.notes) || null,
    settings_json: mergedMembershipSettings,
  };

  let savedMembership: JsonRecord;
  if (existingMembership?.membership_id) {
    const { data, error } = await serviceClient
      .from("core_organization_memberships")
      .update(membershipPayload)
      .eq("membership_id", existingMembership.membership_id)
      .select("*")
      .single();
    if (error) throw error;
    savedMembership = data;
  } else {
    const { data, error } = await serviceClient
      .from("core_organization_memberships")
      .insert(membershipPayload)
      .select("*")
      .single();
    if (error) throw error;
    savedMembership = data;
  }

  if (requestedRoleKeysWereProvided) {
    let roleKeysToSave = requestedRoleKeys;
    const savedMembershipId = clean(savedMembership.membership_id);
    const existingRoleKeys = await getActiveMembershipRoleKeys(serviceClient, savedMembershipId);
    const canManageSuperAdmin = actorCanManageSuperAdminRole(actorAccess);

    const existingHasSuperAdmin = existingRoleKeys.some(isSuperAdminRoleKey);
    const requestedHasSuperAdmin = roleKeysToSave.some(isSuperAdminRoleKey);
    if (existingHasSuperAdmin !== requestedHasSuperAdmin && !canManageSuperAdmin) {
      throw new Error("Only an Organization Super Admin can assign or remove Organization Super Admin.");
    }

    if (existingRoleKeys.some(isOrganizationAdminRoleKey) && !roleKeysToSave.some(isOrganizationAdminRoleKey)) {
      await ensureRoleNotLast(serviceClient, organizationId, savedMembershipId, ORGANIZATION_ADMIN_ROLE_KEY, "You cannot remove the last Organization Admin.");
    }
    if (existingHasSuperAdmin && !requestedHasSuperAdmin) {
      await ensureRoleNotLast(serviceClient, organizationId, savedMembershipId, SUPER_ADMIN_ROLE_KEY, "You cannot remove the last Organization Super Admin.");
    }

    await replaceMembershipRoles(serviceClient, savedMembershipId, organizationId, roleKeysToSave, actorEmail);
  }

  return await getOrganizationPerson(serviceClient, organizationId, { membership_id: savedMembership.membership_id });
}

async function archiveOrRestoreOrganizationMembership(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  body: JsonRecord,
  actorEmail: string,
  actorAccess: JsonRecord,
  actorPersonId: string,
  archive: boolean,
): Promise<JsonRecord> {
  if (!actorCanManagePeople(actorAccess)) throw new Error("You do not have permission to archive or restore people for this organization.");
  const membershipId = requireString(body, "membership_id");
  const target = await getOrganizationPerson(serviceClient, organizationId, { membership_id: membershipId });
  const targetRoleKeys = stringArray(target.role_keys).map(normalizeKey);
  const targetHasSuperAdmin = targetRoleKeys.some(isSuperAdminRoleKey);
  const targetHasOrgAdmin = targetRoleKeys.some(isOrganizationAdminRoleKey);
  const actorCanManageSuperAdmin = actorCanManageSuperAdminRole(actorAccess);

  if (archive && clean(target.person_id) === clean(actorPersonId)) {
    throw new Error("You cannot archive your own organization access from this page.");
  }
  if (targetHasSuperAdmin && !actorCanManageSuperAdmin) {
    throw new Error("Only an Organization Super Admin can archive or restore Organization Super Admin access.");
  }
  if (archive && targetHasOrgAdmin) {
    await ensureRoleNotLast(serviceClient, organizationId, membershipId, ORGANIZATION_ADMIN_ROLE_KEY, "You cannot archive the last Organization Admin.");
  }
  if (archive && targetHasSuperAdmin) {
    await ensureRoleNotLast(serviceClient, organizationId, membershipId, SUPER_ADMIN_ROLE_KEY, "You cannot archive the last Organization Super Admin.");
  }

  const payload = archive ? { archived_at: new Date().toISOString(), updated_at: new Date().toISOString() } : { archived_at: null, updated_at: new Date().toISOString() };
  const { error } = await serviceClient
    .from("core_organization_memberships")
    .update(payload)
    .eq("organization_id", organizationId)
    .eq("membership_id", membershipId);
  if (error) throw error;
  return await getOrganizationPerson(serviceClient, organizationId, { membership_id: membershipId });
}

async function findOrganizationPersonForAuthAction(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord): Promise<JsonRecord> {
  const person = await getOrganizationPerson(serviceClient, organizationId, body);
  const email = normalizeEmail(person.email || person.primary_email);
  if (!email) throw new Error("This person does not have an email address.");
  return { ...person, email };
}

async function ensureAuthLinkForPerson(serviceClient: SupabaseClientAny, personId: string, email: string, authUser: JsonRecord): Promise<JsonRecord | null> {
  const authUserId = clean(authUser.id);
  if (!authUserId || !personId) return null;
  const { data: existingLink, error: lookupError } = await serviceClient
    .from("core_person_user_links")
    .select("*")
    .eq("auth_user_id", authUserId)
    .is("archived_at", null)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existingLink?.person_user_link_id) {
    const { data, error } = await serviceClient
      .from("core_person_user_links")
      .update({ person_id: personId, email, status: "active" })
      .eq("person_user_link_id", existingLink.person_user_link_id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await serviceClient
    .from("core_person_user_links")
    .insert({ person_id: personId, auth_user_id: authUserId, email, status: "active" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function saveOrganizationPersonPhoto(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  body: JsonRecord,
  actorAccess: JsonRecord,
  actorEmail: string,
): Promise<JsonRecord> {
  if (!actorCanManagePeople(actorAccess)) throw new Error("You do not have permission to edit people for this organization.");
  const target = await getOrganizationPerson(serviceClient, organizationId, body);
  const personId = clean(target.person_id);
  if (!personId) throw new Error("Person record was not found.");

  const { data: personRecord, error: personError } = await serviceClient
    .from("core_people")
    .select("person_id, profile_json")
    .eq("person_id", personId)
    .maybeSingle();
  if (personError) throw personError;
  if (!personRecord?.person_id) throw new Error("Person record was not found.");

  const decoded = decodePersonPhotoDataUrl(body.data_url || body.file_data_url || body.file_base64);
  const currentProfile = jsonObject(personRecord.profile_json);
  const oldPath = personPhotoPath(currentProfile);
  const fileBase = normalizeKey(body.file_name || "profile-photo").slice(0, 80) || "profile-photo";
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const path = `organizations/${safeStorageSegment(organizationId)}/people/${safeStorageSegment(personId)}/profile/photo-${stamp}-${fileBase}.${decoded.extension}`;

  const { error: uploadError } = await serviceClient.storage
    .from(PERSON_PHOTO_BUCKET)
    .upload(path, decoded.bytes, { contentType: decoded.mime_type, cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicData } = serviceClient.storage.from(PERSON_PHOTO_BUCKET).getPublicUrl(path);
  const publicUrl = clean(publicData?.publicUrl);
  if (!publicUrl) throw new Error("Photo uploaded, but no public URL was returned.");

  const updatedAt = new Date().toISOString();
  const nextProfile: JsonRecord = {
    ...currentProfile,
    photo_url: publicUrl,
    profile_photo_url: publicUrl,
    avatar_url: publicUrl,
    photo_path: path,
    profile_photo_path: path,
    photo: {
      bucket: PERSON_PHOTO_BUCKET,
      path,
      storage_path: path,
      url: publicUrl,
      public_url: publicUrl,
      mime_type: decoded.mime_type,
      size_bytes: decoded.bytes.byteLength,
      original_file_name: clean(body.file_name),
      uploaded_at: updatedAt,
      uploaded_by_email: actorEmail,
      visibility: "organization_roster",
    },
  };

  const { error: updateError } = await serviceClient
    .from("core_people")
    .update({ profile_json: nextProfile })
    .eq("person_id", personId);
  if (updateError) throw updateError;

  if (oldPath && oldPath !== path && oldPath.startsWith(`organizations/${safeStorageSegment(organizationId)}/people/${safeStorageSegment(personId)}/`)) {
    try { await serviceClient.storage.from(PERSON_PHOTO_BUCKET).remove([oldPath]); } catch { /* best-effort cleanup only */ }
  }

  return await getOrganizationPerson(serviceClient, organizationId, { membership_id: target.membership_id, person_id: personId });
}

async function removeOrganizationPersonPhoto(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  body: JsonRecord,
  actorAccess: JsonRecord,
): Promise<JsonRecord> {
  if (!actorCanManagePeople(actorAccess)) throw new Error("You do not have permission to edit people for this organization.");
  const target = await getOrganizationPerson(serviceClient, organizationId, body);
  const personId = clean(target.person_id);
  if (!personId) throw new Error("Person record was not found.");

  const { data: personRecord, error: personError } = await serviceClient
    .from("core_people")
    .select("person_id, profile_json")
    .eq("person_id", personId)
    .maybeSingle();
  if (personError) throw personError;
  if (!personRecord?.person_id) throw new Error("Person record was not found.");

  const nextProfile: JsonRecord = { ...jsonObject(personRecord.profile_json) };
  const oldPath = personPhotoPath(nextProfile);
  delete nextProfile.photo_url;
  delete nextProfile.profile_photo_url;
  delete nextProfile.avatar_url;
  delete nextProfile.photo_path;
  delete nextProfile.profile_photo_path;
  delete nextProfile.photo;

  const { error: updateError } = await serviceClient
    .from("core_people")
    .update({ profile_json: nextProfile })
    .eq("person_id", personId);
  if (updateError) throw updateError;

  if (oldPath && oldPath.startsWith(`organizations/${safeStorageSegment(organizationId)}/people/${safeStorageSegment(personId)}/`)) {
    try { await serviceClient.storage.from(PERSON_PHOTO_BUCKET).remove([oldPath]); } catch { /* best-effort cleanup only */ }
  }

  return await getOrganizationPerson(serviceClient, organizationId, { membership_id: target.membership_id, person_id: personId });
}


async function getSelfProfileContext(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  personId: string,
  platformAdmin: boolean,
): Promise<{ accessRow: JsonRecord; page: JsonRecord; profilePerson: JsonRecord }> {
  if (!organizationId) throw new Error("Missing organization context.");

  const accessRows = platformAdmin ? await buildPlatformAccess(serviceClient, organizationId) : await buildAccess(serviceClient, personId);
  const accessRow = accessRows.find((row: JsonRecord) => clean(row.organization_id) === clean(organizationId));
  if (!accessRow) throw new Error("You are not linked to this organization.");
  if (!platformAdmin && accessRow.blocks_access) throw new Error("Your organization access is blocked by the current lifecycle status.");

  const caps = jsonObject(accessRow.capabilities);
  const permissions = stringArray(accessRow.permission_keys);
  const canViewProfile = platformAdmin || Boolean(caps.can_view_user_dashboard) || permissions.includes("member.profile.view") || permissions.includes("member.profile.update_self");
  if (!canViewProfile) throw new Error("You do not have profile access for this organization.");

  const page = await getPortalPageForAction(serviceClient, organizationId, "my-profile", platformAdmin);

  let profilePerson: JsonRecord;
  const membershipId = clean(accessRow.membership_id);
  if (membershipId) {
    profilePerson = await getOrganizationPerson(serviceClient, organizationId, { membership_id: membershipId, person_id: personId });
  } else {
    const { data: personRecord, error: personError } = await serviceClient
      .from("core_people")
      .select("*")
      .eq("person_id", personId)
      .maybeSingle();
    if (personError) throw personError;
    if (!personRecord?.person_id) throw new Error("Person profile was not found.");
    profilePerson = {
      person_id: personRecord.person_id,
      membership_id: null,
      organization_id: organizationId,
      display_name: clean(personRecord.display_name || personRecord.primary_email),
      first_name: clean(personRecord.first_name),
      preferred_first_name: clean(jsonObject(jsonObject(personRecord.profile_json).name).preferred_first_name),
      middle_name: clean(jsonObject(jsonObject(personRecord.profile_json).name).middle_name),
      last_name: clean(personRecord.last_name),
      suffix: clean(jsonObject(jsonObject(personRecord.profile_json).name).suffix),
      primary_email: normalizeEmail(personRecord.primary_email),
      email: normalizeEmail(personRecord.primary_email),
      primary_phone: clean(personRecord.primary_phone),
      phone: clean(personRecord.primary_phone),
      profile_json: jsonObject(personRecord.profile_json),
      photo_url: personPhotoUrl(jsonObject(personRecord.profile_json)),
      role_keys: stringArray(accessRow.role_keys),
      role_labels: stringArray(accessRow.role_labels),
      lifecycle_status_key: accessRow.lifecycle_status_key,
      lifecycle_status_label: accessRow.lifecycle_status_label,
      membership_class_key: accessRow.membership_class_key,
      membership_class_label: accessRow.membership_class_label,
      application_stage_key: accessRow.application_stage_key,
      application_stage_label: accessRow.application_stage_label,
      member_number: clean(accessRow.member_number),
      title: clean(accessRow.title),
      platform_override: true,
    };
  }

  return { accessRow, page, profilePerson };
}

function safeSelfProfilePerson(row: JsonRecord): JsonRecord {
  const profile = jsonObject(row.profile_json);
  const contact = jsonObject(profile.contact);
  const name = jsonObject(profile.name);
  const photoUrl = personPhotoUrl(profile);
  return {
    person_id: row.person_id || null,
    membership_id: row.membership_id || null,
    display_name: clean(row.display_name),
    first_name: clean(row.first_name),
    preferred_first_name: clean(row.preferred_first_name || name.preferred_first_name || name.preferred_name),
    middle_name: clean(row.middle_name || name.middle_name || name.middle_initial),
    last_name: clean(row.last_name),
    suffix: clean(row.suffix || name.suffix),
    primary_email: normalizeEmail(row.primary_email || row.email),
    email: normalizeEmail(row.email || row.primary_email),
    primary_phone: clean(row.primary_phone || row.phone),
    phone: clean(row.phone || row.primary_phone),
    mobile_phone: clean(contact.mobile_phone || contact.mobile || contact.cell_phone),
    home_phone: clean(contact.home_phone),
    work_phone: clean(contact.work_phone),
    mobile_can_text: Boolean(contact.mobile_can_text || contact.can_text_mobile || contact.sms_ok),
    can_text_mobile: Boolean(contact.mobile_can_text || contact.can_text_mobile || contact.sms_ok),
    primary_phone_type: clean(contact.primary_phone_type || "mobile"),
    address_1: clean(contact.address_1 || contact.address || contact.street_address || contact.street),
    address_2: clean(contact.address_2 || contact.address2 || contact.apartment || contact.unit),
    city: clean(contact.city),
    state: clean(contact.state || contact.province || contact.region),
    zip: clean(contact.zip || contact.zip_code || contact.postal_code),
    emergency_contact_name: clean(contact.emergency_contact_name || jsonObject(contact.emergency_contact).name),
    emergency_contact_relationship: clean(contact.emergency_contact_relationship || jsonObject(contact.emergency_contact).relationship),
    emergency_contact_phone: clean(contact.emergency_contact_phone || jsonObject(contact.emergency_contact).phone),
    photo_url: photoUrl,
    profile_json: profile,
    member_number: clean(row.member_number),
    title: clean(row.title),
    lifecycle_status_key: row.lifecycle_status_key || null,
    lifecycle_status_label: row.lifecycle_status_label || null,
    membership_class_key: row.membership_class_key || null,
    membership_class_label: row.membership_class_label || null,
    application_stage_key: row.application_stage_key || null,
    application_stage_label: row.application_stage_label || null,
    role_keys: stringArray(row.role_keys),
    role_labels: stringArray(row.role_labels),
  };
}

async function memberGetMyProfile(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  personId: string,
  platformAdmin: boolean,
): Promise<JsonRecord> {
  const { accessRow, page, profilePerson } = await getSelfProfileContext(serviceClient, organizationId, personId, platformAdmin);
  return { access: accessRow, page, profile: safeSelfProfilePerson(profilePerson) };
}

function validEmailForRequest(value: unknown): string {
  const email = normalizeEmail(value);
  if (!email) throw new Error("Enter the new email address.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

function validPhone(value: unknown): string {
  const phone = clean(value);
  if (!phone) return "";
  const digits = phone.replace(/\D+/g, "");
  if (digits.length < 7 || digits.length > 15) throw new Error("Phone numbers should contain 7 to 15 digits.");
  return phone;
}

async function memberSaveMyProfile(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  personId: string,
  platformAdmin: boolean,
  body: JsonRecord,
): Promise<JsonRecord> {
  const { accessRow, page } = await getSelfProfileContext(serviceClient, organizationId, personId, platformAdmin);
  const caps = jsonObject(accessRow.capabilities);
  const permissions = stringArray(accessRow.permission_keys);
  const canUpdate = platformAdmin || Boolean(caps.can_view_user_dashboard) || permissions.includes("member.profile.update_self");
  if (!canUpdate) throw new Error("You do not have permission to update this profile.");

  const { data: personRecord, error: personError } = await serviceClient
    .from("core_people")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  if (personError) throw personError;
  if (!personRecord?.person_id) throw new Error("Person profile was not found.");

  const currentProfile = jsonObject(personRecord.profile_json);
  const currentName = jsonObject(currentProfile.name);
  const currentContact = jsonObject(currentProfile.contact);
  const preferredFirstName = clean(body.preferred_first_name || body.preferred_name);
  const middleName = clean(body.middle_name || body.middle_initial);
  const suffix = clean(body.suffix);
  const mobilePhone = validPhone(body.mobile_phone);
  const homePhone = validPhone(body.home_phone);
  const workPhone = validPhone(body.work_phone);
  const mobileCanText = optionalBoolean(body, "mobile_can_text", Boolean(currentContact.mobile_can_text || currentContact.can_text_mobile || currentContact.sms_ok));
  const emergencyContactName = clean(body.emergency_contact_name);
  const emergencyContactRelationship = clean(body.emergency_contact_relationship);
  const emergencyContactPhone = validPhone(body.emergency_contact_phone);
  const primaryPhoneTypeRaw = normalizeKey(body.primary_phone_type || currentContact.primary_phone_type || "mobile");
  const primaryPhoneType = ["mobile", "home", "work"].includes(primaryPhoneTypeRaw) ? primaryPhoneTypeRaw : "mobile";
  const primaryPhone = primaryPhoneType === "home" ? homePhone : primaryPhoneType === "work" ? workPhone : mobilePhone;
  const address1 = clean(body.address_1 || body.address || body.street_address);
  const address2 = clean(body.address_2 || body.address2 || body.apartment || body.unit);
  const city = clean(body.city);
  const state = clean(body.state || body.province || body.region);
  const zip = clean(body.zip || body.zip_code || body.postal_code);

  const nextProfile = deepMerge(currentProfile, {
    name: {
      ...currentName,
      preferred_first_name: preferredFirstName,
      middle_name: middleName,
      suffix,
    },
    contact: {
      ...currentContact,
      mobile_phone: mobilePhone,
      mobile_can_text: mobileCanText,
      can_text_mobile: mobileCanText,
      sms_ok: mobileCanText,
      home_phone: homePhone,
      work_phone: workPhone,
      primary_phone_type: primaryPhoneType,
      address_1: address1,
      address: address1,
      street_address: address1,
      address_2: address2,
      city,
      state,
      zip,
      zip_code: zip,
      emergency_contact_name: emergencyContactName,
      emergency_contact_relationship: emergencyContactRelationship,
      emergency_contact_phone: emergencyContactPhone,
      emergency_contact: { name: emergencyContactName, relationship: emergencyContactRelationship, phone: emergencyContactPhone },
    },
  });

  const firstName = clean(personRecord.first_name);
  const lastName = clean(personRecord.last_name);
  const displayName = [preferredFirstName || firstName, lastName, suffix].filter(Boolean).join(" ") || clean(personRecord.display_name || personRecord.primary_email);

  const { error: updateError } = await serviceClient
    .from("core_people")
    .update({
      display_name: displayName || null,
      primary_phone: primaryPhone || null,
      profile_json: nextProfile,
    })
    .eq("person_id", personId);
  if (updateError) throw updateError;

  const refreshed = await memberGetMyProfile(serviceClient, organizationId, personId, platformAdmin);
  return { ...refreshed, page };
}

async function memberRequestEmailChange(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  personId: string,
  platformAdmin: boolean,
  authUserId: string,
  body: JsonRecord,
): Promise<JsonRecord> {
  await getSelfProfileContext(serviceClient, organizationId, personId, platformAdmin);
  const newEmail = validEmailForRequest(body.new_email || body.email);
  const redirectTo = clean(body.redirect_to) || "https://syncetc.webflow.io/my-profile";
  const { data: personRecord, error: personError } = await serviceClient.from("core_people").select("profile_json").eq("person_id", personId).maybeSingle();
  if (personError) throw personError;
  const profile = jsonObject(personRecord?.profile_json);
  const nextProfile = deepMerge(profile, { account: { pending_email_change: newEmail, email_change_requested_at: new Date().toISOString(), email_change_redirect_to: redirectTo, auth_user_id: authUserId } });
  const { error: updateError } = await serviceClient.from("core_people").update({ profile_json: nextProfile }).eq("person_id", personId);
  if (updateError) throw updateError;
  return { requested: true, email: newEmail, message: "Email change request recorded. Complete the confirmation email from Supabase before using the new address to log in." };
}

async function memberSaveProfilePhoto(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  personId: string,
  platformAdmin: boolean,
  actorEmail: string,
  body: JsonRecord,
): Promise<JsonRecord> {
  const { accessRow } = await getSelfProfileContext(serviceClient, organizationId, personId, platformAdmin);
  const caps = jsonObject(accessRow.capabilities);
  const permissions = stringArray(accessRow.permission_keys);
  const canUpdate = platformAdmin || Boolean(caps.can_view_user_dashboard) || permissions.includes("member.profile.update_self");
  if (!canUpdate) throw new Error("You do not have permission to update this profile photo.");

  const { data: personRecord, error: personError } = await serviceClient
    .from("core_people")
    .select("person_id, profile_json")
    .eq("person_id", personId)
    .maybeSingle();
  if (personError) throw personError;
  if (!personRecord?.person_id) throw new Error("Person profile was not found.");

  const decoded = decodePersonPhotoDataUrl(body.data_url || body.file_data_url || body.file_base64);
  const currentProfile = jsonObject(personRecord.profile_json);
  const oldPath = personPhotoPath(currentProfile);
  const fileBase = normalizeKey(body.file_name || "profile-photo").slice(0, 80) || "profile-photo";
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const path = `organizations/${safeStorageSegment(organizationId)}/people/${safeStorageSegment(personId)}/profile/self-photo-${stamp}-${fileBase}.${decoded.extension}`;

  const { error: uploadError } = await serviceClient.storage
    .from(PERSON_PHOTO_BUCKET)
    .upload(path, decoded.bytes, { contentType: decoded.mime_type, cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicData } = serviceClient.storage.from(PERSON_PHOTO_BUCKET).getPublicUrl(path);
  const publicUrl = clean(publicData?.publicUrl);
  if (!publicUrl) throw new Error("Photo uploaded, but no public URL was returned.");

  const updatedAt = new Date().toISOString();
  const nextProfile: JsonRecord = {
    ...currentProfile,
    photo_url: publicUrl,
    profile_photo_url: publicUrl,
    avatar_url: publicUrl,
    photo_path: path,
    profile_photo_path: path,
    photo: {
      bucket: PERSON_PHOTO_BUCKET,
      path,
      storage_path: path,
      url: publicUrl,
      public_url: publicUrl,
      mime_type: decoded.mime_type,
      size_bytes: decoded.bytes.byteLength,
      original_file_name: clean(body.file_name),
      uploaded_at: updatedAt,
      uploaded_by_email: actorEmail,
      visibility: "organization_roster",
      source: "member_self_service",
    },
  };

  const { error: updateError } = await serviceClient.from("core_people").update({ profile_json: nextProfile }).eq("person_id", personId);
  if (updateError) throw updateError;

  if (oldPath && oldPath !== path && oldPath.startsWith(`organizations/${safeStorageSegment(organizationId)}/people/${safeStorageSegment(personId)}/`)) {
    try { await serviceClient.storage.from(PERSON_PHOTO_BUCKET).remove([oldPath]); } catch { /* best-effort cleanup only */ }
  }

  return await memberGetMyProfile(serviceClient, organizationId, personId, platformAdmin);
}

async function memberRemoveProfilePhoto(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  personId: string,
  platformAdmin: boolean,
): Promise<JsonRecord> {
  const { accessRow } = await getSelfProfileContext(serviceClient, organizationId, personId, platformAdmin);
  const caps = jsonObject(accessRow.capabilities);
  const permissions = stringArray(accessRow.permission_keys);
  const canUpdate = platformAdmin || Boolean(caps.can_view_user_dashboard) || permissions.includes("member.profile.update_self");
  if (!canUpdate) throw new Error("You do not have permission to update this profile photo.");

  const { data: personRecord, error: personError } = await serviceClient.from("core_people").select("person_id, profile_json").eq("person_id", personId).maybeSingle();
  if (personError) throw personError;
  if (!personRecord?.person_id) throw new Error("Person profile was not found.");
  const nextProfile: JsonRecord = { ...jsonObject(personRecord.profile_json) };
  const oldPath = personPhotoPath(nextProfile);
  delete nextProfile.photo_url;
  delete nextProfile.profile_photo_url;
  delete nextProfile.avatar_url;
  delete nextProfile.photo_path;
  delete nextProfile.profile_photo_path;
  delete nextProfile.photo;
  const { error: updateError } = await serviceClient.from("core_people").update({ profile_json: nextProfile }).eq("person_id", personId);
  if (updateError) throw updateError;
  if (oldPath && oldPath.startsWith(`organizations/${safeStorageSegment(organizationId)}/people/${safeStorageSegment(personId)}/`)) {
    try { await serviceClient.storage.from(PERSON_PHOTO_BUCKET).remove([oldPath]); } catch { /* best-effort cleanup only */ }
  }
  return await memberGetMyProfile(serviceClient, organizationId, personId, platformAdmin);
}

async function sendOrganizationInvite(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const person = await findOrganizationPersonForAuthAction(serviceClient, organizationId, body);
  const email = normalizeEmail(person.email);
  const existing = await findAuthUserByEmail(serviceClient, email);
  if (existing?.id) {
    const link = await ensureAuthLinkForPerson(serviceClient, clean(person.person_id), email, existing);
    return { invited: false, already_exists: true, linked: Boolean(link), email, auth_user_id: existing.id, message: "A login already exists. The login was linked to this person if needed. Use password reset if they cannot log in." };
  }

  const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    data: { syncetc_invited_by: actorEmail, syncetc_source: "organization_people", organization_id: organizationId },
  });
  if (error) throw error;
  if (data?.user?.id) await ensureAuthLinkForPerson(serviceClient, clean(person.person_id), email, data.user as JsonRecord);
  return { invited: true, already_exists: false, linked: Boolean(data?.user?.id), email, auth_user_id: data?.user?.id || null, message: "Invitation email requested." };
}

async function sendOrganizationPasswordReset(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord): Promise<JsonRecord> {
  const person = await findOrganizationPersonForAuthAction(serviceClient, organizationId, body);
  const email = normalizeEmail(person.email);
  const existing = await findAuthUserByEmail(serviceClient, email);
  if (!existing?.id) return { sent: false, email, message: "No login exists yet for this email. Send an invite first." };
  await ensureAuthLinkForPerson(serviceClient, clean(person.person_id), email, existing);
  const { error } = await serviceClient.auth.resetPasswordForEmail(email, { redirectTo: "https://syncetc.webflow.io/password-reset" });
  if (error) throw error;
  return { sent: true, email, message: "Password reset email requested." };
}


const CONTACT_TRACKER_STATUS_KEYS = new Set(["open", "resolved", "spam_suspected", "archived"]);

function validContactStatus(value: unknown, fallback = "open"): string {
  const status = normalizeKey(value || fallback).replace(/-/g, "_");
  if (status === "closed") return "resolved";
  if (status === "spam" || status === "spam-suspected") return "spam_suspected";
  return CONTACT_TRACKER_STATUS_KEYS.has(status) ? status : fallback;
}

function safeEmail(value: unknown): string {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeContactInquiry(row: JsonRecord): JsonRecord {
  const status = validContactStatus(row.status, "open");
  return {
    contact_inquiry_id: row.contact_inquiry_id || null,
    id: row.contact_inquiry_id || null,
    organization_id: row.organization_id || null,
    site_id: row.site_id || null,
    customer_page_id: row.customer_page_id || null,
    source_page_key: clean(row.source_page_key),
    source_url: clean(row.source_url),
    name: clean(row.name),
    email: normalizeEmail(row.email),
    phone: clean(row.phone || row.primary_phone),
    subject: clean(row.subject),
    reason_key: normalizeKey(row.reason_key || row.subject || "general"),
    message: clean(row.message),
    status,
    is_open: status === "open",
    priority: clean(row.priority || "normal"),
    spam_score: Number(row.spam_score || 0),
    spam_reason: clean(row.spam_reason),
    internal_notes: clean(row.internal_notes),
    board_notes: clean(row.internal_notes),
    metadata_json: jsonObject(row.metadata_json),
    last_reply_at: row.last_reply_at || null,
    last_reply_by_email: row.last_reply_by_email || null,
    resolved_at: row.resolved_at || null,
    resolved_by_email: row.resolved_by_email || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function defaultContactReasonOptions(): JsonRecord[] {
  return [
    { key: "general", label: "General question" },
    { key: "membership-application", label: "Membership / application question" },
    { key: "aircraft-fleet", label: "Aircraft / fleet question" },
    { key: "event", label: "Event question" },
    { key: "website-issue", label: "Website issue" },
    { key: "other", label: "Other" },
  ];
}

function safeContactSettings(row: JsonRecord | null | undefined, organizationName = "Organization"): JsonRecord {
  const reasons = Array.isArray(row?.reason_options_json) ? row?.reason_options_json as JsonRecord[] : defaultContactReasonOptions();
  return {
    contact_settings_id: row?.contact_settings_id || null,
    is_enabled: row?.is_enabled !== false,
    public_form_enabled: row?.public_form_enabled !== false,
    tracker_enabled: row?.tracker_enabled !== false,
    reason_options: reasons,
    spam_settings_json: jsonObject(row?.spam_settings_json),
    sender_mode: clean(row?.sender_mode || "syncetc_managed"),
    from_display_name: clean(row?.from_display_name || `${organizationName} via SyncEtc`),
    reply_to_email: normalizeEmail(row?.reply_to_email),
    settings_json: jsonObject(row?.settings_json),
  };
}

async function getContactSettings(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord> {
  const { data: org, error: orgError } = await serviceClient
    .from("core_organizations")
    .select("display_name, organization_key")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (orgError) throw orgError;
  const organizationName = clean(org?.display_name || org?.organization_key || "Organization");

  const { data, error } = await serviceClient
    .from("core_contact_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return safeContactSettings(data || null, organizationName);
}

async function listContactReplyTemplates(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_contact_reply_templates")
    .select("contact_reply_template_id, template_key, template_name, subject, body_text, body_html, is_default, status, sort_order, created_at, updated_at, archived_at")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("template_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

function plainTextFromHtml(value: unknown): string {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeContactTemplateHtml(value: unknown): string {
  let html = String(value || "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select)[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select)[^>]*\/?>/gi, "");
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/\s+(style|class|id)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/href\s*=\s*("|')\s*(?!https?:|mailto:|#)/gi, 'href=$1#');
  html = html.replace(/<(?!\/?(?:p|br|strong|b|em|i|u|ul|ol|li|a)(?:\s|>|\/))/gi, "&lt;");
  return html.trim();
}

function safeContactReplyTemplate(row: JsonRecord): JsonRecord {
  return {
    contact_reply_template_id: row.contact_reply_template_id || null,
    template_key: normalizeKey(row.template_key || row.template_name || "template"),
    template_name: clean(row.template_name || row.template_key || "Template"),
    subject: clean(row.subject),
    body_text: clean(row.body_text || plainTextFromHtml(row.body_html)),
    body_html: sanitizeContactTemplateHtml(row.body_html || htmlFromText(clean(row.body_text))),
    is_default: row.is_default === true,
    status: clean(row.status || "active"),
    sort_order: Number(row.sort_order || 100),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function listContactReplyTemplatesForAdmin(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_contact_reply_templates")
    .select("contact_reply_template_id, template_key, template_name, subject, body_text, body_html, is_default, status, sort_order, created_at, updated_at, archived_at")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("template_name", { ascending: true });
  if (error) throw error;
  return ((data || []) as JsonRecord[]).map(safeContactReplyTemplate);
}

async function upsertContactReplyTemplate(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const templateId = clean(body.contact_reply_template_id || body.template_id);
  const templateName = requireString(body, "template_name");
  const templateKey = normalizeKey(body.template_key || templateName);
  if (!templateKey) throw new Error("Template key could not be generated.");
  const subject = requireString(body, "subject");
  const bodyHtml = sanitizeContactTemplateHtml(body.body_html || htmlFromText(clean(body.body_text || body.message || "")));
  const bodyText = clean(body.body_text || plainTextFromHtml(bodyHtml));
  if (!bodyText) throw new Error("Template message body is required.");
  const makeDefault = optionalBoolean(body, "is_default", false);
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 100;

  const payload = {
    organization_id: organizationId,
    site_id: clean(body.site_id) || null,
    template_key: templateKey,
    template_name: templateName,
    subject,
    body_text: bodyText,
    body_html: bodyHtml,
    is_default: makeDefault,
    status: clean(body.status || "active") || "active",
    sort_order: sortOrder,
    settings_json: jsonObject(body.settings_json),
    updated_at: new Date().toISOString(),
    archived_at: null,
  };

  let before: JsonRecord | null = null;
  let saved: JsonRecord;
  if (templateId) {
    const { data: existing, error: lookupError } = await serviceClient
      .from("core_contact_reply_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("contact_reply_template_id", templateId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing?.contact_reply_template_id) throw new Error("Reply template was not found.");
    before = existing;
    const { data, error } = await serviceClient
      .from("core_contact_reply_templates")
      .update(payload)
      .eq("organization_id", organizationId)
      .eq("contact_reply_template_id", templateId)
      .select("*")
      .single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await serviceClient
      .from("core_contact_reply_templates")
      .insert({ ...payload, created_at: new Date().toISOString() })
      .select("*")
      .single();
    if (error) throw error;
    saved = data;
  }

  if (makeDefault) {
    const { error } = await serviceClient
      .from("core_contact_reply_templates")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .neq("contact_reply_template_id", saved.contact_reply_template_id)
      .is("archived_at", null);
    if (error) throw error;
  }

  await writeContactTrackerEvent(serviceClient, templateId ? "reply_template_updated" : "reply_template_created", null, organizationId, actorEmail, clean(body.note), before ? safeContactReplyTemplate(before) : null, safeContactReplyTemplate(saved), { template_key: templateKey });
  return safeContactReplyTemplate(saved);
}

async function archiveContactReplyTemplate(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const templateId = clean(body.contact_reply_template_id || body.template_id);
  const templateKey = normalizeKey(body.template_key || "");
  if (!templateId && !templateKey) throw new Error("Select a reply template to archive.");
  let query = serviceClient.from("core_contact_reply_templates").select("*").eq("organization_id", organizationId).is("archived_at", null);
  query = templateId ? query.eq("contact_reply_template_id", templateId) : query.eq("template_key", templateKey);
  const { data: before, error: lookupError } = await query.maybeSingle();
  if (lookupError) throw lookupError;
  if (!before?.contact_reply_template_id) throw new Error("Reply template was not found.");

  const { data: activeTemplates, error: activeError } = await serviceClient
    .from("core_contact_reply_templates")
    .select("contact_reply_template_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("archived_at", null);
  if (activeError) throw activeError;
  if ((activeTemplates || []).length <= 1) throw new Error("Cannot archive the last active prefab reply template.");

  const { data, error } = await serviceClient
    .from("core_contact_reply_templates")
    .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_default: false })
    .eq("organization_id", organizationId)
    .eq("contact_reply_template_id", before.contact_reply_template_id)
    .select("*")
    .single();
  if (error) throw error;

  if (before.is_default === true) {
    const remaining = (await listContactReplyTemplates(serviceClient, organizationId))[0];
    if (remaining?.contact_reply_template_id) {
      await serviceClient.from("core_contact_reply_templates").update({ is_default: true, updated_at: new Date().toISOString() }).eq("contact_reply_template_id", remaining.contact_reply_template_id);
    }
  }

  await writeContactTrackerEvent(serviceClient, "reply_template_archived", null, organizationId, actorEmail, clean(body.note), safeContactReplyTemplate(before), safeContactReplyTemplate(data), { template_key: before.template_key });
  return safeContactReplyTemplate(data);
}

async function requireContactTrackerAccess(serviceClient: SupabaseClientAny, personId: string, organizationId: string, platformAdmin: boolean): Promise<JsonRecord> {
  if (platformAdmin) {
    const access = (await buildPlatformAccess(serviceClient, organizationId))[0];
    if (!access) throw new Error("Organization not found.");
    return access;
  }
  return await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["communications.manage", "organization.view_admin", "organization.manage_settings"]);
}

async function listContactInquiries(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord = {}): Promise<JsonRecord> {
  const statusFilterRaw = normalizeKey(body.status_filter || body.filter || "open").replace(/-/g, "_");
  const statusFilter = statusFilterRaw === "closed" ? "resolved" : statusFilterRaw;
  const includeSpam = optionalBoolean(body, "include_spam", false);
  const search = clean(body.search).toLowerCase();
  const limit = Math.min(Math.max(Number(body.limit || 250), 1), 500);

  let query = serviceClient
    .from("core_contact_inquiries")
    .select("*")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (["open", "resolved", "spam_suspected", "archived"].includes(statusFilter)) query = query.eq("status", statusFilter);
  if (!includeSpam && statusFilter !== "spam_suspected") query = query.neq("status", "spam_suspected");

  const { data, error } = await query;
  if (error) throw error;
  let inquiries = ((data || []) as JsonRecord[]).map(safeContactInquiry);
  if (search) {
    inquiries = inquiries.filter((item) => [item.name, item.email, item.phone, item.subject, item.reason_key, item.message, item.internal_notes].map((v) => clean(v).toLowerCase()).join(" ").includes(search));
  }

  const { data: countRows, error: countError } = await serviceClient
    .from("core_contact_inquiries")
    .select("status, contact_inquiry_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .limit(10000);
  if (countError) throw countError;
  const summary = { open: 0, resolved: 0, spam_suspected: 0, total: 0 } as JsonRecord;
  for (const row of ((countRows || []) as JsonRecord[])) {
    const status = validContactStatus(row.status, "open");
    summary.total = Number(summary.total || 0) + 1;
    summary[status] = Number(summary[status] || 0) + 1;
  }

  return { inquiries, summary };
}

async function writeContactTrackerEvent(
  serviceClient: SupabaseClientAny,
  eventType: string,
  contactInquiryId: string | null,
  organizationId: string,
  actorEmail: string,
  note: string | null,
  beforeJson: JsonRecord | null = null,
  afterJson: JsonRecord | null = null,
  metadata: JsonRecord = {},
): Promise<void> {
  try {
    await serviceClient.from("core_contact_inquiry_events").insert({
      contact_inquiry_id: contactInquiryId,
      organization_id: organizationId,
      event_type: eventType,
      actor_email: actorEmail,
      actor_role: "organization_admin",
      note,
      before_json: beforeJson,
      after_json: afterJson,
      metadata_json: metadata,
    });
  } catch (error) {
    console.error("contact_tracker_event_write_failed", error);
  }
}

async function getContactInquiry(serviceClient: SupabaseClientAny, organizationId: string, contactInquiryId: string): Promise<JsonRecord> {
  const { data, error } = await serviceClient
    .from("core_contact_inquiries")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("contact_inquiry_id", contactInquiryId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data?.contact_inquiry_id) throw new Error("Contact inquiry was not found.");
  return data;
}

async function updateContactInquiry(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const contactInquiryId = requireString(body, "contact_inquiry_id");
  const before = await getContactInquiry(serviceClient, organizationId, contactInquiryId);
  const payload: JsonRecord = { updated_at: new Date().toISOString() };
  const eventParts: string[] = [];

  if (Object.prototype.hasOwnProperty.call(body, "internal_notes") || Object.prototype.hasOwnProperty.call(body, "board_notes")) {
    payload.internal_notes = clean(body.internal_notes ?? body.board_notes);
    eventParts.push("notes_updated");
  }

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = validContactStatus(body.status, clean(before.status || "open"));
    payload.status = status;
    if (status === "resolved") {
      payload.resolved_at = new Date().toISOString();
      payload.resolved_by_email = actorEmail;
      eventParts.push("resolved");
    } else if (status === "open") {
      payload.resolved_at = null;
      payload.resolved_by_email = null;
      eventParts.push("reopened");
    } else if (status === "spam_suspected") {
      eventParts.push("marked_spam_suspected");
    }
  }

  if (!Object.keys(payload).some((k) => k !== "updated_at")) throw new Error("No contact inquiry update fields were provided.");

  const { data, error } = await serviceClient
    .from("core_contact_inquiries")
    .update(payload)
    .eq("organization_id", organizationId)
    .eq("contact_inquiry_id", contactInquiryId)
    .select("*")
    .single();
  if (error) throw error;

  const eventType = eventParts.length ? eventParts.join("+") : "updated";
  await writeContactTrackerEvent(serviceClient, eventType, contactInquiryId, organizationId, actorEmail, clean(body.note), safeContactInquiry(before), safeContactInquiry(data));
  return safeContactInquiry(data);
}

async function bulkUpdateContactInquiries(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const ids = stringArray(body.contact_inquiry_ids || body.ids);
  if (!ids.length) throw new Error("Select at least one contact inquiry.");
  if (ids.length > 100) throw new Error("Bulk updates are capped at 100 contact inquiries at a time.");
  const status = validContactStatus(body.status, "resolved");
  const updated: JsonRecord[] = [];
  const failed: JsonRecord[] = [];
  for (const id of ids) {
    try {
      const item = await updateContactInquiry(serviceClient, organizationId, { contact_inquiry_id: id, status, note: clean(body.note) || "Bulk contact tracker update" }, actorEmail);
      updated.push(item);
    } catch (error) {
      failed.push({ contact_inquiry_id: id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { updated_count: updated.length, failed_count: failed.length, inquiries: updated, failed };
}

function htmlFromText(value: string): string {
  return String(value || "").trim().split(/\n{2,}/).map((part) => `<p>${part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`).join("\n");
}

function firstNameFromName(value: unknown): string {
  return clean(value).split(/\s+/).filter(Boolean)[0] || "there";
}

function replaceTemplateTokens(value: string, tokens: JsonRecord): string {
  return String(value || "").replace(/{{\s*([a-z0-9_:-]+)\s*}}/gi, (_match, rawKey) => clean(tokens[normalizeKey(rawKey).replace(/-/g, "_")] ?? ""));
}

function actorDisplayNameFromPerson(person: JsonRecord, fallbackEmail: string): string {
  const profile = jsonObject(person.profile_json);
  const nameProfile = jsonObject(profile.name);
  const preferred = clean(nameProfile.preferred_first_name || nameProfile.preferred_name);
  const first = clean(person.first_name);
  const last = clean(person.last_name);
  const suffix = clean(nameProfile.suffix);
  return clean(person.display_name) || clean([preferred || first, last, suffix].filter(Boolean).join(" ")) || clean(fallbackEmail) || "Organization Admin";
}

async function resolveActorDisplayNameForOrganization(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  actorPerson: JsonRecord,
  actorEmail: string,
): Promise<string> {
  const actorPersonId = clean(actorPerson.person_id);
  if (actorPersonId) {
    try {
      const person = await getOrganizationPerson(serviceClient, organizationId, { person_id: actorPersonId });
      const resolved = actorDisplayNameFromPerson(person, actorEmail);
      if (resolved && resolved !== normalizeEmail(actorEmail)) return resolved;
    } catch {
      // Fallback below. A platform admin may not have an organization membership row.
    }
  }
  return actorDisplayNameFromPerson(actorPerson, actorEmail);
}

async function sendContactReply(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string, actorPerson: JsonRecord): Promise<JsonRecord> {
  const contactInquiryId = requireString(body, "contact_inquiry_id");
  const inquiryRaw = await getContactInquiry(serviceClient, organizationId, contactInquiryId);
  const inquiry = safeContactInquiry(inquiryRaw);
  const toEmail = safeEmail(body.to || inquiry.email);
  if (!toEmail) throw new Error("The contact inquiry does not have a valid recipient email address.");

  const settings = await getContactSettings(serviceClient, organizationId);
  const templates = await listContactReplyTemplates(serviceClient, organizationId);
  const { data: org, error: orgError } = await serviceClient.from("core_organizations").select("display_name, organization_key").eq("organization_id", organizationId).maybeSingle();
  if (orgError) throw orgError;
  const organizationName = clean(org?.display_name || org?.organization_key || "Organization");
  const senderName = await resolveActorDisplayNameForOrganization(serviceClient, organizationId, actorPerson, actorEmail);
  const infoUrl = clean(body.info_url || jsonObject(settings.settings_json).info_url || "");

  const replyKind = normalizeKey(body.reply_kind || "custom");
  let subject = clean(body.subject);
  let bodyText = clean(body.body_text || body.message_body || body.message);
  let bodyHtml = sanitizeContactTemplateHtml(body.body_html || "");
  let template: JsonRecord | undefined;

  if (replyKind === "prefab" || !bodyText) {
    const templateKey = normalizeKey(body.template_key || "application-info");
    template = templates.find((t) => normalizeKey(t.template_key) === templateKey) || templates.find((t) => t.is_default === true) || templates[0];
    if (!template) throw new Error("No active contact reply template is configured for this organization.");
    subject = clean(subject || template.subject);
    bodyText = clean(template.body_text || plainTextFromHtml(template.body_html));
    bodyHtml = sanitizeContactTemplateHtml(template.body_html || htmlFromText(bodyText));
  } else if (!bodyHtml && bodyText) {
    bodyHtml = htmlFromText(bodyText);
  }

  const tokens = {
    name: clean(inquiry.name || "there"),
    first_name: firstNameFromName(inquiry.name),
    contact_name: inquiry.name,
    organization_name: organizationName,
    sender_name: senderName,
    sender_email: actorEmail,
    info_url: infoUrl,
  };
  subject = replaceTemplateTokens(subject || `Information from ${organizationName}`, tokens);
  bodyText = replaceTemplateTokens(bodyText, tokens);
  bodyHtml = replaceTemplateTokens(bodyHtml || htmlFromText(bodyText), tokens);
  if (!bodyText && bodyHtml) bodyText = plainTextFromHtml(bodyHtml);
  if (!bodyText) throw new Error("Enter an email message before sending.");

  const apiKey = clean(Deno.env.get("RESEND_API_KEY"));
  if (!apiKey) throw new Error("Outbound email is not configured. Missing RESEND_API_KEY for this Edge Function.");
  const fromEmail = clean(Deno.env.get("SYNCETC_CONTACT_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL") || "no-reply@syncetc.com");
  const fromDisplay = clean(settings.from_display_name || `${organizationName} via SyncEtc`).replace(/[<>]/g, "");
  const replyTo = safeEmail(body.reply_to || settings.reply_to_email || actorEmail);
  const ccSelf = optionalBoolean(body, "cc_self", false);
  const emailPayload: JsonRecord = {
    from: `${fromDisplay} <${fromEmail}>`,
    to: [toEmail],
    subject,
    text: bodyText,
    html: sanitizeContactTemplateHtml(bodyHtml || htmlFromText(bodyText)),
  };
  if (replyTo) emailPayload.reply_to = replyTo;
  if (ccSelf && actorEmail) emailPayload.cc = [actorEmail];

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(emailPayload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(clean((result as JsonRecord).message || (result as JsonRecord).error) || `Resend email failed with HTTP ${response.status}`);
  }

  const { error: updateError } = await serviceClient
    .from("core_contact_inquiries")
    .update({ last_reply_at: new Date().toISOString(), last_reply_by_email: actorEmail, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("contact_inquiry_id", contactInquiryId);
  if (updateError) throw updateError;

  await writeContactTrackerEvent(serviceClient, replyKind === "prefab" ? "prefab_email_sent" : "custom_email_sent", contactInquiryId, organizationId, actorEmail, clean(body.note), inquiry, null, { resend_id: (result as JsonRecord).id || null, to: toEmail, subject, cc_self: ccSelf, template_key: template?.template_key || null });
  return { sent: true, resend_id: (result as JsonRecord).id || null, to: toEmail, subject, reply_to: replyTo || null, cc_self: ccSelf };
}


// =======================
// Applicant Intake / Tracker 0097
// =======================

const APPLICANT_STATUS_ALIASES: Record<string, string> = {
  reviewing: "waitlist",
  info_requested: "waitlist",
  interview_orientation: "invited_to_interview",
  board_review: "invited_to_interview",
  accepted: "onboarding",
  converted_to_member: "added_as_member",
  declined: "archived",
};
const APPLICANT_STATUS_KEYS = new Set(["new", "waitlist", "invited_to_interview", "onboarding", "ready_for_final_review", "added_as_member", "archived"]);

function normalizeApplicantStatus(value: unknown, fallback = "new"): string {
  const raw = normalizeKey(value || fallback).replace(/-/g, "_");
  const mapped = APPLICANT_STATUS_ALIASES[raw] || raw;
  const fb = APPLICANT_STATUS_ALIASES[normalizeKey(fallback).replace(/-/g, "_")] || fallback;
  return APPLICANT_STATUS_KEYS.has(mapped) ? mapped : (APPLICANT_STATUS_KEYS.has(fb) ? fb : "new");
}

function applicantStatusLabel(status: unknown): string {
  const s = normalizeApplicantStatus(status, "new");
  const labels: Record<string, string> = {
    new: "New",
    waitlist: "Waitlist",
    invited_to_interview: "Invited to Interview",
    onboarding: "Onboarding",
    ready_for_final_review: "Ready for Final Review",
    added_as_member: "Added as Member",
    archived: "Archived",
  };
  return labels[s] || s;
}

function safeApplicant(row: JsonRecord): JsonRecord {
  const status = normalizeApplicantStatus(row.applicant_status || row.status, "new");
  return {
    application_id: row.application_id || null,
    id: row.application_id || null,
    organization_id: row.organization_id || null,
    site_id: row.site_id || null,
    customer_page_id: row.customer_page_id || null,
    person_id: row.person_id || null,
    source_page_key: clean(row.source_page_key),
    source_url: clean(row.source_url),
    applicant_status: status,
    status,
    status_label: applicantStatusLabel(status),
    stage_key: clean(row.stage_key || status),
    first_name: clean(row.first_name),
    last_name: clean(row.last_name),
    display_name: clean(row.display_name || `${clean(row.first_name)} ${clean(row.last_name)}`),
    email: safeEmail(row.email || row.primary_email),
    phone: clean(row.phone || row.primary_phone),
    date_of_birth: row.date_of_birth || null,
    address_json: jsonObject(row.address_json),
    background_json: jsonObject(row.background_json || row.employment_json),
    aviation_json: jsonObject(row.aviation_json),
    safety_json: jsonObject(row.safety_json),
    interest_json: jsonObject(row.interest_json),
    custom_answers_json: jsonObject(row.custom_answers_json),
    internal_notes: clean(row.internal_notes),
    metadata_json: jsonObject(row.metadata_json),
    spam_score: Number(row.spam_score || 0),
    spam_reason: clean(row.spam_reason),
    last_reply_at: row.last_reply_at || null,
    last_reply_by_email: row.last_reply_by_email || null,
    submitted_at: row.submitted_at || row.created_at || null,
    archived_at: row.archived_at || null,
    created_at: row.created_at || null,
    waitlist_order: row.waitlist_order || null,
    invited_at: row.invited_at || null,
    ready_for_final_review: row.ready_for_final_review === true,
    ready_for_final_review_at: row.ready_for_final_review_at || null,
    last_activity_at: row.last_activity_at || row.updated_at || row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function safeApplicantTask(row: JsonRecord): JsonRecord {
  return {
    applicant_task_id: row.applicant_task_id || null,
    application_id: row.application_id || null,
    task_definition_id: row.task_definition_id || null,
    task_key: clean(row.task_key),
    stage_key: clean(row.stage_key || "onboarding"),
    label: clean(row.label),
    description: clean(row.description),
    responsible_party: normalizeKey(row.responsible_party || "admin"),
    task_type: normalizeKey(row.task_type || "manual"),
    is_required: row.is_required !== false,
    status: (normalizeKey(row.status || "pending") === "not_started" ? "pending" : normalizeKey(row.status || "pending")),
    upload_status: normalizeKey(row.upload_status || ""),
    review_status: normalizeKey(row.review_status || ""),
    upload_required: row.upload_required === true,
    applicant_visible: row.applicant_visible !== false,
    completed_at: row.completed_at || null,
    completed_by_email: clean(row.completed_by_email),
    reviewed_at: row.reviewed_at || null,
    reviewed_by_email: clean(row.reviewed_by_email),
    note: clean(row.note || row.notes),
    sort_order: Number(row.sort_order || 100),
    settings_json: jsonObject(row.settings_json),
  };
}

function safeApplicantReplyTemplate(row: JsonRecord): JsonRecord {
  return {
    applicant_reply_template_id: row.applicant_reply_template_id || null,
    template_key: clean(row.template_key),
    template_name: clean(row.template_name),
    subject: clean(row.subject),
    body_text: clean(row.body_text || plainTextFromHtml(row.body_html)),
    body_html: sanitizeContactTemplateHtml(row.body_html || htmlFromText(clean(row.body_text))),
    is_default: row.is_default === true,
    status: clean(row.status || "active"),
    sort_order: Number(row.sort_order || 100),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function requireApplicantTrackerAccess(serviceClient: SupabaseClientAny, personId: string, organizationId: string, platformAdmin: boolean): Promise<JsonRecord> {
  if (platformAdmin) {
    const access = (await buildPlatformAccess(serviceClient, organizationId))[0];
    if (!access) throw new Error("Organization not found.");
    return access;
  }
  return await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.manage_applicants", "access.manage_memberships", "organization.view_admin", "organization.manage_settings"]);
}

async function writeApplicantEvent(serviceClient: SupabaseClientAny, eventType: string, applicationId: string | null, organizationId: string, actorEmail: string, note: string | null = null, beforeJson: JsonRecord | null = null, afterJson: JsonRecord | null = null, metadata: JsonRecord = {}): Promise<void> {
  try {
    await serviceClient.from("core_applicant_events").insert({ application_id: applicationId, organization_id: organizationId, event_type: eventType, actor_email: actorEmail || null, note, before_json: beforeJson, after_json: afterJson, metadata_json: metadata });
  } catch (error) {
    console.warn("applicant_event_write_failed", error instanceof Error ? error.message : String(error));
  }
}

async function getApplicantSettings(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord> {
  const { data, error } = await serviceClient.from("core_applicant_settings").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error && !String(error.message || "").includes("does not exist")) throw error;
  if (data) return data;
  const { data: org } = await serviceClient.from("core_organizations").select("display_name, organization_key").eq("organization_id", organizationId).maybeSingle();
  const fromDisplay = `${clean(org?.display_name || org?.organization_key || "Organization")} via SyncEtc`;
  const { data: inserted, error: insertError } = await serviceClient.from("core_applicant_settings").insert({ organization_id: organizationId, from_display_name: fromDisplay, settings_json: { seeded_by: "core-access-action" } }).select("*").single();
  if (insertError) throw insertError;
  return inserted;
}

async function listApplicantReplyTemplates(serviceClient: SupabaseClientAny, organizationId: string, includeArchived = false): Promise<JsonRecord[]> {
  let query = serviceClient.from("core_applicant_reply_templates").select("*").eq("organization_id", organizationId).order("is_default", { ascending: false }).order("sort_order", { ascending: true }).order("template_name", { ascending: true });
  if (!includeArchived) query = query.eq("status", "active").is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(safeApplicantReplyTemplate);
}

async function listApplicantTaskDefinitions(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient.from("core_applicant_task_definitions").select("*").eq("organization_id", organizationId).eq("status", "active").is("archived_at", null).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function ensureApplicantTaskItems(serviceClient: SupabaseClientAny, organizationId: string, applicationId: string): Promise<void> {
  const defs = await listApplicantTaskDefinitions(serviceClient, organizationId);
  if (!defs.length) return;
  const rows = defs.map((task: JsonRecord) => ({
    application_id: applicationId,
    organization_id: organizationId,
    task_definition_id: task.task_definition_id || task.applicant_task_definition_id || null,
    task_key: clean(task.task_key),
    label: clean(task.label),
    description: clean(task.description),
    responsible_party: normalizeKey(task.responsible_party || task.completion_actor || "admin"),
    task_type: normalizeKey(task.task_type || "manual"),
    is_required: task.is_required !== false && task.required_for_next_stage !== false,
    sort_order: Number(task.sort_order || 100),
    settings_json: jsonObject(task.settings_json),
  })).filter((row) => row.task_key && row.label);
  if (rows.length) await serviceClient.from("core_applicant_tasks").upsert(rows, { onConflict: "application_id,task_key" });
}

async function listApplicantTasks(serviceClient: SupabaseClientAny, applicationIds: string[]): Promise<Map<string, JsonRecord[]>> {
  const ids = Array.from(new Set(applicationIds.map(clean).filter(Boolean)));
  const out = new Map<string, JsonRecord[]>();
  if (!ids.length) return out;
  const { data, error } = await serviceClient.from("core_applicant_tasks").select("*").in("application_id", ids).order("sort_order", { ascending: true });
  if (error) throw error;
  for (const row of ((data || []) as JsonRecord[])) {
    const appId = clean(row.application_id);
    const list = out.get(appId) || [];
    list.push(safeApplicantTask(row));
    out.set(appId, list);
  }
  return out;
}

async function listApplicantEvents(serviceClient: SupabaseClientAny, applicationIds: string[]): Promise<Map<string, JsonRecord[]>> {
  const ids = Array.from(new Set(applicationIds.map(clean).filter(Boolean)));
  const out = new Map<string, JsonRecord[]>();
  if (!ids.length) return out;
  const { data, error } = await serviceClient.from("core_applicant_events").select("*").in("application_id", ids).order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  for (const row of ((data || []) as JsonRecord[])) {
    const appId = clean(row.application_id);
    const list = out.get(appId) || [];
    list.push({ applicant_event_id: row.applicant_event_id, event_type: clean(row.event_type), actor_email: clean(row.actor_email), note: clean(row.note || row.notes), created_at: row.created_at, metadata_json: jsonObject(row.metadata_json) });
    out.set(appId, list);
  }
  return out;
}

async function listApplicantApplications(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord = {}): Promise<JsonRecord> {
  const statusFilter = normalizeApplicantStatus(body.status_filter || body.filter || "new", "new");
  const rawFilter = normalizeKey(body.status_filter || body.filter || "new").replace(/-/g, "_");
  const includeArchived = optionalBoolean(body, "include_archived", false);
  const search = clean(body.search).toLowerCase();
  const limit = Math.min(Math.max(Number(body.limit || 250), 1), 500);
  let query = serviceClient.from("core_applications").select("*").eq("organization_id", organizationId).order("submitted_at", { ascending: false }).limit(limit);
  if (rawFilter && rawFilter !== "all") query = query.eq("applicant_status", statusFilter);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  let apps = (data || []).map(safeApplicant);
  if (search) apps = apps.filter((app) => [app.display_name, app.email, app.phone, app.status_label, app.internal_notes, jsonObject(app.aviation_json).pilot_certificate_number, jsonObject(app.interest_json).why_join].map((v) => clean(v).toLowerCase()).join(" ").includes(search));
  const ids = apps.map((app) => clean(app.application_id)).filter(Boolean);
  const [tasksMap, eventsMap, uploadsMap, timelineMap] = await Promise.all([listApplicantTasks(serviceClient, ids), listApplicantEvents(serviceClient, ids), listApplicantUploadsMap0098(serviceClient, ids), listApplicantTimelineNotes0099(serviceClient, organizationId, ids)]);
  apps = apps.map((app) => {
    const currentStage = normalizeApplicantStatus(app.stage_key || app.applicant_status || app.status, "new");
    const tasksAll = enrichApplicantTasksWithUploads0098(tasksMap.get(clean(app.application_id)) || [], uploadsMap);
    const current_stage_tasks = tasksAll.filter((task: JsonRecord) => clean(task.stage_key || currentStage) === currentStage);
    const timeline_notes = timelineMap.get(clean(app.application_id)) || [];
    const enriched = { ...app, stage_key: currentStage, tasks: tasksAll, current_stage_tasks, events: eventsMap.get(clean(app.application_id)) || [], timeline_notes };
    enriched.ready_for_final_review = applicantReadyForFinalReview0098({ ...enriched, tasks: current_stage_tasks.length ? current_stage_tasks : tasksAll });
    enriched.needs_attention = Boolean(app.ready_for_final_review || app.ready_for_final_review_at || current_stage_tasks.some((task: JsonRecord) => ["submitted", "request_changes", "rejected"].includes(normalizeKey(task.review_status || task.upload_status || ""))));
    return enriched;
  });
  const summary: Record<string, number> = { total: apps.length };
  for (const app of apps) summary[normalizeApplicantStatus(app.status)] = (summary[normalizeApplicantStatus(app.status)] || 0) + 1;
  return { applicants: apps, summary };
}

async function getApplicantApplication(serviceClient: SupabaseClientAny, organizationId: string, applicationId: string): Promise<JsonRecord> {
  const { data, error } = await serviceClient.from("core_applications").select("*").eq("organization_id", organizationId).eq("application_id", applicationId).maybeSingle();
  if (error) throw error;
  if (!data?.application_id) throw new Error("Applicant application was not found.");
  const stageKey = normalizeApplicantStatus(data.stage_key || data.applicant_status || data.status, "new");
  await ensureApplicantTaskItems(serviceClient, organizationId, applicationId);
  await ensureApplicantStageTasks0099(serviceClient, organizationId, applicationId, stageKey);
  const [tasksMap, eventsMap, uploadsMap, timelineMap] = await Promise.all([listApplicantTasks(serviceClient, [applicationId]), listApplicantEvents(serviceClient, [applicationId]), listApplicantUploadsMap0098(serviceClient, [applicationId]), listApplicantTimelineNotes0099(serviceClient, organizationId, [applicationId])]);
  const tasks = enrichApplicantTasksWithUploads0098(tasksMap.get(applicationId) || [], uploadsMap);
  const current_stage_tasks = tasks.filter((task: JsonRecord) => clean(task.stage_key || stageKey) === stageKey);
  const applicant = { ...safeApplicant(data), stage_key: stageKey, tasks, current_stage_tasks, events: eventsMap.get(applicationId) || [], timeline_notes: timelineMap.get(applicationId) || [] };
  applicant.ready_for_final_review = applicantReadyForFinalReview0098({ ...applicant, tasks: current_stage_tasks.length ? current_stage_tasks : tasks });
  return applicant;
}

async function updateApplicantApplication(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const applicationId = requireString(body, "application_id");
  const before = await getApplicantApplication(serviceClient, organizationId, applicationId);
  const payload: JsonRecord = { updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, "applicant_status") || Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = normalizeApplicantStatus(body.applicant_status || body.status, clean(before.status));
    payload.applicant_status = status;
    payload.status = status;
    payload.stage_key = status;
    if (status === "archived") payload.archived_at = new Date().toISOString();
    if (status !== "archived") payload.archived_at = null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "internal_notes")) payload.internal_notes = clean(body.internal_notes);
  if (Object.prototype.hasOwnProperty.call(body, "first_name")) payload.first_name = clean(body.first_name);
  if (Object.prototype.hasOwnProperty.call(body, "last_name")) payload.last_name = clean(body.last_name);
  if (Object.prototype.hasOwnProperty.call(body, "email")) { payload.email = safeEmail(body.email); payload.primary_email = payload.email; }
  if (Object.prototype.hasOwnProperty.call(body, "phone")) { payload.phone = clean(body.phone); payload.primary_phone = payload.phone; }
  if (Object.prototype.hasOwnProperty.call(body, "waitlist_order")) { const w = Number(clean(body.waitlist_order)); payload.waitlist_order = Number.isFinite(w) ? w : null; }
  if (payload.first_name || payload.last_name) payload.display_name = clean(`${clean(payload.first_name || before.first_name)} ${clean(payload.last_name || before.last_name)}`);
  if (!Object.keys(payload).some((k) => !["updated_at","last_activity_at"].includes(k))) throw new Error("No applicant update fields were provided.");
  const { data, error } = await serviceClient.from("core_applications").update(payload).eq("organization_id", organizationId).eq("application_id", applicationId).select("*").single();
  if (error) throw error;
  await writeApplicantEvent(serviceClient, "application_updated", applicationId, organizationId, actorEmail, clean(body.note), before, safeApplicant(data), { changed_fields: Object.keys(payload) });
  return await getApplicantApplication(serviceClient, organizationId, applicationId);
}

async function updateApplicantTask(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const taskItemId = requireString(body, "applicant_task_id");
  const status = normalizeKey(body.status || "pending");
  if (!["pending", "in_progress", "completed", "waived", "blocked"].includes(status)) throw new Error("Invalid applicant task status.");
  const { data: before, error: lookupError } = await serviceClient.from("core_applicant_tasks").select("*").eq("organization_id", organizationId).eq("applicant_task_id", taskItemId).maybeSingle();
  if (lookupError) throw lookupError;
  if (!before?.applicant_task_id) throw new Error("Applicant task was not found.");
  const payload: JsonRecord = { status, note: clean(body.note), updated_at: new Date().toISOString() };
  if (status === "completed") { payload.completed_at = new Date().toISOString(); payload.completed_by_email = actorEmail; payload.reviewed_at = new Date().toISOString(); payload.reviewed_by_email = actorEmail; }
  if (status !== "completed") { payload.completed_at = null; payload.completed_by_email = null; }
  const { data, error } = await serviceClient.from("core_applicant_tasks").update(payload).eq("applicant_task_id", taskItemId).eq("organization_id", organizationId).select("*").single();
  if (error) throw error;
  await writeApplicantEvent(serviceClient, "task_updated", clean(before.application_id), organizationId, actorEmail, clean(body.note), safeApplicantTask(before), safeApplicantTask(data), { task_key: before.task_key, status });
  return safeApplicantTask(data);
}

async function upsertApplicantReplyTemplate(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const templateId = clean(body.applicant_reply_template_id || body.template_id);
  const templateName = requireString(body, "template_name");
  const templateKey = normalizeKey(body.template_key || templateName);
  const subject = requireString(body, "subject");
  const bodyHtml = sanitizeContactTemplateHtml(body.body_html || htmlFromText(clean(body.body_text || body.message || "")));
  const bodyText = clean(body.body_text || plainTextFromHtml(bodyHtml));
  if (!bodyText) throw new Error("Template body is required.");
  const isDefault = optionalBoolean(body, "is_default", false);
  if (isDefault) await serviceClient.from("core_applicant_reply_templates").update({ is_default: false, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("status", "active");
  const payload = { organization_id: organizationId, template_key: templateKey, template_name: templateName, subject, body_text: bodyText, body_html: bodyHtml, is_default: isDefault, sort_order: Number(body.sort_order || 100), status: "active", archived_at: null, updated_at: new Date().toISOString() };
  let data: JsonRecord;
  if (templateId) {
    const result = await serviceClient.from("core_applicant_reply_templates").update(payload).eq("organization_id", organizationId).eq("applicant_reply_template_id", templateId).select("*").single();
    if (result.error) throw result.error;
    data = result.data;
  } else {
    const result = await serviceClient.from("core_applicant_reply_templates").upsert(payload, { onConflict: "organization_id,template_key" }).select("*").single();
    if (result.error) throw result.error;
    data = result.data;
  }
  await writeApplicantEvent(serviceClient, "reply_template_saved", null, organizationId, actorEmail, clean(body.note), null, safeApplicantReplyTemplate(data), { template_key: templateKey });
  return safeApplicantReplyTemplate(data);
}

async function archiveApplicantReplyTemplate(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const templateId = requireString(body, "applicant_reply_template_id");
  const active = await listApplicantReplyTemplates(serviceClient, organizationId, false);
  if (active.length <= 1) throw new Error("At least one active applicant reply template is required.");
  const { data: before, error: lookupError } = await serviceClient.from("core_applicant_reply_templates").select("*").eq("organization_id", organizationId).eq("applicant_reply_template_id", templateId).maybeSingle();
  if (lookupError) throw lookupError;
  if (!before?.applicant_reply_template_id) throw new Error("Applicant reply template was not found.");
  const { data, error } = await serviceClient.from("core_applicant_reply_templates").update({ status: "archived", archived_at: new Date().toISOString(), is_default: false, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("applicant_reply_template_id", templateId).select("*").single();
  if (error) throw error;
  if (before.is_default === true) {
    const remaining = (await listApplicantReplyTemplates(serviceClient, organizationId))[0];
    if (remaining?.applicant_reply_template_id) await serviceClient.from("core_applicant_reply_templates").update({ is_default: true, updated_at: new Date().toISOString() }).eq("applicant_reply_template_id", remaining.applicant_reply_template_id);
  }
  await writeApplicantEvent(serviceClient, "reply_template_archived", null, organizationId, actorEmail, clean(body.note), safeApplicantReplyTemplate(before), safeApplicantReplyTemplate(data), { template_key: before.template_key });
  return safeApplicantReplyTemplate(data);
}

async function sendApplicantReply(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string, actorPerson: JsonRecord): Promise<JsonRecord> {
  const applicationId = requireString(body, "application_id");
  const applicant = await getApplicantApplication(serviceClient, organizationId, applicationId);
  const toEmail = safeEmail(body.to || applicant.email);
  if (!toEmail) throw new Error("The applicant does not have a valid recipient email address.");
  const settings = await getApplicantSettings(serviceClient, organizationId);
  const templates = await listApplicantReplyTemplates(serviceClient, organizationId);
  const { data: org, error: orgError } = await serviceClient.from("core_organizations").select("display_name, organization_key").eq("organization_id", organizationId).maybeSingle();
  if (orgError) throw orgError;
  const organizationName = clean(org?.display_name || org?.organization_key || "Organization");
  const senderName = await resolveActorDisplayNameForOrganization(serviceClient, organizationId, actorPerson, actorEmail);
  const replyKind = normalizeKey(body.reply_kind || "custom");
  let subject = clean(body.subject);
  let bodyText = clean(body.body_text || body.message_body || body.message);
  let bodyHtml = sanitizeContactTemplateHtml(body.body_html || "");
  let template: JsonRecord | undefined;
  if (replyKind === "prefab" || !bodyText) {
    const templateKey = normalizeKey(body.template_key || "request-info");
    template = templates.find((t) => normalizeKey(t.template_key) === templateKey) || templates.find((t) => t.is_default === true) || templates[0];
    if (!template) throw new Error("No active applicant reply template is configured for this organization.");
    subject = clean(subject || template.subject);
    bodyText = clean(template.body_text || plainTextFromHtml(template.body_html));
    bodyHtml = sanitizeContactTemplateHtml(template.body_html || htmlFromText(bodyText));
  } else if (!bodyHtml && bodyText) {
    bodyHtml = htmlFromText(bodyText);
  }
  const tokens = {
    name: clean(applicant.display_name || `${applicant.first_name} ${applicant.last_name}`) || "there",
    first_name: clean(applicant.first_name) || firstNameFromName(applicant.display_name),
    applicant_name: clean(applicant.display_name),
    organization_name: organizationName,
    sender_name: senderName,
    sender_email: actorEmail,
  };
  subject = replaceTemplateTokens(subject || `Information from ${organizationName}`, tokens);
  bodyText = replaceTemplateTokens(bodyText, tokens);
  bodyHtml = replaceTemplateTokens(bodyHtml || htmlFromText(bodyText), tokens);
  if (!bodyText && bodyHtml) bodyText = plainTextFromHtml(bodyHtml);
  if (!bodyText) throw new Error("Enter an email message before sending.");
  const apiKey = clean(Deno.env.get("RESEND_API_KEY"));
  if (!apiKey) throw new Error("Outbound email is not configured. Missing RESEND_API_KEY for this Edge Function.");
  const fromEmail = clean(Deno.env.get("SYNCETC_CONTACT_FROM_EMAIL") || Deno.env.get("RESEND_FROM_EMAIL") || "no-reply@syncetc.com");
  const fromDisplay = clean(settings.from_display_name || `${organizationName} via SyncEtc`).replace(/[<>]/g, "");
  const replyTo = safeEmail(body.reply_to || settings.reply_to_email || actorEmail);
  const ccSelf = optionalBoolean(body, "cc_self", false);
  const emailPayload: JsonRecord = { from: `${fromDisplay} <${fromEmail}>`, to: [toEmail], subject, text: bodyText, html: sanitizeContactTemplateHtml(bodyHtml || htmlFromText(bodyText)) };
  if (replyTo) emailPayload.reply_to = replyTo;
  if (ccSelf && actorEmail) emailPayload.cc = [actorEmail];
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(emailPayload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(clean((result as JsonRecord).message || (result as JsonRecord).error) || `Resend email failed with HTTP ${response.status}`);
  const { error: updateError } = await serviceClient.from("core_applications").update({ last_reply_at: new Date().toISOString(), last_reply_by_email: actorEmail, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("application_id", applicationId);
  if (updateError) throw updateError;
  const emailMeta = { resend_id: (result as JsonRecord).id || null, to: toEmail, subject, cc_self: ccSelf, template_key: template?.template_key || null };
  await writeApplicantEvent(serviceClient, replyKind === "prefab" ? "prefab_email_sent" : "custom_email_sent", applicationId, organizationId, actorEmail, clean(body.note), applicant, null, emailMeta);
  try {
    await serviceClient.from("core_person_timeline_notes").insert({ organization_id: organizationId, application_id: applicationId, person_id: applicant.person_id || null, note_type: "email", source: "system", title: replyKind === "prefab" ? "Prefab email sent" : "Custom email sent", body: `Email sent to ${toEmail}: ${subject}`, actor_email: actorEmail, actor_name: clean(actorPerson?.display_name || actorPerson?.first_name || actorEmail), metadata_json: emailMeta });
  } catch (timelineError) { console.warn("applicant_email_timeline_failed", timelineError instanceof Error ? timelineError.message : String(timelineError)); }
  return { sent: true, resend_id: (result as JsonRecord).id || null, to: toEmail, subject, reply_to: replyTo || null, cc_self: ccSelf };
}



// =======================
// Applicant Workflow / Timeline 0099
// =======================

function safeApplicantWorkflowStage0099(row: JsonRecord): JsonRecord {
  return {
    applicant_workflow_stage_id: row.applicant_workflow_stage_id || null,
    stage_key: clean(row.stage_key),
    label: clean(row.label),
    description: clean(row.description),
    category: clean(row.category || "active"),
    portal_access_allowed: row.portal_access_allowed === true,
    applicant_update_allowed: row.applicant_update_allowed === true,
    show_waitlist_position_default: row.show_waitlist_position_default === true,
    sort_order: Number(row.sort_order || 100),
    status: clean(row.status || "active"),
    settings_json: jsonObject(row.settings_json),
  };
}

function safeApplicantTaskDefinition0099(row: JsonRecord): JsonRecord {
  return {
    applicant_task_definition_id: row.applicant_task_definition_id || row.task_definition_id || null,
    task_definition_id: row.task_definition_id || row.applicant_task_definition_id || null,
    stage_key: clean(row.stage_key || "onboarding"),
    task_key: clean(row.task_key),
    label: clean(row.label),
    description: clean(row.description),
    responsible_party: clean(row.responsible_party || row.completion_actor || "admin"),
    task_type: clean(row.task_type || "manual"),
    is_required: row.is_required !== false && row.required_for_next_stage !== false,
    sort_order: Number(row.sort_order || 100),
    status: clean(row.status || "active"),
    settings_json: jsonObject(row.settings_json),
  };
}

function safePersonTimelineNote0099(row: JsonRecord): JsonRecord {
  return {
    person_timeline_note_id: row.person_timeline_note_id || null,
    application_id: row.application_id || null,
    person_id: row.person_id || null,
    organization_id: row.organization_id || null,
    note_type: clean(row.note_type || "general"),
    source: clean(row.source || "manual"),
    title: clean(row.title),
    body: clean(row.body || row.note),
    actor_email: clean(row.actor_email),
    actor_name: clean(row.actor_name),
    visibility: clean(row.visibility || "admin"),
    metadata_json: jsonObject(row.metadata_json),
    created_at: row.created_at || null,
  };
}

async function listApplicantWorkflowStages0099(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_applicant_workflow_stages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []).map(safeApplicantWorkflowStage0099);
}

async function listApplicantTaskDefinitions0099(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_applicant_task_definitions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("archived_at", null)
    .order("stage_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []).map(safeApplicantTaskDefinition0099);
}

async function ensureApplicantStageTasks0099(serviceClient: SupabaseClientAny, organizationId: string, applicationId: string, stageKey: string): Promise<void> {
  const defs = (await listApplicantTaskDefinitions0099(serviceClient, organizationId)).filter((d) => clean(d.stage_key) === clean(stageKey));
  if (!defs.length) return;
  const rows = defs.map((task: JsonRecord) => ({
    application_id: applicationId,
    organization_id: organizationId,
    task_definition_id: task.task_definition_id || task.applicant_task_definition_id || null,
    stage_key: clean(task.stage_key),
    task_key: clean(task.task_key),
    label: clean(task.label),
    description: clean(task.description),
    responsible_party: clean(task.responsible_party || "admin"),
    task_type: clean(task.task_type || "manual"),
    is_required: task.is_required !== false,
    sort_order: Number(task.sort_order || 100),
    applicant_visible: true,
    settings_json: jsonObject(task.settings_json),
  })).filter((row) => row.task_key && row.label);
  if (rows.length) await serviceClient.from("core_applicant_tasks").upsert(rows, { onConflict: "application_id,task_key" });
}

async function listApplicantTimelineNotes0099(serviceClient: SupabaseClientAny, organizationId: string, applicationIds: string[]): Promise<Map<string, JsonRecord[]>> {
  const ids = Array.from(new Set(applicationIds.map(clean).filter(Boolean)));
  const out = new Map<string, JsonRecord[]>();
  if (!ids.length) return out;
  const { data, error } = await serviceClient
    .from("core_person_timeline_notes")
    .select("*")
    .eq("organization_id", organizationId)
    .in("application_id", ids)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  for (const row of data || []) {
    const appId = clean(row.application_id);
    const list = out.get(appId) || [];
    list.push(safePersonTimelineNote0099(row));
    out.set(appId, list);
  }
  return out;
}

async function listPersonTimelineNotes0099(serviceClient: SupabaseClientAny, organizationId: string, personId: string): Promise<JsonRecord[]> {
  if (!personId) return [];
  const { data, error } = await serviceClient
    .from("core_person_timeline_notes")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("person_id", personId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map(safePersonTimelineNote0099);
}

async function addApplicantTimelineNote0099(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string, actorPerson: JsonRecord): Promise<JsonRecord> {
  const applicationId = requireString(body, "application_id");
  const noteBody = requireString(body, "body");
  const applicant = await getApplicantApplication(serviceClient, organizationId, applicationId);
  const actorName = clean(actorPerson?.display_name || actorPerson?.first_name || actorEmail);
  const payload = {
    organization_id: organizationId,
    application_id: applicationId,
    person_id: applicant.person_id || null,
    note_type: normalizeKey(body.note_type || "general"),
    source: "manual",
    title: clean(body.title || "Applicant note"),
    body: noteBody,
    actor_email: actorEmail || null,
    actor_name: actorName || actorEmail || null,
    visibility: "admin",
    metadata_json: jsonObject(body.metadata_json),
  };
  const { data, error } = await serviceClient.from("core_person_timeline_notes").insert(payload).select("*").single();
  if (error) throw error;
  await writeApplicantEvent(serviceClient, "note_added", applicationId, organizationId, actorEmail, noteBody, null, data, { note_type: payload.note_type });
  await serviceClient.from("core_applications").update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("application_id", applicationId).eq("organization_id", organizationId);
  return safePersonTimelineNote0099(data);
}

async function addPersonTimelineNote0099(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string, actorPerson: JsonRecord): Promise<JsonRecord> {
  const personId = requireString(body, "person_id");
  const noteBody = requireString(body, "body");
  const actorName = clean(actorPerson?.display_name || actorPerson?.first_name || actorEmail);
  const payload = {
    organization_id: organizationId,
    person_id: personId,
    application_id: clean(body.application_id) || null,
    note_type: normalizeKey(body.note_type || "general"),
    source: "manual",
    title: clean(body.title || "Person note"),
    body: noteBody,
    actor_email: actorEmail || null,
    actor_name: actorName || actorEmail || null,
    visibility: "admin",
    metadata_json: jsonObject(body.metadata_json),
  };
  const { data, error } = await serviceClient.from("core_person_timeline_notes").insert(payload).select("*").single();
  if (error) throw error;
  return safePersonTimelineNote0099(data);
}


// =======================
// Calendar / RSVP People Integration 0088
// =======================

function normalizeEventVisibilityRule(value: unknown): string {
  const raw = normalizeKey(value || "public").replace(/-/g, "_");
  if (["public", "logged_in", "loggedin", "member", "members", "user", "users", "admin", "admins", "board", "internal"].includes(raw)) {
    if (raw === "loggedin") return "logged_in";
    if (["members", "user", "users"].includes(raw)) return "member";
    if (["admins", "board", "internal"].includes(raw)) return "admin";
    return raw;
  }
  return "public";
}
function normalizeEventRsvpAudience(value: unknown, fallback = "member"): string {
  const raw = normalizeKey(value || fallback).replace(/-/g, "_");
  if (["public", "logged_in", "loggedin", "member", "members", "user", "users", "admin", "admins", "selected_classes", "classes", "selected_roles", "roles"].includes(raw)) {
    if (raw === "loggedin") return "logged_in";
    if (["members", "user", "users"].includes(raw)) return "member";
    if (raw === "admins") return "admin";
    if (raw === "classes") return "selected_classes";
    if (raw === "roles") return "selected_roles";
    return raw;
  }
  return fallback;
}
function normalizeEventRsvpStatus(value: unknown): string {
  const raw = normalizeKey(value || "yes").replace(/-/g, "_");
  return ["yes", "maybe", "no", "waitlist", "cancelled", "no_response"].includes(raw) ? raw : "yes";
}
function keysFromJsonArray(value: unknown): string[] { return Array.isArray(value) ? Array.from(new Set(value.map((v) => normalizeKey(v)).filter(Boolean))) : []; }
function eventDeadlinePassed(event: JsonRecord): boolean { const raw = clean(event.rsvp_deadline_at); if (!raw) return false; const d = new Date(raw); return !Number.isNaN(d.getTime()) && d.getTime() < Date.now(); }
function eventRequestedAttendeeCount(status: string, attendingSelf: boolean, adultCount: number, childCount: number): number { if (!["yes", "waitlist"].includes(status)) return 0; const self = attendingSelf ? 1 : 0; return Math.max(self, self + Math.max(0, adultCount) + Math.max(0, childCount)); }
function actorIsOrganizationAdminForEvent(accessRow: JsonRecord): boolean { const caps = jsonObject(accessRow.capabilities); const perms = permissionSet(accessRow); return Boolean(caps.can_view_organization_admin) || perms.has("events.manage") || perms.has("organization.view_admin") || perms.has("organization.manage_settings") || perms.has("organization.super_admin"); }
function accessRowCanSeeEvent(event: JsonRecord, accessRow: JsonRecord, platformAdmin: boolean): boolean { if (platformAdmin) return true; const visibility = normalizeEventVisibilityRule(event.visibility_audience || event.visibility || "public"); if (visibility === "public") return true; if (!accessRow || accessRow.blocks_access) return false; if (visibility === "logged_in") return true; if (visibility === "member") return Boolean((jsonObject(accessRow.capabilities)).can_view_user_dashboard) || Boolean(accessRow.is_member) || actorIsOrganizationAdminForEvent(accessRow); if (visibility === "admin") return actorIsOrganizationAdminForEvent(accessRow); return false; }
function accessRowCanRsvpToEvent(event: JsonRecord, accessRow: JsonRecord, platformAdmin: boolean): boolean { if (!event.rsvp_enabled) return false; if (platformAdmin) return true; if (!accessRow || accessRow.blocks_access) return false; const audience = normalizeEventRsvpAudience(event.rsvp_audience || (event.rsvp_public_enabled ? "public" : "member"), "member"); if (audience === "public" || audience === "logged_in") return true; if (audience === "member") return Boolean((jsonObject(accessRow.capabilities)).can_rsvp_when_event_allows) || Boolean((jsonObject(accessRow.capabilities)).can_view_user_dashboard) || actorIsOrganizationAdminForEvent(accessRow); if (audience === "admin") return actorIsOrganizationAdminForEvent(accessRow); if (audience === "selected_classes") { const allowed = keysFromJsonArray(event.allowed_membership_class_keys); return allowed.length === 0 || allowed.includes(normalizeKey(accessRow.membership_class_key)) || actorIsOrganizationAdminForEvent(accessRow); } if (audience === "selected_roles") { const allowed = keysFromJsonArray(event.allowed_role_keys); const roles = stringArray(accessRow.role_keys).map(normalizeKey); return allowed.length === 0 || allowed.some((key) => roles.includes(key)) || actorIsOrganizationAdminForEvent(accessRow); } return false; }
function safeEventForPortal(event: JsonRecord, counts: JsonRecord = {}): JsonRecord {
  return {
    event_id:event.event_id,
    organization_id:event.organization_id,
    site_id:event.site_id||null,
    customer_page_id:event.customer_page_id||null,
    event_key:clean(event.event_key),
    title:clean(event.title),
    category:clean(event.category||event.event_type_label||"General"),
    event_type_key:clean(event.event_type_key),
    event_type_label:clean(event.event_type_label || event.category || "General"),
    event_accent_color:clean(event.event_accent_color),
    event_image_url:clean(event.event_image_url || event.image_url),
    event_image_path:clean(event.event_image_path),
    event_image_asset_json:jsonObject(event.event_image_asset_json),
    event_type_json:jsonObject(event.event_type_json),
    location_key:clean(event.location_key),
    location_json:jsonObject(event.location_json),
    map_query:clean(event.map_query),
    map_embed_url:clean(event.map_embed_url),
    location_mode:clean(event.location_mode || jsonObject(event.location_json).location_mode || "in_person"),
    online_platform:clean(event.online_platform || jsonObject(event.location_json).online_platform),
    online_join_url:clean(event.online_join_url),
    online_join_url_visibility:clean(event.online_join_url_visibility || "logged_in"),
    visibility:clean(event.visibility),
    visibility_audience:normalizeEventVisibilityRule(event.visibility_audience||event.visibility||"public"),
    status:clean(event.status),
    starts_at:event.starts_at||null,
    ends_at:event.ends_at||null,
    timezone:clean(event.timezone||"America/New_York"),
    location_name:clean(event.location_name),
    location_address:clean(event.location_address),
    summary:clean(event.summary),
    description:clean(event.description),
    rsvp_enabled:event.rsvp_enabled===true,
    rsvp_public_enabled:event.rsvp_public_enabled===true,
    rsvp_audience:normalizeEventRsvpAudience(event.rsvp_audience||(event.rsvp_public_enabled?"public":"member")),
    rsvp_deadline_at:event.rsvp_deadline_at||null,
    rsvp_closed:eventDeadlinePassed(event),
    waitlist_enabled:event.waitlist_enabled!==false,
    show_attendee_list:event.show_attendee_list!==false,
    attendee_list_visibility:clean(event.attendee_list_visibility || "eligible"),
    allowed_membership_class_keys:keysFromJsonArray(event.allowed_membership_class_keys),
    allowed_role_keys:keysFromJsonArray(event.allowed_role_keys),
    capacity:event.capacity??null,
    allow_guests:event.allow_guests!==false,
    max_guests_per_rsvp:Number(event.max_guests_per_rsvp||0),
    featured:event.featured===true,
    sort_order:Number(event.sort_order||100),
    needed_items:Array.isArray(event.needed_items) ? event.needed_items : [],
    rsvp_summary:{ yes:Number(counts.yes||0), maybe:Number(counts.maybe||0), no:Number(counts.no||0), waitlist:Number(counts.waitlist||0), total_attendees:Number(counts.total_attendees||0) }
  };
}
function safeEventRsvpRow(row: JsonRecord, includePrivate = false): JsonRecord { const personName = clean(row.person_display_name || row.respondent_name || row.person_primary_email || "RSVP"); return { rsvp_id:row.rsvp_id, event_id:row.event_id, organization_id:row.organization_id, person_id:row.person_id||null, membership_id:row.membership_id||null, name:personName, respondent_name:clean(row.respondent_name||personName), respondent_email:normalizeEmail(row.respondent_email||row.person_primary_email), response_status:normalizeEventRsvpStatus(row.response_status), attendee_count:Number(row.attendee_count||0), adult_count:Number(row.adult_count||0), child_count:Number(row.child_count||0), guest_count:Number(row.guest_count||0), attending_self:row.attending_self!==false, shared_note:clean(row.shared_note), private_note:includePrivate?clean(row.private_note):"", admin_note:includePrivate?clean(row.admin_note):"", rsvp_scope:clean(row.rsvp_scope||(row.person_id?"member":"public_guest")), waitlist_position:row.waitlist_position||null, created_at:row.created_at||null, updated_at:row.updated_at||null }; }
async function fetchEventById(serviceClient: SupabaseClientAny, organizationId: string, eventId: string): Promise<JsonRecord> { const { data, error } = await serviceClient.from("core_events").select("*").eq("organization_id", organizationId).eq("event_id", eventId).is("archived_at", null).maybeSingle(); if (error) throw error; if (!data?.event_id) throw new Error("Event not found."); return data as JsonRecord; }
async function countEventRsvps(serviceClient: SupabaseClientAny, eventId: string, excludeRsvpId = ""): Promise<JsonRecord> { let query = serviceClient.from("core_event_rsvps").select("rsvp_id,response_status,attendee_count").eq("event_id", eventId).is("archived_at", null); if (excludeRsvpId) query = query.neq("rsvp_id", excludeRsvpId); const { data, error } = await query; if (error) throw error; const out: JsonRecord = { yes:0, maybe:0, no:0, waitlist:0, total_attendees:0 }; for (const row of data || []) { const status = normalizeEventRsvpStatus(row.response_status); if (status === "yes") { out.yes = Number(out.yes||0)+1; out.total_attendees=Number(out.total_attendees||0)+Number(row.attendee_count||0); } else if (status === "maybe") out.maybe=Number(out.maybe||0)+1; else if (status === "no") out.no=Number(out.no||0)+1; else if (status === "waitlist") out.waitlist=Number(out.waitlist||0)+1; } return out; }
async function listEventRsvpsForEvent(serviceClient: SupabaseClientAny, organizationId: string, eventId: string): Promise<JsonRecord[]> { const { data, error } = await serviceClient.from("core_event_rsvp_admin_v1").select("*").eq("organization_id", organizationId).eq("event_id", eventId).is("archived_at", null).order("response_status", { ascending: true }).order("created_at", { ascending: true }); if (error) throw error; return data || []; }
async function findExistingMemberRsvp(serviceClient: SupabaseClientAny, eventId: string, personId: string, membershipId: string): Promise<JsonRecord | null> { let query = serviceClient.from("core_event_rsvps").select("*").eq("event_id", eventId).is("archived_at", null).limit(1); if (membershipId) query = query.eq("membership_id", membershipId); else query = query.eq("person_id", personId); const { data, error } = await query.maybeSingle(); if (error) throw error; return data || null; }
async function memberListEvents(serviceClient: SupabaseClientAny, organizationId: string, personId: string, platformAdmin: boolean): Promise<JsonRecord> { const accessRows = platformAdmin ? await buildPlatformAccess(serviceClient, organizationId) : await buildAccess(serviceClient, personId); const accessRow = accessRows.find((row: JsonRecord) => clean(row.organization_id) === clean(organizationId)); if (!accessRow) throw new Error("You are not linked to this organization."); const page = await getPortalPageForAction(serviceClient, organizationId, "calendar", platformAdmin); const { data: rows, error } = await serviceClient.from("core_events").select("*").eq("organization_id", organizationId).is("archived_at", null).eq("status", "published").order("starts_at", { ascending: true }).order("sort_order", { ascending: true }); if (error) throw error; const events: JsonRecord[] = []; const membershipId = clean(accessRow.membership_id); for (const event of rows || []) { if (!accessRowCanSeeEvent(event, accessRow, platformAdmin)) continue; const eventId = clean(event.event_id); const counts = await countEventRsvps(serviceClient, eventId); const existing = personId ? await findExistingMemberRsvp(serviceClient, eventId, personId, membershipId) : null; events.push({ ...safeEventForPortal(event, counts), can_rsvp: accessRowCanRsvpToEvent(event, accessRow, platformAdmin), can_manage_event: actorIsOrganizationAdminForEvent(accessRow) || platformAdmin, viewer_has_rsvp: Boolean(existing?.rsvp_id), viewer_rsvp_status: existing?.response_status ? normalizeEventRsvpStatus(existing.response_status) : "", viewer_rsvp: existing ? safeEventRsvpRow(existing, true) : null }); } return { access: accessRow, page, events, event_scope: platformAdmin ? "platform" : "member" }; }

async function organizationListEventRsvps(serviceClient: SupabaseClientAny, organizationId: string, eventId: string, actorAccess: JsonRecord): Promise<JsonRecord> { if (!actorIsOrganizationAdminForEvent(actorAccess)) throw new Error("You do not have event admin access for this organization."); const event = await fetchEventById(serviceClient, organizationId, eventId); const rows = await listEventRsvpsForEvent(serviceClient, organizationId, eventId); const counts = await countEventRsvps(serviceClient, eventId); return { event: safeEventForPortal(event, counts), rsvps: rows.map((row) => safeEventRsvpRow(row, true)), summary: counts }; }
async function organizationSaveEventRsvp(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string, actorAccess: JsonRecord): Promise<JsonRecord> { if (!actorIsOrganizationAdminForEvent(actorAccess)) throw new Error("You do not have event admin access for this organization."); const eventId = requireString(body, "event_id"); const event = await fetchEventById(serviceClient, organizationId, eventId); const rsvpId = clean(body.rsvp_id); const personId = clean(body.person_id); const membershipId = clean(body.membership_id); const responseStatus = normalizeEventRsvpStatus(body.response_status); const attendingSelf = body.attending_self !== false; const adultCount = Math.max(0, Number(body.adult_count || 0)); const childCount = Math.max(0, Number(body.child_count || 0)); const guestCount = Math.max(0, adultCount + childCount); const attendeeCount = eventRequestedAttendeeCount(responseStatus, attendingSelf, adultCount, childCount); let before: JsonRecord | null = null; if (rsvpId) { const { data, error } = await serviceClient.from("core_event_rsvps").select("*").eq("organization_id", organizationId).eq("rsvp_id", rsvpId).maybeSingle(); if (error) throw error; before = data || null; } const payload = { event_id:eventId, organization_id:organizationId, person_id:personId||null, membership_id:membershipId||null, respondent_name:clean(body.respondent_name||before?.respondent_name||"Manual RSVP"), respondent_email:normalizeEmail(body.respondent_email||before?.respondent_email), response_status:responseStatus, attendee_count:attendeeCount, adult_count:adultCount, child_count:childCount, guest_count:guestCount, attending_self:attendingSelf, shared_note:clean(body.shared_note)||null, private_note:clean(body.private_note)||null, admin_note:clean(body.admin_note)||null, rsvp_scope:personId?"admin_member_override":"admin_guest_override", source:"organization_admin_override", updated_at:new Date().toISOString(), metadata_json:{ saved_by_email:actorEmail, event_title:clean(event.title) } }; let saved: JsonRecord; if (before?.rsvp_id) { const { data, error } = await serviceClient.from("core_event_rsvps").update(payload).eq("rsvp_id", before.rsvp_id).eq("organization_id", organizationId).select("*").single(); if (error) throw error; saved = data; } else { const { data, error } = await serviceClient.from("core_event_rsvps").insert(payload).select("*").single(); if (error) throw error; saved = data; } try { await serviceClient.from("core_event_rsvp_events").insert({ event_id:eventId, rsvp_id:saved.rsvp_id, organization_id:organizationId, event_type:before?"admin_rsvp_updated":"admin_rsvp_created", actor_email:actorEmail, before_json:before, after_json:saved }); } catch { } return await organizationListEventRsvps(serviceClient, organizationId, eventId, actorAccess); }


function eventManagerArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const raw = clean(value);
  if (!raw) return [];
  return raw.split(",").map(clean).filter(Boolean);
}

function normalizeEventManagerStatus(value: unknown): string {
  const raw = clean(value || "draft").toLowerCase();
  if (["draft", "published", "hidden", "archived"].includes(raw)) return raw;
  if (raw === "active") return "published";
  return "draft";
}

function normalizeEventManagerVisibility(value: unknown): string {
  const raw = clean(value || "public").toLowerCase();
  if (["public", "member", "logged_in", "admin", "selected_classes", "selected_roles"].includes(raw)) return raw;
  if (["members", "users"].includes(raw)) return "member";
  if (["admins", "board", "internal"].includes(raw)) return "admin";
  return "public";
}

function normalizeEventManagerCapacityBehavior(value: unknown): string {
  const raw = clean(value || "waitlist").toLowerCase();
  return raw === "block" ? "block" : "waitlist";
}

function normalizeEventManagerSummaryVisibility(value: unknown): string {
  const raw = clean(value || "eligible").toLowerCase();
  if (["public", "eligible", "members", "admin", "hidden"].includes(raw)) return raw;
  return "eligible";
}

async function listEventTypes(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_event_types")
    .select("*")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listEventLocations(serviceClient: SupabaseClientAny, organizationId: string): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_event_locations")
    .select("*")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return data || [];
}

function safeEventNeedRow(row: JsonRecord): JsonRecord {
  return {
    event_need_id: row.event_need_id || null,
    event_id: row.event_id || null,
    organization_id: row.organization_id || null,
    item_key: clean(row.item_key),
    label: clean(row.label || row.item_label || "Item"),
    quantity_needed: Math.max(1, Math.trunc(Number(row.quantity_needed || row.quantity || 1))),
    notes: clean(row.notes),
    sort_order: Math.trunc(Number(row.sort_order || 100)),
    status: clean(row.status || "active"),
    archived_at: row.archived_at || null,
  };
}

async function fetchEventNeedsByEventIds(serviceClient: SupabaseClientAny, organizationId: string, eventIds: string[]): Promise<Map<string, JsonRecord[]>> {
  const ids = uniqueValues(eventIds).filter(Boolean);
  const out = new Map<string, JsonRecord[]>();
  if (!ids.length) return out;
  const { data, error } = await serviceClient
    .from("core_event_needed_items")
    .select("*")
    .eq("organization_id", organizationId)
    .in("event_id", ids)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  for (const raw of data || []) {
    const row = safeEventNeedRow(raw as JsonRecord);
    const eventId = clean(row.event_id);
    const list = out.get(eventId) || [];
    list.push(row);
    out.set(eventId, list);
  }
  return out;
}

function eventNeedsFromBody(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const row = jsonObject(raw);
    const label = clean(row.label || row.item_label || row.name);
    if (!label) return null;
    return {
      event_need_id: clean(row.event_need_id),
      item_key: normalizeKey(row.item_key || label) || `item-${index + 1}`,
      label,
      quantity_needed: Math.max(1, Math.trunc(Number(row.quantity_needed || row.quantity || 1))),
      notes: clean(row.notes),
      sort_order: Math.trunc(Number(row.sort_order || ((index + 1) * 10))),
      status: clean(row.status || "active") || "active",
    } as JsonRecord;
  }).filter(Boolean) as JsonRecord[];
}

async function replaceEventNeedsFromBody(serviceClient: SupabaseClientAny, organizationId: string, eventId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord[]> {
  if (!Object.prototype.hasOwnProperty.call(body, "event_needed_items")) {
    const needs = await fetchEventNeedsByEventIds(serviceClient, organizationId, [eventId]);
    return needs.get(eventId) || [];
  }
  const requested = eventNeedsFromBody(body.event_needed_items);
  const { data: existingRows, error: existingError } = await serviceClient
    .from("core_event_needed_items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .is("archived_at", null);
  if (existingError) throw existingError;
  const existingById = new Map<string, JsonRecord>(((existingRows || []) as JsonRecord[]).map((row) => [clean(row.event_need_id), row] as [string, JsonRecord]));
  const requestedIds = new Set(requested.map((row) => clean(row.event_need_id)).filter(Boolean));
  const now = new Date().toISOString();

  for (const row of existingRows || []) {
    const id = clean((row as JsonRecord).event_need_id);
    if (id && !requestedIds.has(id)) {
      const { error } = await serviceClient.from("core_event_needed_items").update({ archived_at: now, status: "archived", updated_at: now }).eq("event_need_id", id).eq("organization_id", organizationId);
      if (error) throw error;
    }
  }

  for (const item of requested) {
    const id = clean(item.event_need_id);
    const payload = {
      organization_id: organizationId,
      event_id: eventId,
      item_key: clean(item.item_key),
      label: clean(item.label),
      quantity_needed: Math.max(1, Math.trunc(Number(item.quantity_needed || 1))),
      notes: clean(item.notes) || null,
      sort_order: Math.trunc(Number(item.sort_order || 100)),
      status: clean(item.status || "active") || "active",
      updated_at: now,
      settings_json: { saved_by_email: actorEmail, source: "organization_events_manager" },
    };
    if (id && existingById.has(id)) {
      const { error } = await serviceClient.from("core_event_needed_items").update(payload).eq("event_need_id", id).eq("organization_id", organizationId);
      if (error) throw error;
    } else {
      const { error } = await serviceClient.from("core_event_needed_items").insert(payload);
      if (error) throw error;
    }
  }

  const needs = await fetchEventNeedsByEventIds(serviceClient, organizationId, [eventId]);
  return needs.get(eventId) || [];
}

async function organizationListEventsManager(serviceClient: SupabaseClientAny, organizationId: string, actorAccess: JsonRecord): Promise<JsonRecord> {
  if (!actorIsOrganizationAdminForEvent(actorAccess)) throw new Error("You do not have event admin access for this organization.");
  const page = await getPortalPageForAction(serviceClient, organizationId, "organization-events", false).catch(() => null);
  const { data: rawEvents, error } = await serviceClient
    .from("core_events")
    .select("*")
    .eq("organization_id", organizationId)
    .order("starts_at", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const eventRows = (rawEvents || []) as JsonRecord[];
  const needsByEvent = await fetchEventNeedsByEventIds(serviceClient, organizationId, eventRows.map((event) => clean(event.event_id)));
  const events = eventRows.map((event) => ({ ...event, needed_items: needsByEvent.get(clean(event.event_id)) || [] }));
  const vocabulary = await listRoleStatusOptions(serviceClient, organizationId);
  return {
    page,
    events,
    event_types: await listEventTypes(serviceClient, organizationId),
    locations: await listEventLocations(serviceClient, organizationId),
    membership_classes: vocabulary.membership_classes || [],
    roles: vocabulary.roles || [],
  };
}

async function ensureEventTypeFromBody(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord): Promise<JsonRecord | null> {
  if (!optionalBoolean(body, "save_event_type", false)) return null;
  const label = clean(body.event_type_label || body.category || body.event_type_key || "General");
  const typeKey = normalizeKey(body.event_type_key || label || "general") || "general";
  const payload = {
    organization_id: organizationId,
    type_key: typeKey,
    label,
    accent_color: clean(body.event_accent_color) || null,
    image_url: clean(body.event_type_image_url || body.event_image_url) || null,
    image_storage_path: clean(body.event_type_image_path || body.event_image_path) || null,
    image_asset_json: jsonObject(body.event_type_image_asset_json || body.event_image_asset_json),
    default_visibility: normalizeEventManagerVisibility(body.visibility_audience || body.visibility || "public"),
    default_rsvp_audience: normalizeEventRsvpAudience(body.rsvp_audience || "member"),
    sort_order: Math.trunc(Number(body.event_type_sort_order || 100)),
    status: "active",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await serviceClient.from("core_event_types").upsert(payload, { onConflict: "organization_id,type_key" }).select("*").single();
  if (error) throw error;
  return data;
}

async function ensureEventLocationFromBody(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord): Promise<JsonRecord | null> {
  if (!optionalBoolean(body, "save_location", false)) return null;
  const label = clean(body.location_label || body.location_name || body.location_address || "Location");
  const locationKey = normalizeKey(body.location_key || label || "location") || "location";
  const address = clean(body.location_address);
  const payload = {
    organization_id: organizationId,
    location_key: locationKey,
    label,
    location_name: clean(body.location_name) || label,
    location_address: address || null,
    map_query: clean(body.map_query) || address || label,
    map_embed_url: clean(body.map_embed_url) || null,
    location_mode: clean(body.location_mode || "in_person") || "in_person",
    online_platform: clean(body.online_platform) || null,
    online_join_url: clean(body.online_join_url) || null,
    online_join_url_visibility: clean(body.online_join_url_visibility || "logged_in") || "logged_in",
    notes: clean(body.location_notes) || null,
    image_url: clean(body.location_image_url) || null,
    sort_order: Math.trunc(Number(body.location_sort_order || 100)),
    status: "active",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await serviceClient.from("core_event_locations").upsert(payload, { onConflict: "organization_id,location_key" }).select("*").single();
  if (error) throw error;
  return data;
}

function decodeEventImageDataUrl(value: unknown): { mime_type: string; bytes: Uint8Array; extension: string } {
  const raw = String(value || "").trim();
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("Event image must be a JPG, PNG, or WebP image file.");
  const mimeType = match[1].toLowerCase();
  const extension = EVENT_IMAGE_MIME_TO_EXTENSION[mimeType];
  if (!extension) throw new Error("Event image must be a JPG, PNG, or WebP image.");
  const base64 = match[2].replace(/\s+/g, "");
  let binary = "";
  try { binary = atob(base64); } catch { throw new Error("Event image upload was not valid image data."); }
  if (binary.length > EVENT_IMAGE_MAX_BYTES) throw new Error("Event image is too large. Use an image under 8 MB.");
  if (binary.length < 12) throw new Error("Event image appears to be empty.");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { mime_type: mimeType, bytes, extension };
}

async function organizationUploadEventImage(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  body: JsonRecord,
  actorEmail: string,
  actorAccess: JsonRecord,
): Promise<JsonRecord> {
  if (!actorIsOrganizationAdminForEvent(actorAccess)) throw new Error("You do not have event admin access for this organization.");
  const decoded = decodeEventImageDataUrl(body.data_url || body.file_data_url || body.file_base64);
  const kindRaw = normalizeKey(body.image_kind || body.target_kind || "event").replace(/_/g, "-");
  const kind = kindRaw === "event-type" ? "event-type" : "event";
  const fileBase = normalizeKey(body.file_name || "event-image").slice(0, 80) || "event-image";
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const target = kind === "event-type"
    ? safeStorageSegment(body.event_type_key || body.type_key || "event-type")
    : safeStorageSegment(body.event_id || body.event_key || "event-draft");
  const path = `organizations/${safeStorageSegment(organizationId)}/events/${kind}/${target}/image-${stamp}-${fileBase}.${decoded.extension}`;

  const { error: uploadError } = await serviceClient.storage
    .from(EVENT_IMAGE_BUCKET)
    .upload(path, decoded.bytes, { contentType: decoded.mime_type, cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicData } = serviceClient.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(path);
  const publicUrl = clean(publicData?.publicUrl);
  if (!publicUrl) throw new Error("Event image uploaded, but no public URL was returned.");

  const uploaded = {
    bucket: EVENT_IMAGE_BUCKET,
    storage_path: path,
    path,
    public_url: publicUrl,
    url: publicUrl,
    mime_type: decoded.mime_type,
    size_bytes: decoded.bytes.byteLength,
    original_file_name: clean(body.file_name),
    uploaded_at: new Date().toISOString(),
    uploaded_by_email: actorEmail,
    image_kind: kind,
  };

  try { await serviceClient.from("core_audit_log").insert({ actor_email: actorEmail, actor_role: "organization_admin", action: "organization_upload_event_image", target_type: "core_events", target_id: organizationId, request_json: { organization_id: organizationId, image_kind: kind, file_name: clean(body.file_name) }, result_json: uploaded }); } catch {}
  return { uploaded };
}

async function organizationSaveEvent(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string, actorAccess: JsonRecord): Promise<JsonRecord> {
  if (!actorIsOrganizationAdminForEvent(actorAccess)) throw new Error("You do not have event admin access for this organization.");
  const eventId = clean(body.event_id);
  const title = requireString(body, "title");
  const startsAt = clean(body.starts_at);
  if (!startsAt) throw new Error("Event start date/time is required.");
  let before: JsonRecord | null = null;
  if (eventId) {
    const { data, error } = await serviceClient.from("core_events").select("*").eq("organization_id", organizationId).eq("event_id", eventId).maybeSingle();
    if (error) throw error;
    before = data || null;
    if (!before) throw new Error("Event not found for this organization.");
  }
  const savedType = await ensureEventTypeFromBody(serviceClient, organizationId, body);
  const savedLocation = await ensureEventLocationFromBody(serviceClient, organizationId, body);
  const visibilityAudience = normalizeEventManagerVisibility(body.visibility_audience || body.visibility);
  const rsvpAudience = normalizeEventRsvpAudience(body.rsvp_audience || (visibilityAudience === "public" ? "public" : "member"));
  const classKeys = eventManagerArray(body.allowed_membership_class_keys || body.eligible_membership_class_keys);
  const roleKeys = eventManagerArray(body.allowed_role_keys || body.eligible_role_keys);
  const status = normalizeEventManagerStatus(body.status);
  const capacityBehavior = normalizeEventManagerCapacityBehavior(body.rsvp_capacity_behavior);
  const typeKey = clean(body.event_type_key || savedType?.type_key || normalizeKey(body.category || "general"));
  const typeLabel = clean(body.event_type_label || savedType?.label || body.category || "General");
  const locKey = clean(body.location_key || savedLocation?.location_key || "");
  const locationName = clean(body.location_name || savedLocation?.location_name || savedLocation?.label);
  const locationAddress = clean(body.location_address || savedLocation?.location_address);
  const payload: JsonRecord = {
    organization_id: organizationId,
    site_id: clean(body.site_id) || null,
    customer_page_id: clean(body.customer_page_id) || null,
    event_key: normalizeKey(body.event_key || `${title}-${String(startsAt).slice(0,10)}`) || "event",
    title,
    category: typeLabel,
    event_type_key: typeKey || null,
    event_type_label: typeLabel || null,
    event_accent_color: clean(body.event_accent_color || savedType?.accent_color) || null,
    event_image_url: clean(body.event_image_url || body.image_url || savedType?.image_url) || null,
    event_image_path: clean(body.event_image_path || body.image_storage_path || savedType?.image_storage_path) || null,
    event_image_asset_json: jsonObject(body.event_image_asset_json),
    visibility: visibilityAudience === "member" ? "members" : visibilityAudience === "admin" ? "admin" : "public",
    visibility_audience: visibilityAudience,
    status,
    starts_at: startsAt,
    ends_at: clean(body.ends_at) || null,
    timezone: clean(body.timezone || "America/New_York") || "America/New_York",
    location_key: locKey || null,
    location_name: locationName || null,
    location_address: locationAddress || null,
    map_query: clean(body.map_query || savedLocation?.map_query || locationAddress || locationName) || null,
    map_embed_url: clean(body.map_embed_url || savedLocation?.map_embed_url) || null,
    location_mode: clean(body.location_mode || savedLocation?.location_mode || "in_person") || "in_person",
    online_platform: clean(body.online_platform || savedLocation?.online_platform) || null,
    online_join_url: clean(body.online_join_url) || null,
    online_join_url_visibility: clean(body.online_join_url_visibility || "logged_in") || "logged_in",
    summary: clean(body.summary) || null,
    description: clean(body.description) || null,
    rsvp_enabled: optionalBoolean(body, "rsvp_enabled", false),
    rsvp_public_enabled: rsvpAudience === "public",
    rsvp_audience: rsvpAudience,
    rsvp_deadline_at: clean(body.rsvp_deadline_at) || null,
    capacity: body.capacity === null || body.capacity === undefined || clean(body.capacity) === "" ? null : Number(body.capacity),
    allow_guests: optionalBoolean(body, "allow_guests", true),
    max_guests_per_rsvp: Math.max(0, Number(body.max_guests_per_rsvp || 0)),
    waitlist_enabled: capacityBehavior === "waitlist" && optionalBoolean(body, "waitlist_enabled", true),
    rsvp_capacity_behavior: capacityBehavior,
    allowed_membership_class_keys: classKeys,
    allowed_role_keys: roleKeys,
    rsvp_allowed_membership_class_keys: classKeys,
    rsvp_allowed_role_keys: roleKeys,
    attendee_list_visibility: normalizeEventManagerSummaryVisibility(body.attendee_list_visibility),
    show_attendee_list: optionalBoolean(body, "show_attendee_list", true),
    featured: optionalBoolean(body, "featured", false),
    sort_order: Math.trunc(Number(body.sort_order || 100)),
    event_type_json: savedType ? savedType : (body.event_type_json && typeof body.event_type_json === "object" ? body.event_type_json as JsonRecord : {}),
    location_json: { ...(savedLocation || {}), ...(body.location_json && typeof body.location_json === "object" ? body.location_json as JsonRecord : {}), location_mode: clean(body.location_mode || savedLocation?.location_mode || "in_person") || "in_person", online_platform: clean(body.online_platform || savedLocation?.online_platform), online_join_url_visibility: clean(body.online_join_url_visibility || savedLocation?.online_join_url_visibility || "logged_in") || "logged_in" },
    updated_by_user_id: null,
  };
  if (status === "archived") payload.archived_at = before?.archived_at || new Date().toISOString();
  if (status !== "archived") payload.archived_at = null;
  let saved: JsonRecord;
  if (before?.event_id) {
    const { data, error } = await serviceClient.from("core_events").update(payload).eq("event_id", before.event_id).eq("organization_id", organizationId).select("*").single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await serviceClient.from("core_events").insert({ ...payload, created_by_user_id: null }).select("*").single();
    if (error) throw error;
    saved = data;
  }
  const neededItems = await replaceEventNeedsFromBody(serviceClient, organizationId, clean(saved.event_id), body, actorEmail);
  saved = { ...saved, needed_items: neededItems };
  try { await serviceClient.from("core_audit_log").insert({ actor_email: actorEmail, actor_role: "organization_admin", action: "organization_save_event", target_type: "core_events", target_id: clean(saved.event_id), before_json: before, after_json: saved, request_json: { organization_id: organizationId, event_id: eventId, title, event_needed_items: eventNeedsFromBody(body.event_needed_items) }, result_json: { event_id: saved.event_id, needed_item_count: neededItems.length } }); } catch {}
  return await organizationListEventsManager(serviceClient, organizationId, actorAccess);
}

async function organizationSetEventArchiveState(serviceClient: SupabaseClientAny, organizationId: string, eventId: string, archive: boolean, actorEmail: string, actorAccess: JsonRecord): Promise<JsonRecord> {
  if (!actorIsOrganizationAdminForEvent(actorAccess)) throw new Error("You do not have event admin access for this organization.");
  const payload = archive ? { status: "archived", archived_at: new Date().toISOString() } : { status: "draft", archived_at: null };
  const { data, error } = await serviceClient.from("core_events").update(payload).eq("organization_id", organizationId).eq("event_id", eventId).select("*").single();
  if (error) throw error;
  try { await serviceClient.from("core_audit_log").insert({ actor_email: actorEmail, actor_role: "organization_admin", action: archive ? "organization_archive_event" : "organization_restore_event", target_type: "core_events", target_id: eventId, request_json: { organization_id: organizationId, event_id: eventId }, result_json: { event_id: eventId } }); } catch {}
  return await organizationListEventsManager(serviceClient, organizationId, actorAccess);
}



// =======================
// RSVP Checklist / Bring-Items Claiming 0095
// Later declarations intentionally override the 0088 RSVP context/save functions above.
// =======================

type RsvpChecklistItem = JsonRecord;

async function fetchEventNeededItemsForRsvp0095(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  eventId: string,
): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_event_needed_items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .is("archived_at", null)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: JsonRecord) => safeEventNeedRow(row));
}

async function fetchEventNeedClaimsForRsvp0095(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  eventId: string,
): Promise<JsonRecord[]> {
  const { data, error } = await serviceClient
    .from("core_event_needed_item_claims")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .is("archived_at", null)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

function personDisplayNameFromRow0095(person: JsonRecord): string {
  const profile = jsonObject(person.profile_json);
  const nameProfile = jsonObject(profile.name);
  const preferred = clean(nameProfile.preferred_first_name || nameProfile.preferred_name || person.first_name);
  const suffix = clean(nameProfile.suffix || person.suffix);
  return clean(person.display_name || [preferred, person.last_name, suffix].map(clean).filter(Boolean).join(" "));
}

function calculatedClaimantName0095(row: JsonRecord, peopleById: Map<string, JsonRecord> = new Map(), peopleByEmail: Map<string, JsonRecord> = new Map()): string {
  const person = peopleById.get(clean(row.person_id)) || peopleByEmail.get(normalizeEmail(row.respondent_email || row.claimed_by_email)) || {};
  const personName = personDisplayNameFromRow0095(person as JsonRecord);
  return personName || clean(row.respondent_name) || normalizeEmail(row.respondent_email) || normalizeEmail(row.claimed_by_email) || "Claimed";
}

async function fetchRsvpClaimNameMap0095(
  serviceClient: SupabaseClientAny,
  eventId: string,
  rsvpIds: string[],
): Promise<Map<string, JsonRecord>> {
  const ids = uniqueValues(rsvpIds).filter(Boolean);
  const out = new Map<string, JsonRecord>();
  if (!ids.length) return out;
  let rows: JsonRecord[] = [];
  const fullResult = await serviceClient
    .from("core_event_rsvps")
    .select("rsvp_id, respondent_name, respondent_email, person_id, membership_id, response_status")
    .eq("event_id", eventId)
    .in("rsvp_id", ids)
    .is("archived_at", null);
  if (fullResult.error) {
    // Older RSVP schemas may not expose person/membership columns. Degrade safely instead of crashing the page.
    const basicResult = await serviceClient
      .from("core_event_rsvps")
      .select("rsvp_id, respondent_name, respondent_email, response_status")
      .eq("event_id", eventId)
      .in("rsvp_id", ids)
      .is("archived_at", null);
    if (basicResult.error) return out;
    rows = (basicResult.data || []) as JsonRecord[];
  } else {
    rows = (fullResult.data || []) as JsonRecord[];
  }
  const personIds = uniqueValues(rows.map((row) => clean(row.person_id))).filter(Boolean);
  const emails = uniqueValues(rows.map((row) => normalizeEmail(row.respondent_email))).filter(Boolean);
  const peopleById = new Map<string, JsonRecord>();
  const peopleByEmail = new Map<string, JsonRecord>();
  if (personIds.length || emails.length) {
    let peopleQuery = serviceClient
      .from("core_people")
      .select("person_id, display_name, first_name, last_name, primary_email, profile_json");
    if (personIds.length) peopleQuery = peopleQuery.in("person_id", personIds);
    else peopleQuery = peopleQuery.in("primary_email", emails);
    const { data: people, error: peopleError } = await peopleQuery;
    if (!peopleError) {
      for (const person of people || []) {
        peopleById.set(clean(person.person_id), person as JsonRecord);
        const email = normalizeEmail(person.primary_email);
        if (email) peopleByEmail.set(email, person as JsonRecord);
      }
    }
  }
  for (const row of rows) {
    const next = { ...(row as JsonRecord), respondent_name: calculatedClaimantName0095(row as JsonRecord, peopleById, peopleByEmail) };
    out.set(clean(row.rsvp_id), next);
  }
  return out;
}

function normalizeClaimRows0095(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const row = jsonObject(raw);
    const eventNeedId = clean(row.event_need_id || row.event_need_id);
    if (!eventNeedId) return null;
    return {
      event_need_id: eventNeedId,
      quantity_claimed: Math.max(0, Math.trunc(Number(row.quantity_claimed ?? row.quantity ?? 0))),
      note: clean(row.note || row.notes),
    } as JsonRecord;
  }).filter(Boolean) as JsonRecord[];
}

async function buildEventChecklist0095(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  eventId: string,
  viewerRsvpId = "",
  includeClaimNames = true,
): Promise<JsonRecord> {
  const needs = await fetchEventNeededItemsForRsvp0095(serviceClient, organizationId, eventId);
  const claims = await fetchEventNeedClaimsForRsvp0095(serviceClient, organizationId, eventId);
  const rsvpMap = includeClaimNames
    ? await fetchRsvpClaimNameMap0095(serviceClient, eventId, claims.map((claim) => clean(claim.rsvp_id)))
    : new Map<string, JsonRecord>();
  const claimsByNeed = new Map<string, JsonRecord[]>();
  for (const claim of claims) {
    const needId = clean(claim.event_need_id);
    const list = claimsByNeed.get(needId) || [];
    list.push(claim);
    claimsByNeed.set(needId, list);
  }
  const items = needs.map((need) => {
    const needId = clean(need.event_need_id);
    const rowClaims = claimsByNeed.get(needId) || [];
    const publicClaims = rowClaims.map((claim) => {
      const rsvp = rsvpMap.get(clean(claim.rsvp_id)) || {};
      const name = clean(rsvp.respondent_name || claim.claimed_by_email || "Claimed");
      return {
        event_need_claim_id: claim.event_need_claim_id,
        event_need_id: needId,
        rsvp_id: claim.rsvp_id || null,
        quantity_claimed: Number(claim.quantity_claimed || 0),
        note: clean(claim.note),
        name: includeClaimNames ? name : "Claimed",
        respondent_name: includeClaimNames ? name : "Claimed",
        respondent_email: includeClaimNames ? normalizeEmail(rsvp.respondent_email || claim.claimed_by_email) : "",
        mine: viewerRsvpId ? clean(claim.rsvp_id) === viewerRsvpId : false,
      };
    });
    const totalClaimed = publicClaims.reduce((sum, claim) => sum + Number(claim.quantity_claimed || 0), 0);
    const quantityNeeded = Math.max(1, Number(need.quantity_needed || 1));
    const myClaim = publicClaims.find((claim) => claim.mine) || { quantity_claimed: 0, note: "" };
    return {
      ...need,
      quantity_needed: quantityNeeded,
      quantity_claimed: totalClaimed,
      total_claimed: totalClaimed,
      remaining: Math.max(0, quantityNeeded - totalClaimed),
      claims: publicClaims,
      my_claim: myClaim,
    };
  });
  return {
    items,
    needed_items: items,
    summary: {
      total_items: items.length,
      still_needed: items.reduce((sum, item) => sum + Number(item.remaining || 0), 0),
      total_claimed: items.reduce((sum, item) => sum + Number(item.quantity_claimed || 0), 0),
    },
  };
}

async function replaceRsvpNeededItemClaims0095(
  serviceClient: SupabaseClientAny,
  organizationId: string,
  eventId: string,
  savedRsvp: JsonRecord,
  body: JsonRecord,
  personId: string,
  membershipId: string,
  actorEmail: string,
  finalStatus: string,
): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(body, "event_needed_item_claims")) return;
  const rsvpId = clean(savedRsvp.rsvp_id);
  if (!rsvpId) return;
  const requested = ["yes", "maybe", "waitlist"].includes(finalStatus)
    ? normalizeClaimRows0095(body.event_needed_item_claims)
    : [];
  const needs = await fetchEventNeededItemsForRsvp0095(serviceClient, organizationId, eventId);
  const needsById = new Map<string, JsonRecord>(needs.map((need) => [clean(need.event_need_id), need] as [string, JsonRecord]));
  const currentClaims = await fetchEventNeedClaimsForRsvp0095(serviceClient, organizationId, eventId);
  const claimedByOthers = new Map<string, number>();
  for (const claim of currentClaims) {
    if (clean(claim.rsvp_id) === rsvpId) continue;
    const needId = clean(claim.event_need_id);
    claimedByOthers.set(needId, Number(claimedByOthers.get(needId) || 0) + Number(claim.quantity_claimed || 0));
  }
  for (const claim of requested) {
    const needId = clean(claim.event_need_id);
    const need = needsById.get(needId);
    if (!need) throw new Error("One of the requested checklist items is no longer available.");
    const quantity = Math.max(0, Math.trunc(Number(claim.quantity_claimed || 0)));
    const quantityNeeded = Math.max(1, Number(need.quantity_needed || 1));
    const others = Number(claimedByOthers.get(needId) || 0);
    if (quantity > 0 && others + quantity > quantityNeeded) {
      throw new Error(`${clean(need.label || "Checklist item")} only has ${Math.max(0, quantityNeeded - others)} remaining.`);
    }
  }
  const now = new Date().toISOString();
  const { error: archiveError } = await serviceClient
    .from("core_event_needed_item_claims")
    .update({ archived_at: now, status: "archived", updated_at: now })
    .eq("organization_id", organizationId)
    .eq("event_id", eventId)
    .eq("rsvp_id", rsvpId)
    .is("archived_at", null);
  if (archiveError) throw archiveError;
  const inserts = requested
    .filter((claim) => Number(claim.quantity_claimed || 0) > 0)
    .map((claim) => ({
      organization_id: organizationId,
      event_id: eventId,
      event_need_id: clean(claim.event_need_id),
      rsvp_id: rsvpId,
      person_id: personId || null,
      membership_id: membershipId || null,
      quantity_claimed: Math.max(1, Math.trunc(Number(claim.quantity_claimed || 1))),
      note: clean(claim.note) || null,
      status: "active",
      claimed_by_email: actorEmail || null,
      updated_at: now,
    }));
  if (inserts.length) {
    const { error: insertError } = await serviceClient.from("core_event_needed_item_claims").insert(inserts);
    if (insertError) throw insertError;
  }
}

async function memberGetEventRsvpContext(serviceClient: SupabaseClientAny, organizationId: string, eventId: string, personId: string, platformAdmin: boolean): Promise<JsonRecord> {
  const accessRows = platformAdmin ? await buildPlatformAccess(serviceClient, organizationId) : await buildAccess(serviceClient, personId);
  const accessRow = accessRows.find((row: JsonRecord) => clean(row.organization_id) === clean(organizationId));
  if (!accessRow) throw new Error("You are not linked to this organization.");
  const event = await fetchEventById(serviceClient, organizationId, eventId);
  if (!accessRowCanSeeEvent(event, accessRow, platformAdmin)) throw new Error("You do not have access to this event.");
  const counts = await countEventRsvps(serviceClient, eventId);
  const existing = await findExistingMemberRsvp(serviceClient, eventId, personId, clean(accessRow.membership_id));
  const isAdmin = actorIsOrganizationAdminForEvent(accessRow) || platformAdmin;
  const rows = (event.show_attendee_list !== false || isAdmin) ? await listEventRsvpsForEvent(serviceClient, organizationId, eventId) : [];
  const rsvps = rows.map((row) => safeEventRsvpRow(row, isAdmin || clean(row.person_id) === personId));
  const checklist = await buildEventChecklist0095(serviceClient, organizationId, eventId, clean(existing?.rsvp_id), isAdmin || event.show_attendee_list !== false);
  return {
    access: accessRow,
    event: { ...safeEventForPortal({ ...event, needed_items: checklist.items }, counts), can_rsvp: accessRowCanRsvpToEvent(event, accessRow, platformAdmin), can_manage_event: isAdmin },
    existing_rsvp: existing ? safeEventRsvpRow(existing, true) : null,
    my_rsvp: existing ? safeEventRsvpRow(existing, true) : null,
    rsvps,
    summary: counts,
    checklist,
  };
}

async function memberSaveEventRsvp(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, person: JsonRecord, personId: string, platformAdmin: boolean, actorEmail: string): Promise<JsonRecord> {
  const eventId = requireString(body, "event_id");
  const accessRows = platformAdmin ? await buildPlatformAccess(serviceClient, organizationId) : await buildAccess(serviceClient, personId);
  const accessRow = accessRows.find((row: JsonRecord) => clean(row.organization_id) === clean(organizationId));
  if (!accessRow) throw new Error("You are not linked to this organization.");
  const event = await fetchEventById(serviceClient, organizationId, eventId);
  if (!accessRowCanSeeEvent(event, accessRow, platformAdmin)) throw new Error("You do not have access to this event.");
  if (!accessRowCanRsvpToEvent(event, accessRow, platformAdmin)) throw new Error("You are not eligible to RSVP for this event.");
  if (eventDeadlinePassed(event) && !actorIsOrganizationAdminForEvent(accessRow) && !platformAdmin) throw new Error("RSVP is closed for this event.");
  const membershipId = clean(accessRow.membership_id);
  const existing = await findExistingMemberRsvp(serviceClient, eventId, personId, membershipId);
  const responseStatus = normalizeEventRsvpStatus(body.response_status);
  const attendingSelf = body.attending_self !== false;
  const adultCount = Math.max(0, Number(body.adult_count || 0));
  const childCount = Math.max(0, Number(body.child_count || 0));
  const guestCount = Math.max(0, adultCount + childCount);
  const maxGuests = Number(event.max_guests_per_rsvp || 0);
  if (event.allow_guests === false && guestCount > 0) throw new Error("Guests are not allowed for this event.");
  if (maxGuests > 0 && guestCount > maxGuests) throw new Error(`This event allows up to ${maxGuests} guest(s) per RSVP.`);
  let finalStatus = responseStatus;
  let attendeeCount = eventRequestedAttendeeCount(responseStatus, attendingSelf, adultCount, childCount);
  if (responseStatus === "yes" && Number(event.capacity || 0) > 0) {
    const counts = await countEventRsvps(serviceClient, eventId, clean(existing?.rsvp_id));
    if (Number(counts.total_attendees || 0) + attendeeCount > Number(event.capacity)) {
      if (event.waitlist_enabled !== false) finalStatus = "waitlist";
      else throw new Error("This event is full.");
    }
  }
  if (!["yes", "waitlist"].includes(finalStatus)) attendeeCount = 0;
  const displayName = clean(person.display_name || [person.first_name, person.last_name].map(clean).filter(Boolean).join(" ") || actorEmail);
  const payload = {
    event_id:eventId,
    organization_id:organizationId,
    person_id:personId,
    membership_id:membershipId||null,
    respondent_name:displayName,
    respondent_email:actorEmail,
    response_status:finalStatus,
    attendee_count:attendeeCount,
    adult_count:adultCount,
    child_count:childCount,
    guest_count:guestCount,
    attending_self:attendingSelf,
    shared_note:clean(body.shared_note)||null,
    private_note:clean(body.private_note)||null,
    rsvp_scope:"member",
    source:platformAdmin?"platform_admin_override":"member_portal",
    updated_at:new Date().toISOString(),
    metadata_json:{ saved_by:"core-access-action", requested_status:responseStatus, checklist_version:"2026-06-09-095-C" },
  };
  let saved: JsonRecord;
  if (existing?.rsvp_id) {
    const { data, error } = await serviceClient.from("core_event_rsvps").update(payload).eq("rsvp_id", existing.rsvp_id).eq("organization_id", organizationId).select("*").single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await serviceClient.from("core_event_rsvps").insert(payload).select("*").single();
    if (error) throw error;
    saved = data;
  }
  await replaceRsvpNeededItemClaims0095(serviceClient, organizationId, eventId, saved, body, personId, membershipId || "", actorEmail, finalStatus);
  try {
    await serviceClient.from("core_event_rsvp_events").insert({ event_id:eventId, rsvp_id:saved.rsvp_id, organization_id:organizationId, event_type:existing?.rsvp_id?"member_rsvp_updated":"member_rsvp_created", actor_person_id:personId, actor_membership_id:membershipId||null, actor_email:actorEmail, before_json:existing||null, after_json:saved });
  } catch { }
  return await memberGetEventRsvpContext(serviceClient, organizationId, eventId, personId, platformAdmin);
}


// =======================
// Applicant Portal / Upload Tasks 0098
// =======================

function portalAccessMode0098(value: unknown): string {
  const raw = normalizeKey(value || "accepted_onboarding").replace(/-/g, "_");
  return ["none", "after_submitted", "manual", "info_requested", "accepted_onboarding"].includes(raw) ? raw : "accepted_onboarding";
}

function maskApplicantEmail0098(email: unknown): string {
  const value = safeEmail(email);
  const parts = value.split("@");
  if (parts.length !== 2) return "masked email";
  const local = parts[0] || "";
  const domainParts = (parts[1] || "").split(".");
  const domain = domainParts[0] || "";
  const suffix = domainParts.slice(1).join(".");
  const localMask = (local.slice(0,1) || "•") + "••••";
  const domainMask = (domain.slice(0,1) || "•") + "•••••••";
  return `${localMask}@${domainMask}${suffix ? `.${suffix}` : ""}`;
}

function applicantPortalAllowed0098(settings: JsonRecord, app: JsonRecord): boolean {
  const mode = portalAccessMode0098(settings.portal_access_mode || settings.applicant_portal_access_rule);
  const status = normalizeApplicantStatus(app.applicant_status || app.status, "new");
  if (mode === "none") return false;
  if (mode === "after_submitted") return true;
  if (mode === "manual") return Boolean(app.portal_access_granted || app.portal_access_granted_at || app.applicant_user_id);
  if (mode === "info_requested") return Boolean(app.portal_access_granted) || ["waitlist", "invited_to_interview", "onboarding", "ready_for_final_review", "added_as_member"].includes(status);
  return Boolean(app.portal_access_granted) || ["onboarding", "ready_for_final_review", "added_as_member"].includes(status);
}

function applicantCanUpdate0098(settings: JsonRecord, app: JsonRecord): boolean {
  const status = normalizeApplicantStatus(app.applicant_status || app.status, "new");
  return settings.allow_applicant_updates !== false && applicantPortalAllowed0098(settings, app) && !["archived", "added_as_member"].includes(status);
}

async function listApplicantUploadsMap0098(serviceClient: SupabaseClientAny, applicationIds: string[]): Promise<Map<string, JsonRecord[]>> {
  const ids = Array.from(new Set(applicationIds.map(clean).filter(Boolean)));
  const out = new Map<string, JsonRecord[]>();
  if (!ids.length) return out;
  const { data, error } = await serviceClient.from("core_applicant_task_uploads").select("*").in("application_id", ids).is("archived_at", null).order("uploaded_at", { ascending: false });
  if (error) throw error;
  for (const row of ((data || []) as JsonRecord[])) {
    const taskId = clean(row.applicant_task_id || row.task_key || "");
    const list = out.get(taskId) || [];
    list.push(row);
    out.set(taskId, list);
  }
  return out;
}

function enrichApplicantTasksWithUploads0098(tasks: JsonRecord[], uploadsMap: Map<string, JsonRecord[]>): JsonRecord[] {
  return (tasks || []).map((task) => {
    const id = clean(task.applicant_task_id || task.task_key);
    const uploads = uploadsMap.get(id) || uploadsMap.get(clean(task.task_key)) || [];
    const newest = uploads[0] || null;
    return { ...task, uploads, latest_upload: newest, upload_required: task.upload_required === true || jsonObject(task.settings_json).upload_required === true || ["upload", "document"].includes(clean(task.task_type)) };
  });
}

async function applicantPortalFindApplication0098(serviceClient: SupabaseClientAny, actorEmail: string, authUserId: string, organizationId = ""): Promise<{ app: JsonRecord; settings: JsonRecord; organization: JsonRecord; page: JsonRecord | null; }> {
  let query = serviceClient.from("core_applications").select("*").eq("email", actorEmail).is("archived_at", null).order("submitted_at", { ascending: false }).limit(25);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  const candidates = (data || []) as JsonRecord[];
  if (!candidates.length) throw new Error("No applicant record was found for this login email.");
  for (const candidate of candidates) {
    const settings = await getApplicantSettings(serviceClient, clean(candidate.organization_id));
    if (!applicantPortalAllowed0098(settings, candidate)) continue;
    if (authUserId && !candidate.applicant_user_id) {
      await serviceClient.from("core_applications").update({ applicant_user_id: authUserId, updated_at: new Date().toISOString() }).eq("application_id", candidate.application_id);
      candidate.applicant_user_id = authUserId;
    }
    const { data: org, error: orgError } = await serviceClient.from("core_organizations").select("organization_id, organization_key, display_name, organization_type, vertical, status").eq("organization_id", clean(candidate.organization_id)).maybeSingle();
    if (orgError) throw orgError;
    const { data: page } = await serviceClient.from("core_customer_pages").select("*").eq("organization_id", clean(candidate.organization_id)).eq("page_key", "applicant-portal").maybeSingle();
    return { app: candidate, settings, organization: org || {}, page: page || null };
  }
  throw new Error("Applicant portal access is not currently available for this application.");
}

async function applicantGetPortal0098(serviceClient: SupabaseClientAny, actorEmail: string, authUserId: string, organizationId = ""): Promise<JsonRecord> {
  const found = await applicantPortalFindApplication0098(serviceClient, actorEmail, authUserId, organizationId);
  const application = await getApplicantApplication(serviceClient, clean(found.app.organization_id), clean(found.app.application_id));
  const uploadsMap = await listApplicantUploadsMap0098(serviceClient, [clean(found.app.application_id)]);
  application.tasks = enrichApplicantTasksWithUploads0098(Array.isArray(application.tasks) ? application.tasks as JsonRecord[] : [], uploadsMap);
  const { data: style } = await serviceClient.from("core_customer_style_profiles").select("*").eq("organization_id", clean(found.app.organization_id)).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const showWaitlist = found.settings.show_waitlist_position === true;
  return {
    organization: found.organization,
    page: found.page,
    style_profile: style || null,
    settings: {
      portal_access_mode: found.settings.portal_access_mode || "accepted_onboarding",
      allow_applicant_updates: found.settings.allow_applicant_updates !== false,
      show_waitlist_position: showWaitlist,
    },
    application: { ...application, can_update: applicantCanUpdate0098(found.settings, found.app), waitlist_order: showWaitlist ? found.app.waitlist_order || null : null },
  };
}

function applicantPortalUpdatePayload0098(body: JsonRecord): JsonRecord {
  const payload: JsonRecord = { updated_at: new Date().toISOString(), last_applicant_update_at: new Date().toISOString() };
  const first = clean(body.first_name);
  const last = clean(body.last_name);
  if (first) payload.first_name = first;
  if (last) payload.last_name = last;
  if (first || last) payload.display_name = clean(`${first || clean(body.current_first_name)} ${last || clean(body.current_last_name)}`);
  if (Object.prototype.hasOwnProperty.call(body, "phone")) { payload.phone = clean(body.phone); payload.primary_phone = payload.phone; }
  payload.address_json = {
    address_1: clean(body.address_1), address_2: clean(body.address_2), city: clean(body.city), state: clean(body.state), zip: clean(body.zip),
  };
  payload.background_json = { employer: clean(body.employer), occupation: clean(body.occupation) };
  payload.employment_json = payload.background_json;
  payload.aviation_json = {
    pilot_certificate_number: clean(body.pilot_certificate_number), certificate_level: clean(body.certificate_level), ratings: clean(body.ratings), medical_class: clean(body.medical_class), last_medical_date: clean(body.last_medical_date) || null, total_hours: clean(body.total_hours), night_hours: clean(body.night_hours), ifr_hours: clean(body.ifr_hours), complex_hours: clean(body.complex_hours), aircraft_experience: clean(body.aircraft_experience), last_bfr: clean(body.last_bfr), other_clubs_fbos: clean(body.other_clubs_fbos), expected_flying: clean(body.expected_flying),
  };
  payload.interest_json = { why_join: clean(body.why_join), how_hear_us: clean(body.how_hear_us), referred_by: clean(body.referred_by), anything_else: clean(body.anything_else) };
  return payload;
}

async function applicantSavePortal0098(serviceClient: SupabaseClientAny, actorEmail: string, authUserId: string, body: JsonRecord): Promise<JsonRecord> {
  const found = await applicantPortalFindApplication0098(serviceClient, actorEmail, authUserId, clean(body.organization_id));
  if (!applicantCanUpdate0098(found.settings, found.app)) throw new Error("This application is not currently open for applicant updates.");
  const before = await getApplicantApplication(serviceClient, clean(found.app.organization_id), clean(found.app.application_id));
  const payload = applicantPortalUpdatePayload0098(body);
  if (!clean(payload.first_name || before.first_name) || !clean(payload.last_name || before.last_name)) throw new Error("First and last name are required.");
  const { error } = await serviceClient.from("core_applications").update(payload).eq("application_id", found.app.application_id).eq("email", actorEmail);
  if (error) throw error;
  await writeApplicantEvent(serviceClient, "applicant_self_updated", clean(found.app.application_id), clean(found.app.organization_id), actorEmail, "Applicant updated application from applicant portal.", before, payload, {});
  return await applicantGetPortal0098(serviceClient, actorEmail, authUserId, clean(found.app.organization_id));
}

function decodeApplicantUpload0098(value: unknown): Uint8Array {
  const raw = String(value || "");
  const base64 = raw.includes(",") ? raw.split(",").pop() || "" : raw;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeApplicantUploadMime0098(value: unknown): string {
  const mime = clean(value || "application/octet-stream").toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime)) return mime;
  throw new Error("Applicant uploads must be PDF, JPG, PNG, or WebP files.");
}

function applicantUploadExtension0098(mime: string, fileName: string): string {
  const ext = normalizeKey(clean(fileName).split(".").pop() || "");
  if (ext && ext.length <= 6) return ext;
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function applicantUploadTaskFile0098(serviceClient: SupabaseClientAny, actorEmail: string, authUserId: string, body: JsonRecord): Promise<JsonRecord> {
  const found = await applicantPortalFindApplication0098(serviceClient, actorEmail, authUserId, clean(body.organization_id));
  if (!applicantCanUpdate0098(found.settings, found.app)) throw new Error("This application is not currently open for applicant uploads.");
  const applicationId = clean(found.app.application_id);
  const taskId = requireString(body, "applicant_task_id");
  const { data: task, error: taskError } = await serviceClient.from("core_applicant_tasks").select("*").eq("application_id", applicationId).eq("applicant_task_id", taskId).maybeSingle();
  if (taskError) throw taskError;
  if (!task) throw new Error("Applicant task was not found.");
  const fileName = clean(body.file_name || "upload");
  const mime = safeApplicantUploadMime0098(body.mime_type || body.content_type);
  const bytes = decodeApplicantUpload0098(body.file_base64 || body.data_url);
  if (!bytes.length) throw new Error("Upload file data was missing.");
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Applicant uploads are limited to 10 MB.");
  const bucket = "core-applicant-documents";
  const ext = applicantUploadExtension0098(mime, fileName);
  const path = `organizations/${clean(found.app.organization_id)}/applicants/${applicationId}/tasks/${clean(task.task_key || taskId)}/${Date.now()}-${normalizeKey(fileName) || "upload"}.${ext}`;
  const { error: uploadError } = await serviceClient.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadError) throw uploadError;
  const { data: upload, error } = await serviceClient.from("core_applicant_task_uploads").insert({ application_id: applicationId, organization_id: clean(found.app.organization_id), applicant_task_id: taskId, applicant_user_id: authUserId || null, task_key: clean(task.task_key), storage_bucket: bucket, storage_path: path, original_file_name: fileName, mime_type: mime, file_size_bytes: bytes.length, upload_status: "submitted", visibility: "private", applicant_note: clean(body.applicant_note), uploaded_by_email: actorEmail, metadata_json: { version: "2026-06-10-098-B", source: "applicant_portal" } }).select("*").single();
  if (error) throw error;
  await serviceClient.from("core_applicant_tasks").update({ status: "in_progress", upload_status: "submitted", review_status: "submitted", updated_at: new Date().toISOString() }).eq("applicant_task_id", taskId);
  await serviceClient.from("core_applications").update({ ready_for_final_review: false, updated_at: new Date().toISOString() }).eq("application_id", applicationId);
  await writeApplicantEvent(serviceClient, "applicant_upload_submitted", applicationId, clean(found.app.organization_id), actorEmail, clean(task.label), null, upload, { task_key: task.task_key });
  return await applicantGetPortal0098(serviceClient, actorEmail, authUserId, clean(found.app.organization_id));
}

async function organizationReviewApplicantUpload0098(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const uploadId = requireString(body, "applicant_task_upload_id");
  const reviewStatus = normalizeKey(body.review_status || body.upload_status || body.status || "accepted").replace(/-/g, "_");
  const safeStatus = ["accepted", "rejected", "request_changes", "reviewing", "submitted"].includes(reviewStatus) ? reviewStatus : "accepted";
  const { data: upload, error: lookupError } = await serviceClient.from("core_applicant_task_uploads").select("*").eq("organization_id", organizationId).eq("applicant_task_upload_id", uploadId).maybeSingle();
  if (lookupError) throw lookupError;
  if (!upload) throw new Error("Applicant upload was not found.");
  const note = clean(body.review_note || body.note);
  const { data: saved, error } = await serviceClient.from("core_applicant_task_uploads").update({ upload_status: safeStatus, review_note: note, reviewed_by_email: actorEmail, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("applicant_task_upload_id", uploadId).select("*").single();
  if (error) throw error;
  const taskStatus = safeStatus === "accepted" ? "completed" : safeStatus === "request_changes" || safeStatus === "rejected" ? "blocked" : "in_progress";
  await serviceClient.from("core_applicant_tasks").update({ status: taskStatus, review_status: safeStatus, review_note: note, reviewed_by_email: actorEmail, reviewed_at: new Date().toISOString(), completed_at: safeStatus === "accepted" ? new Date().toISOString() : null, completed_by_email: safeStatus === "accepted" ? actorEmail : null, updated_at: new Date().toISOString() }).eq("applicant_task_id", clean(upload.applicant_task_id));
  await writeApplicantEvent(serviceClient, `upload_${safeStatus}`, clean(upload.application_id), organizationId, actorEmail, note, upload, saved, { applicant_task_upload_id: uploadId });
  return await getApplicantApplication(serviceClient, organizationId, clean(upload.application_id));
}

function applicantReadyForFinalReview0098(applicant: JsonRecord): boolean {
  const tasks = Array.isArray(applicant.tasks) ? applicant.tasks as JsonRecord[] : [];
  const required = tasks.filter((task) => task.is_required !== false && !task.archived_at);
  return required.length > 0 && required.every((task) => ["completed", "waived"].includes(normalizeKey(task.status || "")) || ["accepted"].includes(normalizeKey(task.review_status || "")));
}


async function organizationUpdateApplicantSettings0098(serviceClient: SupabaseClientAny, organizationId: string, body: JsonRecord, actorEmail: string): Promise<JsonRecord> {
  const payload: JsonRecord = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, "portal_access_mode")) payload.portal_access_mode = portalAccessMode0098(body.portal_access_mode);
  if (Object.prototype.hasOwnProperty.call(body, "allow_applicant_updates")) payload.allow_applicant_updates = body.allow_applicant_updates !== false;
  if (Object.prototype.hasOwnProperty.call(body, "show_waitlist_position")) payload.show_waitlist_position = body.show_waitlist_position === true;
  const { data: existing, error: existingError } = await serviceClient.from("core_applicant_settings").select("*").eq("organization_id", organizationId).maybeSingle();
  if (existingError) throw existingError;
  let saved: JsonRecord;
  if (existing?.applicant_settings_id) {
    const { data, error } = await serviceClient.from("core_applicant_settings").update(payload).eq("organization_id", organizationId).select("*").single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await serviceClient.from("core_applicant_settings").insert({ organization_id: organizationId, ...payload }).select("*").single();
    if (error) throw error;
    saved = data;
  }
  await writeApplicantEvent(serviceClient, "applicant_settings_updated", null, organizationId, actorEmail, "Applicant portal settings updated.", existing || null, saved, {});
  return saved;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "method_not_allowed", message: "Use POST." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(500, { ok: false, error: "missing_environment", message: "Missing Supabase environment variables." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse(401, { ok: false, error: "missing_auth", message: "Missing Authorization bearer token." });

  const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authData?.user?.id || !authData?.user?.email) {
    return jsonResponse(401, { ok: false, error: "invalid_auth", message: "Could not verify authenticated user." });
  }

  const authUser = authData.user as JsonRecord;
  const actorEmail = normalizeEmail(authUser.email);
  const platformAdmin = await isPlatformAdmin(serviceClient, actorEmail);

  let body: JsonRecord;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json", message: "Request body must be valid JSON." });
  }

  const action = clean(body.action);

  try {
    const person = await ensurePersonForAuthUser(serviceClient, authUser);
    const personId = clean(person.person_id);

    if (action === "ping") {
      return jsonResponse(200, { ok: true, action, email: actorEmail, platform_admin: platformAdmin });
    }

    if (action === "applicant_get_my_portal") {
      const result = await applicantGetPortal0098(serviceClient, actorEmail, clean(authUser.id), clean(body.organization_id));
      return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
    }

    if (action === "applicant_save_my_application") {
      const result = await applicantSavePortal0098(serviceClient, actorEmail, clean(authUser.id), body);
      return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
    }

    if (action === "applicant_upload_task_file") {
      const result = await applicantUploadTaskFile0098(serviceClient, actorEmail, clean(authUser.id), body);
      return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
    }

    if (action === "get_my_access") {
      const organizationId = optionalString(body, "organization_id", "");
      const access = platformAdmin ? await buildPlatformAccess(serviceClient, organizationId) : await buildAccess(serviceClient, personId);
      return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, access });
    }

    if (action === "get_member_dashboard" || action === "get_user_dashboard") {
      const organizationId = optionalString(body, "organization_id", "");
      if (platformAdmin) {
        const access = await buildPlatformAccess(serviceClient, organizationId);
        return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: true, platform_override: true, access });
      }
      const access = await buildAccess(serviceClient, personId);
      const visibleAccess = organizationId ? access.filter((row) => clean(row.organization_id) === organizationId) : access;
      const allowed = visibleAccess.filter((row) => !row.blocks_access && (Boolean((row.capabilities as JsonRecord)?.can_view_user_dashboard) || Boolean((row.capabilities as JsonRecord)?.can_view_organization_admin)));
      if (organizationId && !allowed.length) throw new Error("You do not have user dashboard access to this organization.");
      return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, access: allowed });
    }

    if (action === "get_customer_admin_dashboard" || action === "get_organization_admin_dashboard") {
      const organizationId = requireString(body, "organization_id");
      const accessRow = platformAdmin
        ? (await buildPlatformAccess(serviceClient, organizationId))[0]
        : await requireMembershipAccess(serviceClient, personId, organizationId, "organization.admin.open");
      if (!accessRow) throw new Error("Organization not found.");
      return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, platform_override: platformAdmin, access: accessRow });
    }



    if (action.startsWith("member_")) {
      const organizationId = requireString(body, "organization_id");

      if (action === "member_get_my_profile") {
        const result = await memberGetMyProfile(serviceClient, organizationId, personId, platformAdmin);
        return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
      }

      if (action === "member_save_my_profile") {
        const result = await memberSaveMyProfile(serviceClient, organizationId, personId, platformAdmin, body);
        await writeAudit(serviceClient, actorEmail, "member_self_service", action, "core_people", personId, { organization_id: organizationId, fields: ["preferred_first_name", "middle_name", "suffix", "phone", "text_capable", "address", "emergency_contact"] }, { person_id: personId });
        return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
      }

      if (action === "member_upload_profile_photo" || action === "member_remove_profile_photo") {
        const result = action === "member_remove_profile_photo"
          ? await memberRemoveProfilePhoto(serviceClient, organizationId, personId, platformAdmin)
          : await memberSaveProfilePhoto(serviceClient, organizationId, personId, platformAdmin, actorEmail, body);
        await writeAudit(serviceClient, actorEmail, "member_self_service", action, "core_people", personId, { organization_id: organizationId, file_name: clean(body.file_name), content_type: clean(body.content_type) }, { person_id: personId, photo_url: clean((result.profile as JsonRecord)?.photo_url) });
        return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
      }

      if (action === "member_request_email_change") {
        const result = await memberRequestEmailChange(serviceClient, organizationId, personId, platformAdmin, clean(authUser.id), body);
        await writeAudit(serviceClient, actorEmail, "member_self_service", action, "auth.users", clean(authUser.id), { organization_id: organizationId, requested_email: normalizeEmail(body.new_email || body.email) }, { requested: true });
        return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
      }

      if (action === "member_list_events") {
        const result = await memberListEvents(serviceClient, organizationId, personId, platformAdmin);
        return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
      }

      if (action === "member_get_event_rsvp_context") {
        const eventId = requireString(body, "event_id");
        const result = await memberGetEventRsvpContext(serviceClient, organizationId, eventId, personId, platformAdmin);
        return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
      }

      if (action === "member_save_event_rsvp") {
        const result = await memberSaveEventRsvp(serviceClient, organizationId, body, person, personId, platformAdmin, actorEmail);
        await writeAudit(serviceClient, actorEmail, "member_self_service", action, "core_event_rsvps", clean((result.existing_rsvp as JsonRecord | undefined)?.rsvp_id), { organization_id: organizationId, event_id: clean(body.event_id), response_status: clean(body.response_status) }, { saved: true });
        return jsonResponse(200, { ok: true, action, user: { id: authUser.id, email: actorEmail }, person, platform_admin: platformAdmin, ...result });
      }

      return jsonResponse(400, { ok: false, error: "unknown_member_action", message: `Unknown member action: ${action}` });
    }

    if (action.startsWith("organization_")) {
      const organizationId = requireString(body, "organization_id");

      if (action === "organization_list_access_vocabulary") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.view_roster", "people.manage_members", "people.manage_applicants"]);
        const options = await fetchPeopleVocabulary(serviceClient, organizationId);
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...options });
      }


      if (action === "organization_list_events_manager") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["events.manage", "organization.view_admin", "organization.manage_settings"]);
        const result = await organizationListEventsManager(serviceClient, organizationId, actorAccess);
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...result });
      }

      if (action === "organization_save_event") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["events.manage", "organization.view_admin", "organization.manage_settings"]);
        const result = await organizationSaveEvent(serviceClient, organizationId, body, actorEmail, actorAccess);
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...result });
      }

      if (action === "organization_upload_event_image") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["events.manage", "organization.view_admin", "organization.manage_settings"]);
        const result = await organizationUploadEventImage(serviceClient, organizationId, body, actorEmail, actorAccess);
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...result });
      }

      if (action === "organization_archive_event" || action === "organization_restore_event") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["events.manage", "organization.view_admin", "organization.manage_settings"]);
        const eventId = requireString(body, "event_id");
        const result = await organizationSetEventArchiveState(serviceClient, organizationId, eventId, action === "organization_archive_event", actorEmail, actorAccess);
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...result });
      }

      if (action === "organization_list_event_rsvps") {
        const eventId = requireString(body, "event_id");
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["events.manage", "organization.view_admin", "organization.manage_settings"]);
        const result = await organizationListEventRsvps(serviceClient, organizationId, eventId, actorAccess);
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...result });
      }

      if (action === "organization_save_event_rsvp") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["events.manage", "organization.view_admin", "organization.manage_settings"]);
        const result = await organizationSaveEventRsvp(serviceClient, organizationId, body, actorEmail, actorAccess);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_event_rsvps", clean(body.rsvp_id), body, { event_id: clean(body.event_id), saved: true });
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...result });
      }

      if (action === "organization_list_roster") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.view_roster", "people.manage_members", "people.manage_applicants"]);
        const page = await getPortalPageForAction(serviceClient, organizationId, "roster", platformAdmin);
        const roster = await listOrganizationRoster(serviceClient, organizationId, body);
        return jsonResponse(200, { ok: true, action, access: actorAccess, page, ...roster });
      }

      if (action === "organization_list_documents") {
        const scope = documentScopeFromBody(body);
        const pageKey = scope === "internal" ? "internal-documents" : "member-documents";
        const actorAccess = platformAdmin
          ? (await buildPlatformAccess(serviceClient, organizationId))[0]
          : await requireMembershipAccess(serviceClient, personId, organizationId);
        if (!actorAccess) throw new Error("Organization access not found.");
        if (!platformAdmin && !actorCanViewDocumentScope(actorAccess, scope)) {
          throw new Error(scope === "internal" ? "You do not have access to internal documents." : "You do not have access to member documents.");
        }
        const page = await getPortalPageForAction(serviceClient, organizationId, pageKey, platformAdmin);
        const docs = await listOrganizationDocumentsForScope(serviceClient, organizationId, scope, body);
        return jsonResponse(200, { ok: true, action, access: actorAccess, page, document_scope: scope, ...docs });
      }

      if (action === "organization_list_contact_inquiries") {
        const actorAccess = await requireContactTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        const page = await getPortalPageForAction(serviceClient, organizationId, "contact-tracker", platformAdmin);
        const settings = await getContactSettings(serviceClient, organizationId);
        const templates = await listContactReplyTemplatesForAdmin(serviceClient, organizationId);
        const result = await listContactInquiries(serviceClient, organizationId, body);
        return jsonResponse(200, { ok: true, action, access: actorAccess, person, page, settings, reply_templates: templates, ...result });
      }

      if (action === "organization_update_contact_inquiry") {
        const actorAccess = await requireContactTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "contact-tracker", platformAdmin);
        const inquiry = await updateContactInquiry(serviceClient, organizationId, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_contact_inquiries", clean(inquiry.contact_inquiry_id), body, { contact_inquiry_id: inquiry.contact_inquiry_id, status: inquiry.status });
        return jsonResponse(200, { ok: true, action, access: actorAccess, inquiry });
      }

      if (action === "organization_bulk_update_contact_inquiries") {
        const actorAccess = await requireContactTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "contact-tracker", platformAdmin);
        const result = await bulkUpdateContactInquiries(serviceClient, organizationId, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_contact_inquiries", organizationId, body, { updated_count: result.updated_count, failed_count: result.failed_count });
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...result });
      }

      if (action === "organization_send_contact_reply") {
        const actorAccess = await requireContactTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "contact-tracker", platformAdmin);
        const result = await sendContactReply(serviceClient, organizationId, body, actorEmail, person);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_contact_inquiries", clean(body.contact_inquiry_id), { ...body, body_text: body.body_text ? "[redacted_email_body]" : undefined, message: body.message ? "[redacted_email_body]" : undefined }, result);
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...result });
      }


      if (action === "organization_upsert_contact_reply_template") {
        const actorAccess = await requireContactTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "contact-tracker", platformAdmin);
        const template = await upsertContactReplyTemplate(serviceClient, organizationId, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_contact_reply_templates", clean(template.contact_reply_template_id), { ...body, body_text: "[redacted_template_body]", body_html: "[redacted_template_html]" }, { contact_reply_template_id: template.contact_reply_template_id, template_key: template.template_key });
        return jsonResponse(200, { ok: true, action, access: actorAccess, template, reply_templates: await listContactReplyTemplatesForAdmin(serviceClient, organizationId) });
      }

      if (action === "organization_archive_contact_reply_template") {
        const actorAccess = await requireContactTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "contact-tracker", platformAdmin);
        const template = await archiveContactReplyTemplate(serviceClient, organizationId, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_contact_reply_templates", clean(template.contact_reply_template_id), body, { contact_reply_template_id: template.contact_reply_template_id, template_key: template.template_key });
        return jsonResponse(200, { ok: true, action, access: actorAccess, template, reply_templates: await listContactReplyTemplatesForAdmin(serviceClient, organizationId) });
      }

      if (action === "organization_update_applicant_settings") {
        const actorAccess = await requireApplicantTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "applicant-tracker", platformAdmin);
        const settings = await organizationUpdateApplicantSettings0098(serviceClient, organizationId, body, actorEmail);
        return jsonResponse(200, { ok: true, action, access: actorAccess, settings });
      }

      if (action === "organization_add_applicant_note") {
        const actorAccess = await requireApplicantTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "applicant-tracker", platformAdmin);
        const note = await addApplicantTimelineNote0099(serviceClient, organizationId, body, actorEmail, person);
        const applicant = await getApplicantApplication(serviceClient, organizationId, clean(body.application_id));
        return jsonResponse(200, { ok: true, action, access: actorAccess, note, applicant });
      }

      if (action === "organization_list_applicants") {
        const actorAccess = await requireApplicantTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        const page = await getPortalPageForAction(serviceClient, organizationId, "applicant-tracker", platformAdmin);
        const settings = await getApplicantSettings(serviceClient, organizationId);
        const templates = await listApplicantReplyTemplates(serviceClient, organizationId);
        const workflow_stages = await listApplicantWorkflowStages0099(serviceClient, organizationId);
        const task_definitions = await listApplicantTaskDefinitions0099(serviceClient, organizationId);
        const result = await listApplicantApplications(serviceClient, organizationId, body);
        return jsonResponse(200, { ok: true, action, access: actorAccess, person, page, settings, reply_templates: templates, workflow_stages, task_definitions, ...result });
      }

      if (action === "organization_update_applicant") {
        const actorAccess = await requireApplicantTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "applicant-tracker", platformAdmin);
        const applicant = await updateApplicantApplication(serviceClient, organizationId, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_applications", clean(applicant.application_id), body, { application_id: applicant.application_id, status: applicant.status });
        return jsonResponse(200, { ok: true, action, access: actorAccess, applicant });
      }

      if (action === "organization_update_applicant_task") {
        const actorAccess = await requireApplicantTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "applicant-tracker", platformAdmin);
        const task = await updateApplicantTask(serviceClient, organizationId, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_applicant_tasks", clean(task.applicant_task_id), body, { applicant_task_id: task.applicant_task_id, status: task.status });
        return jsonResponse(200, { ok: true, action, access: actorAccess, task });
      }

      if (action === "organization_review_applicant_upload") {
        const actorAccess = await requireApplicantTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "applicant-tracker", platformAdmin);
        const applicant = await organizationReviewApplicantUpload0098(serviceClient, organizationId, body, actorEmail);
        return jsonResponse(200, { ok: true, action, access: actorAccess, applicant });
      }

      if (action === "organization_send_applicant_reply") {
        const actorAccess = await requireApplicantTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "applicant-tracker", platformAdmin);
        const result = await sendApplicantReply(serviceClient, organizationId, body, actorEmail, person);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_applications", clean(body.application_id), { ...body, body_text: body.body_text ? "[redacted_email_body]" : undefined, message: body.message ? "[redacted_email_body]" : undefined }, result);
        return jsonResponse(200, { ok: true, action, access: actorAccess, ...result });
      }

      if (action === "organization_upsert_applicant_reply_template") {
        const actorAccess = await requireApplicantTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "applicant-tracker", platformAdmin);
        const template = await upsertApplicantReplyTemplate(serviceClient, organizationId, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_applicant_reply_templates", clean(template.applicant_reply_template_id), { ...body, body_text: "[redacted_template_body]", body_html: "[redacted_template_html]" }, { applicant_reply_template_id: template.applicant_reply_template_id, template_key: template.template_key });
        return jsonResponse(200, { ok: true, action, access: actorAccess, template, reply_templates: await listApplicantReplyTemplates(serviceClient, organizationId) });
      }

      if (action === "organization_archive_applicant_reply_template") {
        const actorAccess = await requireApplicantTrackerAccess(serviceClient, personId, organizationId, platformAdmin);
        await getPortalPageForAction(serviceClient, organizationId, "applicant-tracker", platformAdmin);
        const template = await archiveApplicantReplyTemplate(serviceClient, organizationId, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_applicant_reply_templates", clean(template.applicant_reply_template_id), body, { applicant_reply_template_id: template.applicant_reply_template_id, template_key: template.template_key });
        return jsonResponse(200, { ok: true, action, access: actorAccess, template, reply_templates: await listApplicantReplyTemplates(serviceClient, organizationId) });
      }


      if (action === "organization_list_people") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.manage_members", "people.manage_applicants", "access.manage_memberships"]);
        const page = await getPortalPageForAction(serviceClient, organizationId, "organization-people", platformAdmin);
        const people = await listOrganizationPeople(serviceClient, organizationId, body);
        return jsonResponse(200, { ok: true, action, access: actorAccess, page, people });
      }

      if (action === "organization_add_person_note") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.manage_members", "people.manage_applicants", "access.manage_memberships"]);
        await getPortalPageForAction(serviceClient, organizationId, "organization-people", platformAdmin);
        const note = await addPersonTimelineNote0099(serviceClient, organizationId, body, actorEmail, person);
        return jsonResponse(200, { ok: true, action, access: actorAccess, note, notes: await listPersonTimelineNotes0099(serviceClient, organizationId, clean(body.person_id)) });
      }

      if (action === "organization_get_person") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.manage_members", "people.manage_applicants", "access.manage_memberships"]);
        const page = await getPortalPageForAction(serviceClient, organizationId, "organization-people", platformAdmin);
        const selectedPerson = await getOrganizationPerson(serviceClient, organizationId, body);
        const person_notes = await listPersonTimelineNotes0099(serviceClient, organizationId, clean(selectedPerson.person_id || body.person_id));
        return jsonResponse(200, { ok: true, action, access: actorAccess, page, person: { ...selectedPerson, timeline_notes: person_notes }, person_notes });
      }

      if (action === "organization_save_person") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.manage_members", "people.manage_applicants", "access.manage_memberships"]);
        await getPortalPageForAction(serviceClient, organizationId, "organization-people", platformAdmin);
        const savedPerson = await saveOrganizationPerson(serviceClient, body, actorEmail, actorAccess, personId);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_people", clean(savedPerson.person_id), body, { person_id: savedPerson.person_id, membership_id: savedPerson.membership_id });
        return jsonResponse(200, { ok: true, action, person: savedPerson });
      }

      if (action === "organization_upload_person_photo" || action === "organization_remove_person_photo") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.manage_members", "people.manage_applicants", "access.manage_memberships"]);
        await getPortalPageForAction(serviceClient, organizationId, "organization-people", platformAdmin);
        const savedPerson = action === "organization_remove_person_photo"
          ? await removeOrganizationPersonPhoto(serviceClient, organizationId, body, actorAccess)
          : await saveOrganizationPersonPhoto(serviceClient, organizationId, body, actorAccess, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_people", clean(savedPerson.person_id), { organization_id: organizationId, person_id: savedPerson.person_id, membership_id: savedPerson.membership_id, remove_photo: action === "organization_remove_person_photo", file_name: clean(body.file_name), content_type: clean(body.content_type) }, { person_id: savedPerson.person_id, membership_id: savedPerson.membership_id, photo_url: personPhotoUrl(jsonObject(savedPerson.profile_json)) });
        return jsonResponse(200, { ok: true, action, person: savedPerson });
      }

      if (action === "organization_archive_membership" || action === "organization_restore_membership") {
        const actorAccess = platformAdmin ? (await buildPlatformAccess(serviceClient, organizationId))[0] : await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.manage_members", "people.manage_applicants", "access.manage_memberships"]);
        await getPortalPageForAction(serviceClient, organizationId, "organization-people", platformAdmin);
        const archivedPerson = await archiveOrRestoreOrganizationMembership(serviceClient, organizationId, body, actorEmail, actorAccess, personId, action === "organization_archive_membership");
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "core_organization_memberships", clean(archivedPerson.membership_id), body, { person_id: archivedPerson.person_id, membership_id: archivedPerson.membership_id });
        return jsonResponse(200, { ok: true, action, person: archivedPerson });
      }

      if (action === "organization_send_invite") {
        if (!platformAdmin) await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.manage_members", "people.manage_applicants", "access.manage_memberships"]);
        await getPortalPageForAction(serviceClient, organizationId, "organization-people", platformAdmin);
        const result = await sendOrganizationInvite(serviceClient, organizationId, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "auth.users", clean(result.auth_user_id), body, result);
        return jsonResponse(200, { ok: true, action, ...result });
      }

      if (action === "organization_send_password_reset") {
        if (!platformAdmin) await requireAnyMembershipAccess(serviceClient, personId, organizationId, ["people.manage_members", "people.manage_applicants", "access.manage_memberships"]);
        await getPortalPageForAction(serviceClient, organizationId, "organization-people", platformAdmin);
        const result = await sendOrganizationPasswordReset(serviceClient, organizationId, body);
        await writeAudit(serviceClient, actorEmail, "organization_admin", action, "auth.users", null, body, result);
        return jsonResponse(200, { ok: true, action, ...result });
      }

      return jsonResponse(400, { ok: false, error: "unknown_organization_action", message: `Unknown organization action: ${action}` });
    }

    if (action.startsWith("platform_")) {
      if (!platformAdmin) return jsonResponse(403, { ok: false, error: "not_platform_admin", message: "This access setup action requires a platform admin." });

      if (action === "platform_list_organizations") {
        const organizations = await listOrganizations(serviceClient);
        return jsonResponse(200, { ok: true, action, organizations });
      }

      if (action === "platform_list_people") {
        const people = await listPeople(serviceClient, body);
        return jsonResponse(200, { ok: true, action, people });
      }

      if (action === "platform_list_role_status_options" || action === "platform_list_access_vocabulary") {
        const organizationId = requireString(body, "organization_id");
        const options = await listRoleStatusOptions(serviceClient, organizationId);
        return jsonResponse(200, { ok: true, action, ...options });
      }

      if (action === "platform_list_memberships") {
        const memberships = await listMemberships(serviceClient, body);
        return jsonResponse(200, { ok: true, action, memberships });
      }

      if (action === "platform_invite_auth_user_by_email") {
        const result = await inviteAuthUserByEmail(serviceClient, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "platform_admin", action, "auth.users", clean(result.auth_user_id), body, result);
        return jsonResponse(200, { ok: true, action, ...result });
      }

      if (action === "platform_upsert_person") {
        const savedPerson = await upsertPerson(serviceClient, body);
        await writeAudit(serviceClient, actorEmail, "platform_admin", action, "core_people", clean(savedPerson.person_id), body, { person_id: savedPerson.person_id });
        return jsonResponse(200, { ok: true, action, person: savedPerson });
      }

      if (action === "platform_link_auth_user_by_email") {
        const result = await linkAuthUserByEmail(serviceClient, body);
        await writeAudit(serviceClient, actorEmail, "platform_admin", action, "core_person_user_links", clean((result.link as JsonRecord | undefined)?.person_user_link_id), body, result);
        return jsonResponse(200, { ok: true, action, ...result });
      }

      if (action === "platform_upsert_membership") {
        const membership = await upsertMembership(serviceClient, body, actorEmail);
        await writeAudit(serviceClient, actorEmail, "platform_admin", action, "core_organization_memberships", clean(membership.membership_id), body, { membership_id: membership.membership_id });
        return jsonResponse(200, { ok: true, action, membership });
      }

      if (action === "platform_seed_self_as_org_admin") {
        const organizationId = requireString(body, "organization_id");
        const savedPerson = await upsertPerson(serviceClient, { primary_email: actorEmail, display_name: actorEmail, status: "active" });
        const membership = await upsertMembership(serviceClient, {
          organization_id: organizationId,
          person_id: savedPerson.person_id,
          status_key: "active",
          role_keys: ["organization-admin"],
          title: "Platform Admin Test Access",
          membership_settings_json: { platform_internal: true },
        }, actorEmail);
        await writeAudit(serviceClient, actorEmail, "platform_admin", action, "core_organization_memberships", clean(membership.membership_id), body, { membership_id: membership.membership_id });
        return jsonResponse(200, { ok: true, action, person: savedPerson, membership });
      }

      return jsonResponse(400, { ok: false, error: "unknown_platform_action", message: `Unknown platform action: ${action}` });
    }

    return jsonResponse(400, { ok: false, error: "unknown_action", message: `Unknown action: ${action || "(blank)"}` });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: "access_action_failed", action, message: error instanceof Error ? error.message : String(error) });
  }
});
